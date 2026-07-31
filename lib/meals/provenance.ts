/**
 * Package 3 — Import provenance + deterministic duplicate keys.
 *
 * Normalizes source URLs and builds a stable duplicate key so re-importing
 * the same source is deterministic. Pure; no I/O.
 *
 * Duplicate policy (documented):
 *   1. URL imports: normalize URL → person-scoped lookup on imported_meals
 *      and meal_documents.source_url. Match ⇒ reuse existing row (no insert).
 *   2. Import → MealDocument: still idempotent by source_imported_meal_id
 *      (existing findMealDocumentBySourceImportedMeal).
 *   3. Non-URL imports (text/video without URL): no URL key; each capture is
 *      a new staging row (content-hash dedup deferred — schema proposal).
 */

export type ImportDuplicateKeyKind = 'source_url' | 'none';

export interface ImportDuplicateKey {
  kind: ImportDuplicateKeyKind;
  /** Normalized key value when kind !== 'none'. */
  value: string | null;
}

/**
 * Normalize a source URL for durable provenance + deterministic dedup.
 *
 * Rules (stable, order-sensitive):
 *   - trim whitespace
 *   - lowercase host
 *   - strip fragment (#...)
 *   - strip trailing slash (except bare origin "/")
 *   - sort query params lexicographically
 *   - drop common tracking params (utm_*, fbclid, gclid, mc_eid, igshid)
 *   - reject non-http(s) schemes → null
 *
 * Returns null when the input is empty or not a usable http(s) URL.
 */
export function normalizeSourceUrl(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();

  const dropParam = (key: string): boolean => {
    const k = key.toLowerCase();
    return (
      k.startsWith('utm_') ||
      k === 'fbclid' ||
      k === 'gclid' ||
      k === 'mc_eid' ||
      k === 'igshid' ||
      k === 'si'
    );
  };

  const kept = Array.from(url.searchParams.entries())
    .filter(([key]) => !dropParam(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  url.search = '';
  for (const [key, value] of kept) {
    url.searchParams.append(key, value);
  }

  let href = url.toString();
  // Strip trailing slash except for origin-only URLs (https://example.com/).
  if (url.pathname !== '/' && href.endsWith('/')) {
    href = href.slice(0, -1);
  }
  // Origin-only: keep canonical form without trailing slash for dedup stability.
  if (url.pathname === '/' && !url.search && href.endsWith('/')) {
    href = href.slice(0, -1);
  }

  return href;
}

/**
 * Build the deterministic duplicate key for an import capture.
 */
export function buildImportDuplicateKey(args: {
  source_url?: string | null;
}): ImportDuplicateKey {
  const normalized = normalizeSourceUrl(args.source_url ?? null);
  if (normalized) {
    return { kind: 'source_url', value: normalized };
  }
  return { kind: 'none', value: null };
}

/**
 * True when two source URLs normalize to the same durable key.
 */
export function sourceUrlsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeSourceUrl(a);
  const nb = normalizeSourceUrl(b);
  if (!na || !nb) return false;
  return na === nb;
}
