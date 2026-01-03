/**
 * Route Path Normalization
 * 
 * Normalizes route paths for consistent SEO key generation:
 * - Ensures leading "/"
 * - Strips query strings and hash fragments
 * - Removes trailing "/" except for root "/"
 */

/**
 * Normalize a route path for SEO key generation
 * 
 * @param path - Raw pathname (may include query/hash, may lack leading slash)
 * @returns Normalized path (e.g., "/", "/category", "/some/path")
 * 
 * @example
 * normalizeRoutePath("/") => "/"
 * normalizeRoutePath("/category") => "/category"
 * normalizeRoutePath("category") => "/category"
 * normalizeRoutePath("/category/") => "/category"
 * normalizeRoutePath("/category?foo=bar") => "/category"
 * normalizeRoutePath("/category#section") => "/category"
 */
export function normalizeRoutePath(path: string): string {
  if (!path || typeof path !== 'string') {
    return '/';
  }

  // Remove query string and hash
  let normalized = path.split('?')[0].split('#')[0];

  // Ensure leading slash
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  // Remove trailing slash (except for root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  // Ensure root is exactly "/"
  if (normalized === '') {
    normalized = '/';
  }

  return normalized;
}
