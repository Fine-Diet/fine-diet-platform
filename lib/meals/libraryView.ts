/**
 * Package 3 — Meal Library filter helpers (pure).
 *
 * Shared by /app/food/meals and focused tests. Keeps Archived discovery
 * behavior deterministic without depending on React.
 */

import type { MealDocument, MealDocumentKind } from './types';
import { isMealDocumentArchived } from './lifecycle';

export type LibraryFilter = 'all' | 'meals' | 'recipes' | 'needs_review' | 'archived';

/** Lightweight list projection (mirrors search API result fields we need). */
export interface LibraryListItem {
  id: string;
  document_kind: MealDocumentKind;
  archived?: boolean;
  review_state?: string;
}

export interface LibrarySearchParams {
  mode: string;
  review_state?: string;
  include_archived?: boolean;
}

/** Map a library filter to MealDocument search query params. */
export function paramsForLibraryFilter(filter: LibraryFilter): LibrarySearchParams {
  switch (filter) {
    case 'meals':
      return { mode: 'meals' };
    case 'recipes':
      return { mode: 'recipes' };
    case 'needs_review':
      return { mode: 'all', review_state: 'needs_review' };
    case 'archived':
      // Fetch with archived included, then client-filter to archived-only.
      return { mode: 'all', include_archived: true };
    case 'all':
    default:
      return { mode: 'all' };
  }
}

/**
 * Apply library-view selection to search results.
 * - Archived view: only rows with archived === true
 * - Active views: exclude archived (defense in depth; API already excludes)
 */
export function selectResultsForLibraryFilter<T extends LibraryListItem>(
  results: T[],
  filter: LibraryFilter,
): T[] {
  if (filter === 'archived') {
    return results.filter((r) => r.archived === true);
  }
  return results.filter((r) => r.archived !== true);
}

/**
 * After an archive/restore mutation, update the in-view result list.
 * - Archiving while on an active view → remove the row
 * - Restoring while on Archived → remove the row
 * - Restoring while on an active view → refresh row projection (keep visible)
 * - Archiving while on Archived → keep (already archived) / no-op
 */
export function applyLifecycleChangeToLibraryResults<T extends LibraryListItem>(
  results: T[],
  filter: LibraryFilter,
  updated: Pick<MealDocument, 'id' | 'lifecycle_state' | 'archived_at'> &
    Partial<T>,
): T[] {
  const id = updated.id;
  if (!id) return results;

  const nowArchived = isMealDocumentArchived(updated);

  if (filter === 'archived') {
    // Archived view shows only archived items — restore removes it.
    if (!nowArchived) return results.filter((r) => r.id !== id);
    return results.map((r) =>
      r.id === id ? ({ ...r, ...updated, archived: true } as T) : r,
    );
  }

  // Active views exclude archived.
  if (nowArchived) return results.filter((r) => r.id !== id);

  return results.map((r) =>
    r.id === id ? ({ ...r, ...updated, archived: false } as T) : r,
  );
}
