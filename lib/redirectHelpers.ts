import { APP_ROUTES } from '@/lib/routes/appRoutes';

/**
 * Redirect target validation for login, waitlist, and journal gating.
 * Ensures redirect URLs are relative paths only (no open redirects).
 */

const PLAIN_PROFILE_LOGIN_RETURN_PATHS = new Set(['/app/profile', '/journal/profile']);

/**
 * Prevent logout-from-Profile loops by sending automatic plain Profile returns
 * to the app home. Preserves authored Profile section deep links via hash.
 */
export function normalizeAutomaticLoginReturnTarget(value: string): string {
  const trimmed = value.trim();
  const hashIndex = trimmed.indexOf('#');
  const beforeHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  const pathOnly = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex) : '';

  if (!hash && PLAIN_PROFILE_LOGIN_RETURN_PATHS.has(pathOnly)) {
    return APP_ROUTES.home;
  }

  return `${pathOnly}${query}${hash}`;
}

/**
 * Validate that a redirect target is a safe relative path.
 * - Rejects external URLs (http://, https://)
 * - Rejects protocol-relative (//)
 * - Accepts paths starting with /
 *
 * @returns true if safe to use as redirect target
 */
export function isSafeRedirectTarget(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return false;
  }
  if (trimmed.startsWith('//')) {
    return false;
  }
  // Reject backslash tricks and control characters.
  if (trimmed.includes('\\') || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    return false;
  }
  return trimmed.startsWith('/');
}

/**
 * Get a safe redirect target from a string, or return fallback.
 * Use when reading ?redirect= from URL.
 */
export function getSafeRedirectTarget(
  value: string | null | undefined,
  fallback: string
): string {
  if (!isSafeRedirectTarget(value)) {
    return fallback;
  }
  return normalizeAutomaticLoginReturnTarget(value.trim());
}
