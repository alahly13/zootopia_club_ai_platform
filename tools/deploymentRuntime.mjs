import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const MANIFEST_RELATIVE_PATH = path.join('deployment', 'runtime-manifest.json');

function fail(message) {
  console.error(`[deploy] ${message}`);
  process.exit(1);
}

function repoPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

function displayPath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function resolveRepoFile(relativePath, label) {
  const absolutePath = repoPath(relativePath);
  if (!existsSync(absolutePath)) {
    fail(`${label} is missing at ${displayPath(relativePath)}.`);
  }

  return {
    absolutePath,
    relativePath: displayPath(relativePath),
  };
}

const manifestFile = resolveRepoFile(MANIFEST_RELATIVE_PATH, 'Deployment runtime manifest');
const manifest = JSON.parse(readFileSync(manifestFile.absolutePath, 'utf8'));

const runtimeContract =
  manifest.runtimeContract && typeof manifest.runtimeContract === 'object'
    ? manifest.runtimeContract
    : {};
const backendEntryPoint = String(manifest.backend?.entryPoint || '');
const healthcheckPath = String(manifest.backend?.healthcheckPath || '/api/health');
const frontendOutputDirectory = String(manifest.frontend?.outputDirectory || 'dist');
const backendContainerDockerfilePath = String(manifest.backend?.container?.dockerfilePath || '');
const nodeVersion = String(runtimeContract.nodeVersion || '').trim();
const pythonVersion = String(runtimeContract.pythonVersion || '').trim();
const nodeVersionFiles = Array.isArray(runtimeContract.versionFiles?.node)
  ? runtimeContract.versionFiles.node.map((value) => String(value))
  : [];
const pythonVersionFiles = Array.isArray(runtimeContract.versionFiles?.python)
  ? runtimeContract.versionFiles.python.map((value) => String(value))
  : [];
const preferredBootstrapCommands =
  manifest.python?.preferredBootstrapCommands &&
  typeof manifest.python.preferredBootstrapCommands === 'object'
    ? manifest.python.preferredBootstrapCommands
    : {};
const windowsBootstrapCommands = Array.isArray(preferredBootstrapCommands.windows)
  ? preferredBootstrapCommands.windows
  : [];
const posixBootstrapCommands = Array.isArray(preferredBootstrapCommands.posix)
  ? preferredBootstrapCommands.posix
  : [];
const pythonRequirementsPath = String(manifest.python?.requirementsPath || '');
const pythonWorkerScriptPath = String(manifest.python?.workerScriptPath || '');
const pythonVenvDirectory = String(manifest.python?.venvDirectory || '.venv');
const requiredPythonPackages = Array.isArray(manifest.python?.requiredPackages)
  ? manifest.python.requiredPackages
  : [];
const deploymentTargets =
  manifest.deploymentTargets && typeof manifest.deploymentTargets === 'object'
    ? manifest.deploymentTargets
    : {};

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function spawnCommand(command, args, { env, stdio = 'inherit' } = {}) {
  const runtimeEnv = {
    ...process.env,
    ...env,
  };

  if (process.platform === 'win32') {
    return spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        ['&', quotePowerShell(command), ...args.map(quotePowerShell)].join(' '),
      ],
      {
        cwd: process.cwd(),
        env: runtimeEnv,
        stdio,
      }
    );
  }

  return spawnSync(command, args, {
    cwd: process.cwd(),
    env: runtimeEnv,
    stdio,
  });
}

function run(command, args, options = {}) {
  console.log(`[deploy] Running: ${[command, ...args].join(' ')}`);
  const result = spawnCommand(command, args, options);

  if (result.error) {
    fail(`Command failed to start: ${command} (${result.error.message}).`);
  }

  if ((result.status ?? 0) !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function capture(command, args, options = {}) {
  const result = spawnCommand(command, args, {
    ...options,
    stdio: 'pipe',
  });

  return {
    ok: !result.error && (result.status ?? 0) === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error,
  };
}

function readPinnedRequirements(filePath) {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function normalizeRequirementName(requirement) {
  return requirement.split(/[<>=!~]/u)[0].trim().toLowerCase();
}

function normalizeVersionPrefix(version) {
  return String(version || '').trim().replace(/\.x$/u, '');
}

function formatCommand(command, args = []) {
  return [command, ...args].join(' ');
}

function normalizeCommandSpec(specification) {
  if (typeof specification === 'string' && specification.trim()) {
    return {
      command: specification.trim(),
      args: [],
    };
  }

  if (Array.isArray(specification) && specification.length > 0) {
    const [command, ...args] = specification;
    const normalizedCommand = String(command || '').trim();
    if (!normalizedCommand) {
      return null;
    }

    return {
      command: normalizedCommand,
      args: args.map((value) => String(value)),
    };
  }

  return null;
}

function bootstrapPythonCandidates() {
  const configuredCandidates =
    process.platform === 'win32' ? windowsBootstrapCommands : posixBootstrapCommands;
  const normalizedConfiguredCandidates = configuredCandidates
    .map(normalizeCommandSpec)
    .filter(Boolean);
  if (normalizedConfiguredCandidates.length > 0) {
    return normalizedConfiguredCandidates;
  }

  const fallbackCandidates =
    process.platform === 'win32'
      ? [['python'], ['py']]
      : [['python3'], ['python']];

  return fallbackCandidates.map(normalizeCommandSpec).filter(Boolean);
}

function inspectPythonCandidate(candidate) {
  const result = capture(candidate.command, [
    ...candidate.args,
    '-c',
    "import json, sys; print(json.dumps({'version': f'{sys.version_info[0]}.{sys.version_info[1]}', 'executable': sys.executable}))",
  ]);

  if (!result.ok) {
    return null;
  }

  try {
    const payload = JSON.parse(result.stdout || '{}');
    const executable = String(payload.executable || '').trim();
    const detectedVersion = String(payload.version || '').trim();
    if (!executable) {
      return null;
    }

    return {
      command: executable,
      detectedVersion,
      displayCommand: formatCommand(candidate.command, candidate.args),
    };
  } catch {
    return null;
  }
}

function ensureVersionFilesMatch({ files, expectedVersion, label, platform }) {
  const expectedPrefix = normalizeVersionPrefix(expectedVersion);

  for (const relativePath of files) {
    const versionFile = resolveRepoFile(relativePath, `${label} version file`);
    const declaredVersion = readFileSync(versionFile.absolutePath, 'utf8').trim();

    if (!declaredVersion) {
      fail(`${platform}: ${versionFile.relativePath} is empty.`);
    }

    if (expectedPrefix && !declaredVersion.startsWith(expectedPrefix)) {
      fail(
        `${platform}: ${versionFile.relativePath} declares "${declaredVersion}" but deployment/runtime-manifest.json expects ${expectedVersion}.`
      );
    }

    console.log(
      `[deploy] ${platform}: verified ${label} version file ${versionFile.relativePath} -> ${declaredVersion}`
    );
  }
}

function verifyDeploymentTargets({ platform }) {
  const targets = Object.entries(deploymentTargets);
  if (targets.length === 0) {
    fail(`${platform}: deployment/runtime-manifest.json does not declare any deploymentTargets.`);
  }

  return targets.map(([targetName, rawTarget]) => {
    const target = rawTarget && typeof rawTarget === 'object' ? rawTarget : {};
    const intent = String(target.intent || '').trim();
    const strategy = String(target.strategy || '').trim();
    const contractPaths = Array.isArray(target.contractPaths)
      ? target.contractPaths
          .map((item) => String(item || '').trim())
          .filter((item) => item.length > 0)
      : [];

    if (!intent) {
      fail(`${platform}: deployment target "${targetName}" is missing intent.`);
    }

    if (!strategy) {
      fail(`${platform}: deployment target "${targetName}" is missing strategy.`);
    }

    if (contractPaths.length === 0) {
      fail(`${platform}: deployment target "${targetName}" is missing contractPaths.`);
    }

    const resolvedContracts = contractPaths.map((contractPath) =>
      resolveRepoFile(contractPath, `${targetName} deployment contract`)
    );

    const commandSummary = ['bootstrapCommand', 'buildCommand', 'startCommand', 'verifyCommand']
      .map((key) => String(target[key] || '').trim())
      .filter((value) => value.length > 0)
      .join(' | ');

    console.log(
      `[deploy] ${platform}: ${targetName} -> ${intent} via ${strategy} (${resolvedContracts
        .map((contract) => contract.relativePath)
        .join(', ')})${commandSummary ? ` [${commandSummary}]` : ''}`
    );

    return {
      name: targetName,
      intent,
      strategy,
      contracts: resolvedContracts,
    };
  });
}

function resolveVenvPythonPath() {
  const candidates = [
    path.join(process.cwd(), pythonVenvDirectory, 'Scripts', 'python.exe'),
    path.join(process.cwd(), pythonVenvDirectory, 'Scripts', 'python'),
    path.join(process.cwd(), pythonVenvDirectory, 'bin', 'python'),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function resolveBootstrapPythonCommand() {
  let fallbackCandidate = null;
  const expectedPythonVersion = normalizeVersionPrefix(pythonVersion);

  for (const candidate of bootstrapPythonCandidates()) {
    const resolvedCandidate = inspectPythonCandidate(candidate);
    if (resolvedCandidate) {
      console.log(
        `[deploy] Bootstrap Python detected via: ${resolvedCandidate.displayCommand} (${resolvedCandidate.detectedVersion} -> ${resolvedCandidate.command})`
      );

      if (!fallbackCandidate) {
        fallbackCandidate = resolvedCandidate;
      }

      if (!expectedPythonVersion || resolvedCandidate.detectedVersion === expectedPythonVersion) {
        return resolvedCandidate.command;
      }
    }
  }

  if (fallbackCandidate) {
    if (expectedPythonVersion) {
      console.warn(
        `[deploy] Preferred Python ${expectedPythonVersion} was not found on PATH. Falling back to ${fallbackCandidate.detectedVersion} via ${fallbackCandidate.command}.`
      );
    }

    return fallbackCandidate.command;
  }

  fail(
    'Python was not found on PATH. Install Python first, then rerun the deployment helper.'
  );
}

function verifyManifestAndPaths({ platform }) {
  if (!nodeVersion) {
    fail(`${platform}: deployment/runtime-manifest.json is missing runtimeContract.nodeVersion.`);
  }

  if (!pythonVersion) {
    fail(`${platform}: deployment/runtime-manifest.json is missing runtimeContract.pythonVersion.`);
  }

  const entryPoint = resolveRepoFile(backendEntryPoint, 'Backend entrypoint');
  const backendContainerDockerfile = backendContainerDockerfilePath
    ? resolveRepoFile(backendContainerDockerfilePath, 'Backend container Dockerfile')
    : null;
  const requirements = resolveRepoFile(
    pythonRequirementsPath,
    'Python extraction requirements file'
  );
  const workerScript = resolveRepoFile(
    pythonWorkerScriptPath,
    'Python extraction worker script'
  );

  const pinnedRequirements = readPinnedRequirements(requirements.absolutePath);
  if (pinnedRequirements.length === 0) {
    fail(`No pinned Python extraction packages were found in ${requirements.relativePath}.`);
  }

  const manifestPackageNames = requiredPythonPackages.map((item) =>
    String(item?.name || '').trim().toLowerCase()
  );
  const requirementsPackageNames = pinnedRequirements.map(normalizeRequirementName);
  const missingInRequirements = manifestPackageNames.filter(
    (name) => !requirementsPackageNames.includes(name)
  );
  const missingInManifest = requirementsPackageNames.filter(
    (name) => !manifestPackageNames.includes(name)
  );

  if (missingInRequirements.length > 0 || missingInManifest.length > 0) {
    fail(
      `${platform}: deployment/runtime-manifest.json and ${requirements.relativePath} are out of sync. ` +
        `Missing in requirements: ${missingInRequirements.join(', ') || 'none'}. ` +
        `Missing in manifest: ${missingInManifest.join(', ') || 'none'}.`
    );
  }

  ensureVersionFilesMatch({
    files: nodeVersionFiles,
    expectedVersion: nodeVersion,
    label: 'Node runtime',
    platform,
  });
  ensureVersionFilesMatch({
    files: pythonVersionFiles,
    expectedVersion: pythonVersion,
    label: 'Python runtime',
    platform,
  });

  console.log(
    `[deploy] ${platform}: verified deployment manifest at ${manifestFile.relativePath}`
  );
  console.log(
    `[deploy] ${platform}: verified backend entrypoint at ${entryPoint.relativePath}`
  );
  if (backendContainerDockerfile) {
    console.log(
      `[deploy] ${platform}: verified backend container contract at ${backendContainerDockerfile.relativePath}`
    );
  }
  console.log(
    `[deploy] ${platform}: verified Python extraction requirements at ${requirements.relativePath}`
  );
  console.log(
    `[deploy] ${platform}: verified Python worker entry at ${workerScript.relativePath}`
  );
  console.log(
    `[deploy] ${platform}: preferred backend runtime contract -> Node ${nodeVersion}, Python ${pythonVersion}`
  );
  console.log(
    `[deploy] ${platform}: pinned Python extraction packages -> ${pinnedRequirements.join(', ')}`
  );
  const verifiedTargets = verifyDeploymentTargets({ platform });

  return {
    backendContainerDockerfile,
    entryPoint,
    requirements,
    workerScript,
    pinnedRequirements,
    verifiedTargets,
  };
}

function ensureVenv({ platform }) {
  const venvAbsolutePath = repoPath(pythonVenvDirectory);
  const existingPython = resolveVenvPythonPath();
  if (existingPython) {
    console.log(
      `[deploy] ${platform}: reusing virtual environment at ${displayPath(pythonVenvDirectory)}`
    );
    return existingPython;
  }

  mkdirSync(path.dirname(venvAbsolutePath), { recursive: true });
  const bootstrapPython = resolveBootstrapPythonCommand();
  run(bootstrapPython, ['-m', 'venv', pythonVenvDirectory]);

  const venvPython = resolveVenvPythonPath();
  if (!venvPython) {
    fail(
      `${platform}: failed to create a usable Python virtual environment in ${displayPath(
        pythonVenvDirectory
      )}.`
    );
  }

  console.log(
    `[deploy] ${platform}: created virtual environment at ${displayPath(pythonVenvDirectory)}`
  );
  return venvPython;
}

function installNodeDependencies({ ci, platform }) {
  if (ci) {
    console.log(
      `[deploy] ${platform}: installing Node dependencies with devDependencies preserved for tsx/vite runtime`
    );
    run('npm', ['ci', '--include=dev']);
    return;
  }

  console.log(`[deploy] ${platform}: installing local Node dependencies`);
  run('npm', ['install']);
}

function installPythonRequirements({ pythonExecutable, platform }) {
  console.log(
    `[deploy] ${platform}: installing Python extraction requirements with ${pythonExecutable}`
  );
  run(pythonExecutable, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  run(pythonExecutable, ['-m', 'pip', 'install', '-r', pythonRequirementsPath]);
}

function createTempJsonPath(prefix) {
  return path.join(os.tmpdir(), `zootopia-deploy-${prefix}-${crypto.randomUUID()}.json`);
}

function detectPythonCapabilities({ pythonExecutable, platform, failIfMissing }) {
  const workerScript = resolveRepoFile(pythonWorkerScriptPath, 'Python extraction worker script');
  const inputPath = createTempJsonPath('detect-input');
  const outputPath = createTempJsonPath('detect-output');

  writeFileSync(inputPath, JSON.stringify({ platform }), 'utf8');

  try {
    const result = capture(pythonExecutable, [workerScript.absolutePath, 'detect', inputPath, outputPath]);
    if (!result.ok) {
      if (result.error?.code === 'EPERM') {
        fail(
          `${platform}: the current environment denied child-process execution for ${pythonExecutable}. ` +
            'This deployment/runtime contract requires the Node process to spawn the Python extraction worker directly.'
        );
      }

      const diagnostics = [
        result.stderr,
        result.stdout,
        result.error?.message,
        result.status ? `exit status ${result.status}` : '',
      ]
        .filter((value) => Boolean(value))
        .join(' | ');
      fail(
        `${platform}: failed to execute the Python extraction detector with ${pythonExecutable}. ` +
          `${diagnostics || 'No diagnostics were returned.'}`
      );
    }

    const capabilities = JSON.parse(readFileSync(outputPath, 'utf8'));
    const missingPackages = requiredPythonPackages.filter(
      (item) => !Boolean(capabilities?.modules?.[String(item.module || '')])
    );

    console.log(
      `[deploy] ${platform}: Python detector available=${Boolean(
        capabilities?.available
      )}, nativeReady=${Boolean(capabilities?.nativeReady)}, ocrReady=${Boolean(capabilities?.ocrReady)}`
    );

    for (const item of requiredPythonPackages) {
      const packageName = String(item.name || '');
      const moduleName = String(item.module || '');
      const installed = Boolean(capabilities?.modules?.[moduleName]);
      const version =
        capabilities?.versions?.[packageName] ||
        capabilities?.versions?.[moduleName] ||
        'not-detected';
      console.log(
        `[deploy] ${platform}: ${packageName} (module ${moduleName}) -> ${
          installed ? `installed (${version})` : 'missing'
        }`
      );
    }

    if (failIfMissing && missingPackages.length > 0) {
      fail(
        `${platform}: the Python runtime is missing required extraction packages: ${missingPackages
          .map((item) => String(item.name || item.module || 'unknown'))
          .join(', ')}.`
      );
    }

    return capabilities;
  } finally {
    rmSync(inputPath, { force: true });
    rmSync(outputPath, { force: true });
  }
}

function runFrontendBuild({ platform }) {
  console.log(
    `[deploy] ${platform}: building frontend assets into ${displayPath(frontendOutputDirectory)}`
  );
  run('npm', ['run', 'build']);
}

function runBackendBuild({ platform }) {
  verifyManifestAndPaths({ platform });
  installNodeDependencies({ ci: true, platform });
  const venvPython = ensureVenv({ platform });
  installPythonRequirements({ pythonExecutable: venvPython, platform });
  detectPythonCapabilities({
    pythonExecutable: venvPython,
    platform,
    failIfMissing: true,
  });
  runFrontendBuild({ platform });
}

function runStaticBuild({ platform, hostIntent }) {
  verifyManifestAndPaths({ platform });
  console.log(
    `[deploy] ${platform}: ${hostIntent}`
  );
  runFrontendBuild({ platform });
}

function runLocalBootstrap() {
  const platform = 'local-bootstrap';
  verifyManifestAndPaths({ platform });
  installNodeDependencies({ ci: false, platform });
  const venvPython = ensureVenv({ platform });
  installPythonRequirements({ pythonExecutable: venvPython, platform });
  detectPythonCapabilities({
    pythonExecutable: venvPython,
    platform,
    failIfMissing: true,
  });
  console.log(
    `[deploy] ${platform}: local runtime is ready. The server will auto-detect ${displayPath(
      pythonVenvDirectory
    )} when DOCUMENT_RUNTIME_PYTHON_EXECUTABLE is not overridden.`
  );
}

function runLocalVerify() {
  const platform = 'local-verify';
  verifyManifestAndPaths({ platform });
  const venvPython = resolveVenvPythonPath();
  if (!venvPython && !process.env.DOCUMENT_RUNTIME_PYTHON_EXECUTABLE) {
    fail(
      `${platform}: no repo-local ${displayPath(
        pythonVenvDirectory
      )} was found. Run "npm run setup:local" first or set DOCUMENT_RUNTIME_PYTHON_EXECUTABLE explicitly.`
    );
  }

  const pythonExecutable =
    process.env.DOCUMENT_RUNTIME_PYTHON_EXECUTABLE?.trim() || venvPython || resolveBootstrapPythonCommand();
  detectPythonCapabilities({
    pythonExecutable,
    platform,
    failIfMissing: true,
  });
}

function runLinuxServerBootstrap() {
  if (process.platform === 'win32') {
    fail('linux-server-bootstrap is intended for Linux/macOS shells, not Windows.');
  }

  const platform = 'linux-server-bootstrap';
  runBackendBuild({ platform });
  console.log(
    `[deploy] ${platform}: generic server bootstrap complete. Start with tools/start-linux-server.sh or NODE_ENV=production DOCUMENT_RUNTIME_PYTHON_EXECUTABLE=${displayPath(
      path.join(pythonVenvDirectory, 'bin', 'python')
    )} npm run start`
  );
}

const mode = process.argv[2] || 'verify';

if (mode === 'verify') {
  verifyManifestAndPaths({ platform: 'verify' });
} else if (mode === 'python-detect') {
  verifyManifestAndPaths({ platform: 'python-detect' });
  const pythonExecutable =
    process.env.DOCUMENT_RUNTIME_PYTHON_EXECUTABLE?.trim() ||
    resolveVenvPythonPath() ||
    resolveBootstrapPythonCommand();
  detectPythonCapabilities({
    pythonExecutable,
    platform: 'python-detect',
    failIfMissing: true,
  });
} else if (mode === 'local-bootstrap') {
  runLocalBootstrap();
} else if (mode === 'local-verify') {
  runLocalVerify();
} else if (mode === 'linux-server-bootstrap') {
  runLinuxServerBootstrap();
} else if (mode === 'backend-build') {
  runBackendBuild({ platform: 'backend-build' });
} else if (mode === 'static-build') {
  runStaticBuild({
    platform: 'static-build',
    hostIntent:
      'frontend-only build path. The nested Python extraction path is still verified here so static hosts do not hide backend requirements.',
  });
} else if (mode === 'render-build') {
  runBackendBuild({ platform: 'render-build' });
} else if (mode === 'netlify-build') {
  runStaticBuild({
    platform: 'netlify-build',
    hostIntent:
      'Netlify is frontend-only in the current architecture. The Express backend and Python worker must run on a backend-capable host.',
  });
} else if (mode === 'vercel-build') {
  runStaticBuild({
    platform: 'vercel-build',
    hostIntent:
      'Vercel is frontend-only in the current architecture. The Express backend and Python worker must run on a backend-capable host.',
  });
} else {
  fail(`Unsupported deployment helper mode "${mode}".`);
}
