/**
 * Redirect target validation for login, waitlist, and journal gating.
 * Ensures redirect URLs are relative paths only (no open redirects).
 */

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
  return isSafeRedirectTarget(value) ? value.trim() : fallback;
}
