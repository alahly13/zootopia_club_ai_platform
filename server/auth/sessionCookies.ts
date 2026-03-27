import type express from 'express';
import { AUTH_SESSION_COOKIE_NAME } from '../cache/namespaces.js';
import {
  AuthSessionRecord,
  ParsedAuthSessionCookie,
  parseAuthSessionCookieValue,
  serializeAuthSessionCookieValue,
} from './sessionTypes.js';

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, fragment) => {
    const [name, ...rest] = fragment.split('=');
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      return cookies;
    }

    cookies[normalizedName] = decodeURIComponent(rest.join('=').trim());
    return cookies;
  }, {});
}

export function readAuthSessionCookie(
  req: express.Request
): ParsedAuthSessionCookie | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  return parseAuthSessionCookieValue(cookies[AUTH_SESSION_COOKIE_NAME]);
}

export function writeAuthSessionCookie(
  res: express.Response,
  session: AuthSessionRecord,
  isProduction: boolean
): void {
  const expiresAtMs = new Date(session.expiresAt).getTime();
  const maxAge = Number.isFinite(expiresAtMs)
    ? Math.max(60_000, expiresAtMs - Date.now())
    : undefined;

  res.cookie(
    AUTH_SESSION_COOKIE_NAME,
    serializeAuthSessionCookieValue({
      mode: session.mode,
      sessionId: session.sessionId,
    }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge,
    }
  );
}

export function clearAuthSessionCookie(
  res: express.Response,
  isProduction: boolean
): void {
  res.cookie(AUTH_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    expires: new Date(0),
  });
}
