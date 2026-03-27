import type express from 'express';

type SecurityHeaderOptions = {
  isProduction: boolean;
};

const DEFAULT_PERMISSIONS_POLICY = [
  'accelerometer=()',
  'autoplay=(self)',
  'camera=()',
  'display-capture=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'microphone=(self)',
  'payment=(self)',
  'usb=()',
].join(', ');

export function buildContentSecurityPolicy(options: SecurityHeaderOptions): string {
  const connectSources = [
    "'self'",
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'https://*.gstatic.com',
    'https://accounts.google.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firestore.googleapis.com',
    'https://firebaseinstallations.googleapis.com',
    'https://firebasestorage.googleapis.com',
    'https://storage.googleapis.com',
    'https://*.paymob.com',
  ];

  if (!options.isProduction) {
    connectSources.push('ws:', 'wss:');
  }

  const scriptSources = ["'self'"];

  if (!options.isProduction) {
    /**
     * Development-only Vite requirement:
     * the React refresh preamble is injected as an inline module script ahead of
     * `/@vite/client`. Blocking inline scripts in dev prevents the browser from
     * bootstrapping React Fast Refresh correctly and can collapse startup into a
     * blank page even though the HTML and JS assets are otherwise reachable.
     *
     * Keep production strict. This relaxation exists only for the local Vite
     * development server path used by `npm run dev`.
     */
    scriptSources.push("'unsafe-inline'");
  }

  const directives = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'self'`,
    `script-src ${scriptSources.join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data: https:`,
    `connect-src ${connectSources.join(' ')}`,
    `media-src 'self' blob: data: https:`,
    `worker-src 'self' blob:`,
    `frame-src 'self' https://accounts.google.com https://*.paymob.com`,
    `form-action 'self' https://*.paymob.com`,
  ];

  if (options.isProduction) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

export function applySecurityHeaders(
  req: express.Request,
  res: express.Response,
  options: SecurityHeaderOptions
) {
  const csp = buildContentSecurityPolicy(options);

  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', DEFAULT_PERMISSIONS_POLICY);

  if (options.isProduction && req.method === 'GET' && req.accepts('html')) {
    res.setHeader('Cache-Control', 'no-store');
  }
}
