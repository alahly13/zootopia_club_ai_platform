import * as React from 'react';
import { useAuth } from '../../auth/AuthContext';

const TRACKING_DIAGNOSTICS_STORAGE_KEY = 'zootopia_tracking_diagnostics_enabled';

/**
 * Tracking diagnostics must stay available for admin/dev debugging, but the
 * default user experience should remain minimal and presentation-only.
 */
export function useTrackingDiagnosticsAccess() {
  const { isAdmin } = useAuth();
  const canAccessDiagnostics = Boolean(import.meta.env.DEV || isAdmin);
  const [diagnosticsEnabled, setDiagnosticsEnabled] = React.useState(false);

  React.useEffect(() => {
    if (!canAccessDiagnostics || typeof window === 'undefined') {
      setDiagnosticsEnabled(false);
      return;
    }

    setDiagnosticsEnabled(window.localStorage.getItem(TRACKING_DIAGNOSTICS_STORAGE_KEY) === '1');
  }, [canAccessDiagnostics]);

  const toggleDiagnostics = React.useCallback(() => {
    if (!canAccessDiagnostics || typeof window === 'undefined') {
      return;
    }

    const nextValue = !diagnosticsEnabled;
    if (nextValue) {
      window.localStorage.setItem(TRACKING_DIAGNOSTICS_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(TRACKING_DIAGNOSTICS_STORAGE_KEY);
    }
    setDiagnosticsEnabled(nextValue);
  }, [canAccessDiagnostics, diagnosticsEnabled]);

  return {
    canAccessDiagnostics,
    diagnosticsEnabled,
    toggleDiagnostics,
  };
}
