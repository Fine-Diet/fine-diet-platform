/**
 * Package 3 — Deterministic person-scoped source URL lookup helpers.
 *
 * Strategy (no production DDL):
 *   1. Exact match on stored source_url === normalized URL (new rows persist
 *      the normalized form).
 *   2. Paginated compatibility scan for historical raw URL variants, comparing
 *      via normalizeSourceUrl / sourceUrlsMatch. Does NOT cap correctness at
 *      the newest N rows.
 *
 * Concurrency note: application-only check-then-insert remains race-prone
 * until the proposed unique index on normalized_source_url is approved.
 * Concurrent uniqueness is NOT guaranteed without DDL.
 */

import { normalizeSourceUrl, sourceUrlsMatch } from './provenance';

export const SOURCE_URL_LOOKUP_PAGE_SIZE = 100;

export interface SourceUrlRow {
  source_url: string | null;
}

export interface SourceUrlPageQuery {
  /** Exact equality page: source_url = normalized target. */
  exact: (normalizedUrl: string) => Promise<SourceUrlRow[]>;
  /** Compatibility page: rows with non-null source_url, ordered newest-first. */
  page: (offset: number, limit: number) => Promise<SourceUrlRow[]>;
}

/**
 * Find the first (newest) row whose source_url matches the normalized target.
 * Pure orchestration over injected page queries for testability.
 */
export async function findRowByNormalizedSourceUrl<T extends SourceUrlRow>(
  sourceUrl: string,
  query: {
    exact: (normalizedUrl: string) => Promise<T[]>;
    page: (offset: number, limit: number) => Promise<T[]>;
  },
  pageSize: number = SOURCE_URL_LOOKUP_PAGE_SIZE,
): Promise<T | null> {
  const target = normalizeSourceUrl(sourceUrl);
  if (!target) return null;

  const exactRows = await query.exact(target);
  if (exactRows.length > 0) return exactRows[0];

  let offset = 0;
  for (;;) {
    const rows = await query.page(offset, pageSize);
    if (rows.length === 0) return null;

    for (const row of rows) {
      if (sourceUrlsMatch(row.source_url, target)) return row;
    }

    if (rows.length < pageSize) return null;
    offset += pageSize;
  }
}
