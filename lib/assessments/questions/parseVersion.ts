/**
 * Version Parsing Utilities
 * 
 * Parse version from query parameters with validation
 */

/**
 * Parse version from query parameter
 * 
 * @param v - Query parameter value (string | string[] | undefined)
 * @param defaultVersion - Default version if parsing fails (default: 2)
 * @returns Parsed version number (restricted to 1-99)
 */
export function parseVersionFromQuery(
  v: string | string[] | undefined,
  defaultVersion: number = 2
): number {
  if (!v) {
    return defaultVersion;
  }

  const vStr = Array.isArray(v) ? v[0] : v;
  const vNum = parseInt(vStr, 10);
  
  // Restrict to sane bounds (1-99) to avoid abuse
  if (isNaN(vNum) || vNum < 1 || vNum > 99) {
    return defaultVersion;
  }
  
  return vNum;
}

