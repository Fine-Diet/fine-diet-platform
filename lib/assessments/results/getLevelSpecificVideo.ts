/**
 * Deterministic level-specific video mapping for Gut Check results.
 *
 * Extracted verbatim from the body of `ResultsScreen.tsx` so it can be unit-tested
 * and reused by `resolveResultsScreenContent` without being tangled into the
 * component. This is the Gut Check-specific adapter the packet asks us to isolate:
 * it maps `level1`–`level4` to an internal route used by the legacy results-pack
 * fallback. Flow v2 packs carry their own `videoAssetUrl` and never reach this map.
 *
 * Future result templates should plug in their own video resolution; this module
 * is intentionally Gut Check-scoped.
 */

const VIDEO_MAP: Record<string, string> = {
  level1: '/gut-pattern-breakdown?level=1',
  level2: '/gut-pattern-breakdown?level=2',
  level3: '/gut-pattern-breakdown?level=3',
  level4: '/gut-pattern-breakdown?level=4',
};

/**
 * Resolve a level-specific video URL for a Gut Check level id.
 * Returns `null` when the level id is not in `level1`–`level4` (and warns), so the
 * caller can safely omit the video CTA rather than render a dead link.
 */
export function getLevelSpecificVideo(levelId: string): string | null {
  const normalizedLevel = levelId.match(/^level[1-4]$/) ? levelId : null;
  if (!normalizedLevel) {
    console.warn(`Invalid levelId for video mapping: ${levelId}`);
    return null;
  }
  return VIDEO_MAP[normalizedLevel] || null;
}
