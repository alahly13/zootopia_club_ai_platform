import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { buildDocumentContextRef } from '../src/services/documentRuntimeService';
import { actorWorkspaceResolver } from '../server/documentRuntime/actorWorkspaceResolver';
import { buildDocumentRuntimeKeySet } from '../server/documentRuntime/runtimeStateService';
import { resolveDocumentProcessingStrategy } from '../server/documentRuntime/documentProcessingStrategyResolver';
import { extractDocumentArtifact } from '../server/documentRuntime/extractionEngine';
import type { DocumentActorContext } from '../server/documentRuntime/types';

const userActor: DocumentActorContext = {
  actorId: 'user-1',
  actorRole: 'User',
  scope: 'user',
  authType: 'normal',
};

const adminActor: DocumentActorContext = {
  actorId: 'user-1',
  actorRole: 'Admin',
  scope: 'admin',
  authType: 'admin',
  adminLevel: 'primary',
};

async function createTempSourceFile(fileName: string, contents: string): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `zootopia-${Date.now()}-${fileName}`);
  await fs.writeFile(tempPath, contents, 'utf8');
  return tempPath;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

async function withMockedDatalab<T>(input: {
  markdown: string;
  run: () => Promise<T>;
}): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.DATALAB_API_KEY;
  const originalExtractionEngine = process.env.DOCUMENT_EXTRACTION_ENGINE;
  const originalPollInterval = process.env.DATALAB_CONVERT_POLL_INTERVAL_MS;
  const originalPollTimeout = process.env.DATALAB_CONVERT_POLL_TIMEOUT_MS;
  let pollCount = 0;

  process.env.DATALAB_API_KEY = 'test-datalab-key';
  process.env.DOCUMENT_EXTRACTION_ENGINE = 'datalab_convert';
  process.env.DATALAB_CONVERT_POLL_INTERVAL_MS = '1';
  process.env.DATALAB_CONVERT_POLL_TIMEOUT_MS = '1000';

  globalThis.fetch = (async (resource: string | URL | Request) => {
    const url =
      typeof resource === 'string'
        ? resource
        : resource instanceof URL
          ? resource.toString()
          : resource.url;

    if (url.endsWith('/api/v1/marker')) {
      return jsonResponse({
        success: true,
        request_id: 'req-test-1',
        request_check_url: 'https://www.datalab.to/api/v1/marker/req-test-1',
      });
    }

    if (url.endsWith('/api/v1/marker/req-test-1')) {
      pollCount += 1;
      if (pollCount === 1) {
        return jsonResponse({
          status: 'processing',
        });
      }

      return jsonResponse({
        status: 'complete',
        success: true,
        markdown: input.markdown,
        metadata: {
          page_count: 2,
        },
      });
    }

    throw new Error(`Unexpected mocked fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    return await input.run();
  } finally {
    globalThis.fetch = originalFetch;

    if (originalApiKey === undefined) {
      delete process.env.DATALAB_API_KEY;
    } else {
      process.env.DATALAB_API_KEY = originalApiKey;
    }

    if (originalExtractionEngine === undefined) {
      delete process.env.DOCUMENT_EXTRACTION_ENGINE;
    } else {
      process.env.DOCUMENT_EXTRACTION_ENGINE = originalExtractionEngine;
    }

    if (originalPollInterval === undefined) {
      delete process.env.DATALAB_CONVERT_POLL_INTERVAL_MS;
    } else {
      process.env.DATALAB_CONVERT_POLL_INTERVAL_MS = originalPollInterval;
    }

    if (originalPollTimeout === undefined) {
      delete process.env.DATALAB_CONVERT_POLL_TIMEOUT_MS;
    } else {
      process.env.DATALAB_CONVERT_POLL_TIMEOUT_MS = originalPollTimeout;
    }
  }
}

async function withEnvironment<T>(
  overrides: Record<string, string | undefined>,
  run: () => Promise<T>
): Promise<T> {
  const originalValues = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    originalValues.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of originalValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('buildDocumentContextRef returns undefined without a document id', () => {
  assert.equal(
    buildDocumentContextRef({
      documentId: null,
      artifactId: null,
      processingPathway: null,
    }),
    undefined
  );
});

test('runtime keys stay actor-scoped even for identical ids', () => {
  const userKeys = buildDocumentRuntimeKeySet(userActor, 'doc-123');
  const adminKeys = buildDocumentRuntimeKeySet(adminActor, 'doc-123');

  assert.notEqual(userKeys.activeDocument, adminKeys.activeDocument);
  assert.match(userKeys.document, /:user:normal:user-1:extract_doc-123$/);
  assert.match(adminKeys.document, /:admin:admin:user-1:extract_doc-123$/);
});

test('workspace paths stay actor-scoped even for identical workflow and document ids', () => {
  const userWorkspace = actorWorkspaceResolver.resolveArtifactWorkspace(userActor, 'wf-1', 'doc-123', 'artifact-1');
  const adminWorkspace = actorWorkspaceResolver.resolveArtifactWorkspace(adminActor, 'wf-1', 'doc-123', 'artifact-1');

  assert.match(userWorkspace.relativeDocumentRootPath, /users\/user-1\/workflows\/wf-1\/documents\/doc-123/);
  assert.match(adminWorkspace.relativeDocumentRootPath, /admins\/user-1\/workflows\/wf-1\/documents\/doc-123/);
  assert.notEqual(userWorkspace.relativeDocumentRootPath, adminWorkspace.relativeDocumentRootPath);
});

test('direct file mode remains dormant by default', () => {
  const strategy = resolveDocumentProcessingStrategy({
    toolId: 'quiz',
    requestedPathway: 'direct_file_to_model',
  });

  assert.equal(strategy.pathway, 'local_extraction');
  assert.equal(strategy.directModeEnabled, false);
  assert.equal(strategy.toolSupportsDirectFileMode, true);
});

test('text extraction creates a structured owner-scoped artifact envelope from Datalab markdown', async () => {
  const sourcePath = await createTempSourceFile('lecture.txt', 'Cell biology introduction');

  try {
    await withMockedDatalab({
      markdown: [
        '{0}------------------------------------------------',
        '# Cell Biology',
        '## 1. Membrane Structure',
        'Cells are the basic unit of life.',
        '',
        '{1}------------------------------------------------',
        '### 1.1 Channel Proteins',
        '- Ion channels regulate transport',
        '- Carrier proteins move molecules',
      ].join('\n'),
      run: async () => {
        const extracted = await extractDocumentArtifact({
          actor: userActor,
          workflowId: 'wf-text',
          documentId: 'doc-text',
          sourceFileId: 'source-1',
          fileName: 'lecture.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Cell biology introduction', 'utf8'),
          sourcePath,
          sourceRelativePath: 'users/user-1/workflows/wf-text/documents/doc-text/source/source-1-lecture.txt',
        });

        assert.equal(extracted.payload.documentId, 'doc-text');
        assert.equal(extracted.payload.workflowId, 'wf-text');
        assert.equal(extracted.payload.actorId, userActor.actorId);
        assert.equal(extracted.payload.processingPathway, 'local_extraction');
        assert.equal(extracted.payload.fileType, 'txt');
        assert.match(extracted.payload.normalizedText, /Cells are the basic unit of life/);
        assert.match(extracted.payload.normalizedMarkdown, /# Cell Biology/);
        assert.match(extracted.payload.paths.normalizedMarkdownPath, /users\/user-1\/workflows\/wf-text\/documents\/doc-text\/artifacts\//);
        assert.deepEqual(extracted.payload.languageHints, ['en']);
        assert.equal(extracted.payload.pageMap[0]?.pageNumber, 1);
        assert.deepEqual(extracted.payload.extractionMeta.extractorChain, ['datalab:convert']);
      },
    });
  } finally {
    await fs.rm(sourcePath, { force: true });
  }
});

test('text extraction reconstructs nested headings and section content for prompt-ready artifacts', async () => {
  const sourcePath = await createTempSourceFile(
    'outline.txt',
    [
      'CELL BIOLOGY',
      '1. Membrane Structure',
      '1.1 Channel Proteins',
      '- Ion channels regulate transport',
      '- Carrier proteins move molecules',
    ].join('\n')
  );

  try {
    await withMockedDatalab({
      markdown: [
        '{0}------------------------------------------------',
        '# CELL BIOLOGY',
        '## 1. Membrane Structure',
        'Cells are the basic unit of life.',
        '',
        '{1}------------------------------------------------',
        '### 1.1 Channel Proteins',
        '- Ion channels regulate transport',
        '- Carrier proteins move molecules',
      ].join('\n'),
      run: async () => {
        const extracted = await extractDocumentArtifact({
          actor: userActor,
          workflowId: 'wf-outline',
          documentId: 'doc-outline',
          sourceFileId: 'source-outline',
          fileName: 'outline.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(
            [
              'CELL BIOLOGY',
              '1. Membrane Structure',
              '1.1 Channel Proteins',
              '- Ion channels regulate transport',
              '- Carrier proteins move molecules',
            ].join('\n'),
            'utf8'
          ),
          sourcePath,
          sourceRelativePath: 'users/user-1/workflows/wf-outline/documents/doc-outline/source/source-outline-outline.txt',
        });

        assert.equal(extracted.payload.headingTree.length, 3);
        assert.equal(extracted.payload.headingTree[1]?.parentId, extracted.payload.headingTree[0]?.id);
        assert.equal(extracted.payload.headingTree[2]?.parentId, extracted.payload.headingTree[1]?.id);
        assert.match(extracted.payload.normalizedMarkdown, /### 1\.1 Channel Proteins/);

        const subSection = extracted.payload.structuredDocumentJson.sections.find(
          (section) => section.title === '1.1 Channel Proteins'
        );
        assert.ok(subSection);
        assert.match(String(subSection?.content), /Ion channels regulate transport/);
      },
    });
  } finally {
    await fs.rm(sourcePath, { force: true });
  }
});

test('image uploads resolve through the Datalab path without the legacy image marker fallback', async () => {
  const sourcePath = await createTempSourceFile('diagram.png', 'png-binary-placeholder');

  try {
    await withMockedDatalab({
      markdown: [
        '{0}------------------------------------------------',
        '# Diagram',
        'Cell membrane illustration',
      ].join('\n'),
      run: async () => {
        const extracted = await extractDocumentArtifact({
          actor: userActor,
          workflowId: 'wf-image',
          documentId: 'doc-image',
          sourceFileId: 'source-2',
          fileName: 'diagram.png',
          mimeType: 'image/png',
          buffer: Buffer.from('png-binary-placeholder'),
          sourcePath,
          sourceRelativePath: 'users/user-1/workflows/wf-image/documents/doc-image/source/source-2-diagram.png',
        });

        assert.equal(extracted.payload.fileType, 'image');
        assert.equal(extracted.payload.extractionStrategy, 'datalab_convert_image');
        assert.match(extracted.payload.normalizedMarkdown, /# Diagram/);
        assert.equal(extracted.payload.pageSegments[0]?.kind, 'ocr');
        assert.equal(extracted.payload.ocrBlocks.length, 0);
      },
    });
  } finally {
    await fs.rm(sourcePath, { force: true });
  }
});

test('legacy extraction engine can be selected by env without changing the artifact contract', async () => {
  const sourcePath = await createTempSourceFile(
    'legacy-outline.txt',
    ['CELL BIOLOGY', 'Membranes keep cells stable.', 'Transport proteins regulate flow.'].join('\n')
  );

  try {
    await withEnvironment(
      {
        DOCUMENT_EXTRACTION_ENGINE: 'python_legacy',
        DOCUMENT_RUNTIME_PYTHON_EXTRACTION_ENABLED: 'false',
      },
      async () => {
        const extracted = await extractDocumentArtifact({
          actor: userActor,
          workflowId: 'wf-legacy',
          documentId: 'doc-legacy',
          sourceFileId: 'source-legacy',
          fileName: 'legacy-outline.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(
            ['CELL BIOLOGY', 'Membranes keep cells stable.', 'Transport proteins regulate flow.'].join('\n'),
            'utf8'
          ),
          sourcePath,
          sourceRelativePath:
            'users/user-1/workflows/wf-legacy/documents/doc-legacy/source/source-legacy-legacy-outline.txt',
        });

        assert.equal(extracted.payload.processingPathway, 'local_extraction');
        assert.equal(extracted.payload.fileType, 'txt');
        assert.equal(extracted.payload.extractionStrategy, 'txt_native');
        assert.match(extracted.payload.normalizedText, /Membranes keep cells stable/);
        assert.equal(extracted.payload.ocrBlocks.length, 0);
        assert.ok(Array.isArray(extracted.payload.pageMap));
        assert.ok(Array.isArray(extracted.payload.structuredDocumentJson.sections));
        assert.ok(
          Array.isArray((extracted.payload.extractionMeta as Record<string, unknown>).fallbackChain)
        );
      }
    );
  } finally {
    await fs.rm(sourcePath, { force: true });
  }
});
