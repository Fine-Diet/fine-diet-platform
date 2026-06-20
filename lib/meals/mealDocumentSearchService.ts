/**
 * Meal Object Foundation — Packet 6: MealDocument retrieval / search service
 *
 * Person-scoped, READ-ONLY retrieval over the meal_documents store
 * (scripts/sql/createMealDocuments.sql). This is the separate, additive search
 * path that expands Fine Diet discovery (Meals / Recipes) BESIDE the existing
 * branded food search — it does not import, call, or modify the branded food
 * search path (lib/food/*) or /api/foods/search in any way.
 *
 * GUARANTEES (audit §7, §12.2):
 *   - Person scope is enforced on EVERY query via `.eq('person_id', personId)`.
 *     No cross-user rows are reachable.
 *   - Search performs NO writes, NO AI, and NO nutrition recompute. Nutrition
 *     is projected verbatim from document_json.per_serving.
 *   - Empty / browse query orders by updated_at DESC (most-recent first),
 *     matching listMealDocumentsForPerson and the meal_documents indexes.
 *   - Query search matches `title` at minimum (case-insensitive), using the
 *     denormalized title column. Wildcards in the query are escaped so user
 *     input cannot alter the match semantics.
 *   - kind filter (meal | recipe) and optional review_state filter.
 *
 * Server-only; never import from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';

import {
  DEFAULT_SEARCH_MODE,
  isMealDocumentSearchMode,
  mealDocumentKindForMode,
  type MealDocumentSearchMode,
  type MealDocumentSearchResult,
} from './searchTypes';
import type {
  MealDocument,
  MealDocumentIntent,
  MealDocumentKind,
  MealNutrition,
  MealReviewState,
} from './types';

// ============================================================================
// Row shape (mirrors scripts/sql/createMealDocuments.sql)
// ============================================================================

interface MealDocumentSearchRow {
  id: string;
  person_id: string;
  kind: MealDocumentKind;
  title: string;
  description: string | null;
  review_state: MealReviewState;
  intents: string[] | null;
  source_type: string | null;
  document_json: MealDocument | null;
  updated_at: string;
}

/** Columns needed for a search projection — never `document_json`-only. */
const SEARCH_COLUMNS =
  'id, person_id, kind, title, description, review_state, intents, source_type, document_json, updated_at';

// ============================================================================
// Limit policy
// ============================================================================

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MIN_LIMIT = 1;

/**
 * True when a Supabase error indicates the `meal_documents` store does not
 * exist in the target environment (table never migrated / absent from the
 * PostgREST schema cache). In that case the Meal Library must degrade to a
 * graceful empty result instead of surfacing a 500 — while any OTHER error
 * (permissions, malformed query, transient failure) still propagates so real
 * failures stay visible. Where the table DOES exist, behavior is unchanged.
 */
export function isMissingMealDocumentsStore(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  // 42P01 = undefined_table (Postgres); PGRST205 = table missing from schema cache.
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find the table')
  );
}

/** Clamp an optional caller limit into [MIN_LIMIT, MAX_LIMIT]. */
export function clampSearchLimit(limit: number | null | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  const floored = Math.floor(limit);
  if (floored < MIN_LIMIT) return MIN_LIMIT;
  if (floored > MAX_LIMIT) return MAX_LIMIT;
  return floored;
}

/**
 * Escape PostgREST `ilike` wildcards so user-supplied `%`, `_`, and `\` are
 * treated as literals. Without this, a query of `%` would match every row.
 */
export function escapeIlikePattern(input: string): string {
  return input.replace(/([\\%_])/g, '\\$1');
}

// ============================================================================
// Params + outcome
// ============================================================================

export interface MealDocumentSearchParams {
  /** Free-text query over title. Empty/whitespace ⇒ browse mode. */
  q?: string | null;
  /**
   * Optional search mode. Derives the kind filter when `kind` is not given.
   * Only MealDocument modes ('all' | 'meals' | 'recipes') are honored here;
   * 'foods' / 'restaurants' / 'recent' are NOT served by this service.
   */
  mode?: MealDocumentSearchMode | null;
  /** Explicit kind filter; takes precedence over the mode-derived kind. */
  kind?: MealDocumentKind | null;
  /** Optional review_state filter (draft | needs_review | confirmed). */
  review_state?: MealReviewState | null;
  /** Max rows to return (clamped to [1, 50]; default 20). */
  limit?: number | null;
}

export interface MealDocumentSearchOutcome {
  /** Echoed effective MealDocument mode. */
  mode: MealDocumentSearchMode;
  /** Normalized (trimmed) query string actually applied. */
  query: string;
  /** Effective kind filter applied (null ⇒ both meals and recipes). */
  kind: MealDocumentKind | null;
  /** True when no query was supplied (most-recent-first browse). */
  browse: boolean;
  /** Effective row limit applied. */
  limit: number;
  results: MealDocumentSearchResult[];
}

// ============================================================================
// Mapping
// ============================================================================

/** Pull per-serving nutrition from the canonical JSON; never recompute. */
function nutritionFromRow(row: MealDocumentSearchRow): MealNutrition | null {
  const doc = row.document_json;
  if (!doc) return null;
  return doc.per_serving ?? null;
}

function intentsFromRow(row: MealDocumentSearchRow): MealDocumentIntent[] {
  if (Array.isArray(row.intents)) return row.intents as MealDocumentIntent[];
  if (Array.isArray(row.document_json?.intents)) {
    return row.document_json!.intents;
  }
  return [];
}

function rowToSearchResult(row: MealDocumentSearchRow): MealDocumentSearchResult {
  return {
    type: 'meal_document',
    document_kind: row.kind,
    id: row.id,
    person_id: row.person_id,
    title: row.title,
    description: row.description ?? null,
    review_state: row.review_state,
    source_type: row.source_type ?? null,
    intents: intentsFromRow(row),
    nutrition: nutritionFromRow(row),
    updated_at: row.updated_at ?? null,
  };
}

// ============================================================================
// Search
// ============================================================================

/**
 * Search/browse a person's MealDocuments.
 *
 * Person scope is mandatory and always applied. With no query this is a browse
 * ordered by updated_at DESC; with a query it filters `title` case-insensitively
 * (still ordered by updated_at DESC — ranking is deferred, ordering stays
 * deterministic). Returns a typed outcome; performs no writes.
 */
export async function searchMealDocumentsForPerson(
  personId: string,
  params: MealDocumentSearchParams = {},
): Promise<MealDocumentSearchOutcome> {
  const mode: MealDocumentSearchMode = isMealDocumentSearchMode(params.mode)
    ? params.mode
    : isMealDocumentSearchMode(DEFAULT_SEARCH_MODE)
      ? DEFAULT_SEARCH_MODE
      : 'all';

  // Explicit kind wins; otherwise derive from the mode.
  const effectiveKind: MealDocumentKind | null =
    params.kind ?? mealDocumentKindForMode(mode);

  const limit = clampSearchLimit(params.limit);
  const query = (params.q ?? '').trim();
  const browse = query.length === 0;

  let builder = supabaseAdmin
    .from('meal_documents')
    .select(SEARCH_COLUMNS)
    .eq('person_id', personId);

  if (effectiveKind) builder = builder.eq('kind', effectiveKind);
  if (params.review_state) builder = builder.eq('review_state', params.review_state);
  if (!browse) {
    builder = builder.ilike('title', `%${escapeIlikePattern(query)}%`);
  }

  builder = builder.order('updated_at', { ascending: false }).limit(limit);

  const { data, error } = await builder;
  if (error) {
    // Graceful degradation: if the meal_documents store is absent in this
    // environment, return an empty (browse) outcome rather than 500ing the
    // Meal Library. All other errors still propagate.
    if (isMissingMealDocumentsStore(error)) {
      return { mode, query, kind: effectiveKind, browse, limit, results: [] };
    }
    throw new Error(`Failed to search meal_documents: ${error.message}`);
  }

  const rows = (data as MealDocumentSearchRow[]) ?? [];
  return {
    mode,
    query,
    kind: effectiveKind,
    browse,
    limit,
    results: rows.map(rowToSearchResult),
  };
}
