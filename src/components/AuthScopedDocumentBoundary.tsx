import * as React from 'react';
import { useAuth } from '../auth/AuthContext';
import { aiCache } from '../ai/services/cacheService';
import { useDocument } from '../contexts/DocumentContext';
import { logger } from '../utils/logger';

/**
 * Keep document workspace state bound to the active authenticated session
 * namespace. The backend remains the durable source of truth for persisted
 * artifacts, but the in-memory React document mirror must not bleed across
 * account switches or auth-mode changes.
 */
export const AuthScopedDocumentBoundary: React.FC = () => {
  const { isAuthReady, isAuthenticated, sessionScopeKey } = useAuth();
  const { clearDocument } = useDocument();
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

  return null;
};
