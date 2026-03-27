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

const backendEntryPoint = String(manifest.backend?.entryPoint || '');
const healthcheckPath = String(manifest.backend?.healthcheckPath || '/api/health');
const frontendOutputDirectory = String(manifest.frontend?.outputDirectory || 'dist');
const pythonRequirementsPath = String(manifest.python?.requirementsPath || '');
const pythonWorkerScriptPath = String(manifest.python?.workerScriptPath || '');
const pythonVenvDirectory = String(manifest.python?.venvDirectory || '.venv');
const requiredPythonPackages = Array.isArray(manifest.python?.requiredPackages)
  ? manifest.python.requiredPackages
  : [];

function spawnCommand(command, args, { env, stdio = 'inherit' } = {}) {
  const runtimeEnv = {
    ...process.env,
    ...env,
  };

  if (process.platform === 'win32') {
    const quote = (value) => {
      const normalized = String(value);
      if (/^[A-Za-z0-9_./:\\-]+$/u.test(normalized)) {
        return normalized;
      }

      return `'${normalized.replace(/'/g, "''")}'`;
    };

    return spawnSync('powershell.exe', ['-NoProfile', '-Command', [quote(command), ...args.map(quote)].join(' ')], {
      cwd: process.cwd(),
      env: runtimeEnv,
      stdio,
    });
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

function resolveVenvPythonPath() {
  const candidates = [
    path.join(process.cwd(), pythonVenvDirectory, 'Scripts', 'python.exe'),
    path.join(process.cwd(), pythonVenvDirectory, 'Scripts', 'python'),
    path.join(process.cwd(), pythonVenvDirectory, 'bin', 'python'),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function resolveBootstrapPythonCommand() {
  const candidates = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];

  for (const candidate of candidates) {
    const result = capture(candidate, ['--version']);
    if (result.ok) {
      console.log(`[deploy] Bootstrap Python detected via: ${candidate} (${result.stdout || result.stderr})`);
      return candidate;
    }
  }

  fail(
    'Python was not found on PATH. Install Python first, then rerun the deployment helper.'
  );
}

function verifyManifestAndPaths({ platform }) {
  const entryPoint = resolveRepoFile(backendEntryPoint, 'Backend entrypoint');
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

  console.log(
    `[deploy] ${platform}: verified deployment manifest at ${manifestFile.relativePath}`
  );
  console.log(
    `[deploy] ${platform}: verified backend entrypoint at ${entryPoint.relativePath}`
  );
  console.log(
    `[deploy] ${platform}: verified Python extraction requirements at ${requirements.relativePath}`
  );
  console.log(
    `[deploy] ${platform}: verified Python worker entry at ${workerScript.relativePath}`
  );
  console.log(
    `[deploy] ${platform}: pinned Python extraction packages -> ${pinnedRequirements.join(', ')}`
  );

  return {
    entryPoint,
    requirements,
    workerScript,
    pinnedRequirements,
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
      fail(
        `${platform}: failed to execute the Python extraction detector with ${pythonExecutable}. ` +
          `${result.stderr || result.stdout || 'No diagnostics were returned.'}`
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
