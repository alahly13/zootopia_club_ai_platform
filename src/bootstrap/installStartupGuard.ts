import { runtimeTimeouts } from '../config/runtime';

const STARTUP_READY_EVENT = 'zootopia:app-shell-ready';
const STARTUP_FALLBACK_TIMEOUT_MS = runtimeTimeouts.startupFallbackMs;

type StartupFailureTone = 'error' | 'timeout';

type StartupFailurePayload = {
  title: string;
  message: string;
  detail: string;
  tone?: StartupFailureTone;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeFailureDetail(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message || 'Unexpected startup error.';
  }

  if (typeof reason === 'string' && reason.trim()) {
    return reason.trim();
  }

  if (typeof reason === 'object' && reason && 'message' in reason) {
    const message = (reason as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }

  return 'Unexpected startup error.';
}

function buildStartupFallbackMarkup(payload: StartupFailurePayload, isDarkMode: boolean) {
  const palette = isDarkMode
    ? {
        page: '#0a0a0b',
        shell: 'rgba(15, 23, 42, 0.88)',
        border: 'rgba(251, 191, 36, 0.22)',
        accent: '#fbbf24',
        accentSoft: 'rgba(251, 191, 36, 0.14)',
        heading: '#f8fafc',
        body: 'rgba(226, 232, 240, 0.92)',
        detailBg: 'rgba(15, 23, 42, 0.74)',
        detailBorder: 'rgba(148, 163, 184, 0.22)',
        secondary: 'rgba(15, 23, 42, 0.9)',
        secondaryText: '#e2e8f0',
      }
    : {
        page: '#f5f7fb',
        shell: 'rgba(255, 255, 255, 0.92)',
        border: 'rgba(245, 158, 11, 0.24)',
        accent: '#b45309',
        accentSoft: 'rgba(245, 158, 11, 0.12)',
        heading: '#111827',
        body: '#475569',
        detailBg: 'rgba(248, 250, 252, 0.96)',
        detailBorder: 'rgba(203, 213, 225, 0.88)',
        secondary: 'rgba(255, 255, 255, 0.92)',
        secondaryText: '#334155',
      };

  const escapedTitle = escapeHtml(payload.title);
  const escapedMessage = escapeHtml(payload.message);
  const escapedDetail = escapeHtml(payload.detail);
  const kicker = payload.tone === 'error' ? 'Startup Error' : 'Startup Recovery';

  return `
    <div data-zootopia-startup-fallback="true" style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;background:${palette.page};font-family:Inter,'Segoe UI',Arial,sans-serif;color:${palette.heading};">
      <div style="width:min(720px,100%);border-radius:32px;border:1px solid ${palette.border};background:${palette.shell};box-shadow:0 32px 80px rgba(15,23,42,0.18);backdrop-filter:blur(22px);padding:32px;">
        <div style="display:flex;gap:18px;align-items:flex-start;">
          <div style="width:56px;height:56px;border-radius:20px;background:${palette.accentSoft};display:flex;align-items:center;justify-content:center;color:${palette.accent};font-size:24px;font-weight:800;flex-shrink:0;">!</div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="font-size:11px;font-weight:900;letter-spacing:0.24em;text-transform:uppercase;color:${palette.accent};">${kicker}</div>
            <h1 style="margin:0;font-size:30px;line-height:1.1;font-weight:900;color:${palette.heading};">${escapedTitle}</h1>
            <p style="margin:0;font-size:15px;line-height:1.8;color:${palette.body};">${escapedMessage}</p>
          </div>
        </div>
        <div style="margin-top:24px;border-radius:22px;border:1px solid ${palette.detailBorder};background:${palette.detailBg};padding:16px 18px;font-size:13px;line-height:1.7;color:${palette.body};">
          ${escapedDetail}
        </div>
        <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap;">
          <button type="button" data-startup-action="reload" style="appearance:none;border:none;border-radius:18px;padding:14px 18px;background:#059669;color:white;font-size:13px;font-weight:900;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer;">
            Reload Page
          </button>
          <button type="button" data-startup-action="login" style="appearance:none;border:1px solid ${palette.detailBorder};border-radius:18px;padding:14px 18px;background:${palette.secondary};color:${palette.secondaryText};font-size:13px;font-weight:900;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer;">
            Open Login
          </button>
        </div>
      </div>
    </div>
  `;
}

export function renderStartupFallback(root: HTMLElement, payload: StartupFailurePayload) {
  const isDarkMode =
    document.documentElement.classList.contains('dark') ||
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;

  root.innerHTML = buildStartupFallbackMarkup(payload, isDarkMode);

  root.querySelector<HTMLButtonElement>('[data-startup-action="reload"]')?.addEventListener(
    'click',
    () => {
      window.location.reload();
    }
  );

  root.querySelector<HTMLButtonElement>('[data-startup-action="login"]')?.addEventListener(
    'click',
    () => {
      window.location.assign('/login');
    }
  );
}

/**
 * BOOT DIAGNOSTICS CONTRACT
 * ---------------------------------------------------------------------------
 * This guard exists only to surface fatal startup failures before React can
 * render its own recovery UI. Keep it narrowly focused on observability and
 * never turn it into browser-hostile "protection" logic such as anti-inspect
 * or anti-screenshot listeners, which are brittle and can break app startup.
 */
export function installStartupGuard(root: HTMLElement) {
  let hasResolved = false;
  let hasRenderedFallback = false;

  const renderFallbackOnce = (payload: StartupFailurePayload) => {
    if (hasResolved || hasRenderedFallback) {
      return;
    }

    hasRenderedFallback = true;
    renderStartupFallback(root, payload);
  };

  const handleStartupReady = () => {
    hasResolved = true;
    cleanup();
  };

  const handleWindowError = (event: ErrorEvent) => {
    if (hasResolved || hasRenderedFallback) {
      return;
    }

    // Ignore asset-load noise; only surface script/runtime failures that can
    // plausibly leave the interface blank before the React shell mounts.
    if (!event.error && !event.message) {
      return;
    }

    renderFallbackOnce({
      title: 'Platform startup failed',
      message:
        'The application hit an unexpected browser-side runtime error before the interface finished loading.',
      detail: normalizeFailureDetail(event.error ?? event.message),
      tone: 'error',
    });
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    renderFallbackOnce({
      title: 'Platform startup failed',
      message:
        'A startup task was rejected before the interface finished rendering, so the platform paused with a visible recovery state.',
      detail: normalizeFailureDetail(event.reason),
      tone: 'error',
    });
  };

  const timeoutId = window.setTimeout(() => {
    if (hasResolved || hasRenderedFallback || root.childElementCount > 0) {
      return;
    }

    renderFallbackOnce({
      title: 'Startup is taking longer than expected',
      message:
        'The page did not produce a visible interface in time, so the platform showed a recovery state instead of staying blank.',
      detail:
        'Reload the page or open the login route directly. If this keeps happening, inspect recent startup-side changes rather than adding browser protection scripts.',
      tone: 'timeout',
    });
  }, STARTUP_FALLBACK_TIMEOUT_MS);

  const cleanup = () => {
    window.clearTimeout(timeoutId);
    window.removeEventListener('error', handleWindowError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    window.removeEventListener(STARTUP_READY_EVENT, handleStartupReady as EventListener);
  };

  window.addEventListener('error', handleWindowError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  window.addEventListener(STARTUP_READY_EVENT, handleStartupReady as EventListener, { once: true });

  return cleanup;
}
