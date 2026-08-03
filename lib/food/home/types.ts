/**
 * Food Home typed view models.
 *
 * Presentation fixtures and the future Food Home read endpoint both render
 * through these contracts so Module 1–3 UI does not redesign when live data
 * attaches.
 */

export type FoodReadinessStatus =
  | 'loading'
  | 'no_active_plan'
  | 'no_planned_requirements'
  | 'populated'
  | 'all_ready'
  | 'error';

export type FoodReadinessRowStatus = 'eligible' | 'already_added';

export interface FoodReadinessIngredientRow {
  /** Stable demand key used for selection and future reconciliation. */
  demandKey: string;
  name: string;
  /** Shown on hover / keyboard focus. */
  quantityLabel: string;
  /** Contributing plan / meal / date context, shown on hover / focus. */
  contextLabel: string;
  status: FoodReadinessRowStatus;
}

export interface FoodReadinessViewModel {
  status: FoodReadinessStatus;
  /** Up to four upcoming ingredient-demand rows. */
  rows: FoodReadinessIngredientRow[];
  errorMessage?: string;
  /** Target durable list label for success copy. */
  groceryListLabel: string;
}

export type ReadyAnytimeStatus =
  | 'idle'
  | 'invalid_range'
  | 'no_active_plan'
  | 'no_meals_in_range'
  | 'submitting'
  | 'success'
  | 'error';

export interface ReadyAnytimeViewModel {
  status: ReadyAnytimeStatus;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  hasActivePlan: boolean;
  /** Fixture or live list id after successful handoff. */
  successListId?: string;
  errorMessage?: string;
  message?: string;
}

export type FoodHomeFixtureId =
  | 'populated'
  | 'loading'
  | 'no_active_plan'
  | 'no_planned_requirements'
  | 'all_ready'
  | 'error'
  | 'ready_anytime_invalid'
  | 'ready_anytime_no_meals';

export interface FoodHomeViewModel {
  readiness: FoodReadinessViewModel;
  readyAnytime: ReadyAnytimeViewModel;
  fixtureId: FoodHomeFixtureId | 'live';
}

export interface AddToGroceryListResult {
  ok: boolean;
  listId?: string;
  addedCount?: number;
  errorMessage?: string;
}

export interface MakeListResult {
  ok: boolean;
  listId?: string;
  status?: ReadyAnytimeStatus;
  errorMessage?: string;
  message?: string;
}

export type AddToGroceryListHandler = (
  demandKeys: string[],
) => Promise<AddToGroceryListResult>;

export type MakeListHandler = (input: {
  startDate: string;
  endDate: string;
}) => Promise<MakeListResult>;

export interface SavedRecipePickerItem {
  id: string;
  title: string;
  subtitle: string;
  available: boolean;
}

export type RecipePickerSheetStatus = 'loading' | 'empty' | 'ready' | 'unavailable';

export interface RecipeUploadAcceptedFile {
  name: string;
  size: number;
  mimeType: string;
}
