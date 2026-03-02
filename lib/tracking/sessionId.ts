/**
 * First-party session ID cookie (fd_sid).
 *
 * Server-side: read from req.cookies, set via res.setHeader.
 * Client-side: read/write via document.cookie.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

const COOKIE_NAME = 'fd_sid';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Read fd_sid from an API request. If missing, generate one and
 * set it on the response so the browser persists it.
 */
export function getOrCreateSessionId(
  req: NextApiRequest,
  res: NextApiResponse
): string {
  const existing = req.cookies[COOKIE_NAME];
  if (existing) return existing;

  const sid = generateId();
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${sid}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`
  );
  return sid;
}

/**
 * Client-side: read fd_sid from document.cookie.
 * Returns null if not set.
 */
export function readSessionIdClient(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Client-side: ensure fd_sid cookie exists. Creates one if missing.
 */
export function ensureSessionIdClient(): string {
  const existing = readSessionIdClient();
  if (existing) return existing;
  const sid = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  document.cookie = `${COOKIE_NAME}=${sid}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
  return sid;
}
