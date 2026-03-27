import * as React from 'react';
import { useAuth } from '../auth/AuthContext';
import { aiCache } from '../ai/services/cacheService';
import { useDocument } from '../contexts/DocumentContext';
import { fetchActivePreparedDocument } from '../services/documentRuntimeService';
import { logger } from '../utils/logger';

/**
 * Keep document workspace state bound to the active authenticated session
 * namespace. The backend remains the durable source of truth for persisted
 * artifacts, but the in-memory React document mirror must not bleed across
 * account switches or auth-mode changes.
 */
export const AuthScopedDocumentBoundary: React.FC = () => {
  const { isAuthReady, isAuthenticated, sessionScopeKey } = useAuth();
  const { clearDocument, replaceDocument, documentId } = useDocument();
  const previousScopeRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    const nextScope = isAuthenticated ? sessionScopeKey : null;
    const previousScope = previousScopeRef.current;

    if (previousScope && previousScope !== nextScope) {
      clearDocument();
      aiCache.clear();
      logger.info('Cleared document context after auth session scope change', {
        area: 'document',
        event: 'document-session-scope-cleared',
        previousScope,
        nextScope,
      });
    }

    previousScopeRef.current = nextScope;
  }, [clearDocument, isAuthReady, isAuthenticated, sessionScopeKey]);

  React.useEffect(() => {
    if (!isAuthReady || !isAuthenticated || documentId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const activeDocument = await fetchActivePreparedDocument();
        if (cancelled || !activeDocument.activeDocument || !activeDocument.payload) {
          return;
        }

        const extractedText = activeDocument.payload.normalizedText || '';
        const context = extractedText || activeDocument.payload.normalizedMarkdown || '';

        replaceDocument({
          file: null,
          fileName: activeDocument.activeDocument.fileName,
          fileSizeBytes: activeDocument.document?.fileSizeBytes ?? null,
          mimeType: activeDocument.activeDocument.mimeType,
          artifactId: activeDocument.artifact?.artifactId ?? activeDocument.activeDocument.artifactId ?? null,
          sourceFileId: activeDocument.activeDocument.sourceFileId,
          ownerRole: activeDocument.document?.ownerRole ?? null,
          workspaceScope: activeDocument.document?.workspaceScope ?? null,
          processingPathway: activeDocument.activeDocument.processingPathway,
          runtimeOperationId: activeDocument.document?.runtimeOperationId ?? null,
          documentId: activeDocument.activeDocument.documentId,
          uploadedAt: activeDocument.activeDocument.updatedAt,
          extractedText,
          context,
          documentStatus: context.trim().length > 0 ? 'ready' : 'preparing',
        });

        logger.info('Rehydrated prepared document from shared runtime', {
          area: 'document',
          event: 'document-runtime-rehydrated',
          documentId: activeDocument.activeDocument.documentId,
          artifactId: activeDocument.artifact?.artifactId ?? activeDocument.activeDocument.artifactId ?? null,
          processingPathway: activeDocument.activeDocument.processingPathway,
        });
      } catch (error) {
        logger.warn('Unable to rehydrate prepared document from shared runtime', {
          area: 'document',
          event: 'document-runtime-rehydrate-failed',
          error: error instanceof Error ? error.message : String(error || 'unknown'),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, isAuthReady, isAuthenticated, replaceDocument, sessionScopeKey]);

  return null;
};
