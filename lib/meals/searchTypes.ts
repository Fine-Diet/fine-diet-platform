/**
 * Meal Object Foundation — Packet 6: Search modes + unified result contract
 *
 * Establishes a typed search contract that lets retrieval distinguish RESULT
 * TYPES (branded food vs MealDocument vs future restaurant/recent) and lets
 * callers request a SEARCH MODE that EXPANDS Fine Diet discovery beside the
 * existing branded-food search — never replacing or degrading it.
 *
 * Core product rule (docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md §7):
 *   Search filters expand discovery; branded food search stays behaviorally
 *   stable. `mode=foods` is the existing /api/foods/search path and is NOT
 *   served by the MealDocument search service — these types intentionally keep
 *   the food result shape untouched (it is wrapped, never re-modeled).
 *
 * SCOPE / SAFETY (P6):
 *   - Contract only. No I/O, no DB, no AI, no nutrition recompute here.
 *   - The food result variant wraps the EXISTING `FoodSearchResult` verbatim
 *     so branded search output cannot drift via this module.
 *   - `restaurants` and `recent` are declared but DEFERRED: no backing data is
 *     queried for them in P6 (see DEFERRED_SEARCH_MODES).
 */

import type { FoodSearchResult } from '@/lib/food/types';

import type {
  MealDocumentIntent,
  MealDocumentKind,
  MealNutrition,
  MealNutritionStatus,
  MealReviewState,
} from './types';

// ============================================================================
// Search modes
// ============================================================================

/**
 * Search modes layered BESIDE branded food search (audit §7).
 *
 *   - 'all'         — aggregate; may return multiple typed sections.
 *   - 'foods'       — existing branded/custom food search (must stay stable;
 *                     served by /api/foods/search, NOT by this service).
 *   - 'meals'       — MealDocument.kind = 'meal'.
 *   - 'recipes'     — MealDocument.kind = 'recipe'.
 *   - 'restaurants' — DEFERRED placeholder (no storage queried in P6).
 *   - 'recent'      — DEFERRED placeholder (no storage queried in P6).
 */
export const SEARCH_MODES = [
  'all',
  'foods',
  'meals',
  'recipes',
  'restaurants',
  'recent',
] as const;

export type SearchMode = (typeof SEARCH_MODES)[number];

/** Default mode when none is supplied. */
export const DEFAULT_SEARCH_MODE: SearchMode = 'all';

/**
 * Modes declared but not yet backed by data. P6 implements foods (untouched),
 * meals, recipes, and all; it documents restaurants/recent as deferred.
 */
export const DEFERRED_SEARCH_MODES: readonly SearchMode[] = ['restaurants', 'recent'];

/**
 * Modes served by the MealDocument search service (meal_documents store).
 * Note: `all` here means "all MealDocument kinds" (meals + recipes). Branded
 * food results in a true cross-domain `all` are appended by the caller from
 * the untouched /api/foods/search response — never merged inside this service.
 */
export const MEAL_DOCUMENT_SEARCH_MODES = ['all', 'meals', 'recipes'] as const;

export type MealDocumentSearchMode = (typeof MEAL_DOCUMENT_SEARCH_MODES)[number];

export function isSearchMode(value: unknown): value is SearchMode {
  return typeof value === 'string' && (SEARCH_MODES as readonly string[]).includes(value);
}

export function isMealDocumentSearchMode(
  value: unknown,
): value is MealDocumentSearchMode {
  return (
    typeof value === 'string' &&
    (MEAL_DOCUMENT_SEARCH_MODES as readonly string[]).includes(value)
  );
}

export function isDeferredSearchMode(value: SearchMode): boolean {
  return DEFERRED_SEARCH_MODES.includes(value);
}

/**
 * Map a MealDocument search mode to the `kind` filter applied against
 * meal_documents. `null` ⇒ no kind filter (return both meals and recipes).
 */
export function mealDocumentKindForMode(
  mode: MealDocumentSearchMode,
): MealDocumentKind | null {
  switch (mode) {
    case 'meals':
      return 'meal';
    case 'recipes':
      return 'recipe';
    case 'all':
    default:
      return null;
  }
}

// ============================================================================
// Typed result contract
// ============================================================================

/**
 * The discriminating tag of a unified search result. Mirrors the modes that
 * can produce typed sections.
 */
export type UnifiedSearchResultType = 'food' | 'meal_document' | 'restaurant' | 'recent';

/**
 * Branded/custom food result. The EXISTING `FoodSearchResult` is wrapped
 * verbatim (no fields renamed, dropped, or reordered) so the branded food
 * search shape stays byte-stable through the unified contract.
 */
export interface UnifiedFoodResult {
  type: 'food';
  result: FoodSearchResult;
}

/**
 * A MealDocument (recipe or meal) projected for search/list. This is the
 * typed contract that can later power log search and the Meal Library UI.
 */
export interface MealDocumentSearchResult {
  type: 'meal_document';
  /** 'meal' (assembled set) or 'recipe' (prep steps / yield). */
  document_kind: MealDocumentKind;
  id: string;
  person_id: string;
  title: string;
  description: string | null;
  review_state: MealReviewState;
  /** Denormalized provenance modality (document_json.source.source_type). */
  source_type: string | null;
  /** Intent/category tags (Meal Library filtering). */
  intents: MealDocumentIntent[];
  /** Per-serving nutrition when known; null otherwise. No recompute here. */
  nutrition: MealNutrition | null;
  /** Package 3 — honest nutrition status when derivable. */
  nutrition_status?: MealNutritionStatus | null;
  /** Package 3 — true when document_json lifecycle is archived. */
  archived?: boolean;
  updated_at: string | null;
}

/**
 * DEFERRED placeholder — restaurant menu items. No backing retrieval in P6.
 * Declared so the union is forward-compatible without overbuilding.
 */
export interface RestaurantSearchResult {
  type: 'restaurant';
  id: string;
  title: string;
  description?: string | null;
}

/**
 * DEFERRED placeholder — recent/history entries. No backing retrieval in P6.
 */
export interface RecentSearchResult {
  type: 'recent';
  id: string;
  title: string;
  occurred_at?: string | null;
}

/**
 * The unified result union. P6 actively produces `meal_document` results and
 * wraps existing `food` results; `restaurant`/`recent` are forward-declared.
 */
export type UnifiedSearchResult =
  | UnifiedFoodResult
  | MealDocumentSearchResult
  | RestaurantSearchResult
  | RecentSearchResult;
