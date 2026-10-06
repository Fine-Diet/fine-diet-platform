/**
 * Columns written by `logSearchEvent` / `POST /api/foods/search-event`.
 * `scripts/sql/foodSearchEventsCurrent.sql` is the idempotent schema
 * these names must match. Production does not have this table yet.
 */

export const FOOD_SEARCH_EVENT_INSERT_COLUMNS = [
  'event_type',
  'person_id',
  'session_id',
  'query',
  'normalized_query',
  'total_result_count',
  'curated_result_count',
  'off_result_count',
  'off_fallback_shown',
  'near_exact_match_existed',
  'selected_food_id',
  'selected_food_source',
  'selected_result_position',
  'page_context',
] as const;

export type FoodSearchEventColumn = (typeof FOOD_SEARCH_EVENT_INSERT_COLUMNS)[number];

export type FoodSearchEventType =
  | 'search_executed'
  | 'search_zero_results'
  | 'search_result_selected'
  | 'search_abandoned';

export interface FoodSearchEventInsertInput {
  eventType: FoodSearchEventType;
  personId?: string | null;
  sessionId?: string | null;
  query?: string | null;
  normalizedQuery?: string | null;
  totalResultCount?: number | null;
  curatedResultCount?: number | null;
  offResultCount?: number | null;
  offFallbackShown?: boolean | null;
  nearExactMatchExisted?: boolean | null;
  selectedFoodId?: string | null;
  selectedFoodSource?: string | null;
  selectedResultPosition?: number | null;
  pageContext?: string | null;
}

export function buildFoodSearchEventRow(
  input: FoodSearchEventInsertInput,
): Record<FoodSearchEventColumn, string | number | boolean | null> {
  return {
    event_type: input.eventType,
    person_id: input.personId ?? null,
    session_id: input.sessionId ?? null,
    query: input.query ?? null,
    normalized_query: input.normalizedQuery ?? null,
    total_result_count: input.totalResultCount ?? null,
    curated_result_count: input.curatedResultCount ?? null,
    off_result_count: input.offResultCount ?? null,
    off_fallback_shown: input.offFallbackShown ?? null,
    near_exact_match_existed: input.nearExactMatchExisted ?? null,
    selected_food_id: input.selectedFoodId ?? null,
    selected_food_source: input.selectedFoodSource ?? null,
    selected_result_position: input.selectedResultPosition ?? null,
    page_context: input.pageContext ?? null,
  };
}
