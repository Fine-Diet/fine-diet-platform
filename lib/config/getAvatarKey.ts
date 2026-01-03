/**
 * Avatar Key Resolver
 * 
 * Resolves result keys (e.g., level1-level4) to avatar display keys using CMS mapping.
 * Falls back to default avatar key if no mapping exists.
 * 
 * Phase 2 / Step 2: Runtime wiring for avatar mapping.
 */

import { getAvatarMapping } from './getConfig';

/**
 * Get avatar display key for a result key
 * 
 * @param resultKey - Result key (e.g., 'level1', 'level2', 'balanced', etc.)
 * @returns Avatar display key (mapped or default)
 */
export async function getAvatarKey(resultKey: string): Promise<string> {
  const mapping = await getAvatarMapping();
  
  // Check if there's a mapping for this result key
  if (mapping.mappings[resultKey]) {
    return mapping.mappings[resultKey];
  }
  
  // Fall back to default avatar key
  return mapping.defaultAvatarKey;
}

/**
 * Get avatar display key synchronously (uses defaults only)
 * 
 * Use this when you can't await (e.g., in non-async contexts).
 * For full CMS-backed mapping, use getAvatarKey() instead.
 * 
 * @param resultKey - Result key
 * @returns Default avatar key (no mapping lookup)
 */
export function getAvatarKeySync(resultKey: string): string {
  // For now, just return the result key as-is (preserves current behavior)
  // When avatar mapping is fully implemented, this can use a cached mapping
  return resultKey;
}
