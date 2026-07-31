/**
 * Deterministic Food Home presentation fixtures.
 *
 * Safe for local/demo review only. Production builds must not render these
 * as live user data unless an explicit non-production gate allows it.
 */

import type {
  FoodHomeFixtureId,
  FoodHomeViewModel,
  FoodReadinessViewModel,
  ReadyAnytimeViewModel,
  SavedRecipePickerItem,
} from './types';

const GROCERY_LIST_LABEL = 'My Grocery List';
const DEMO_LIST_ID = 'fixture-my-grocery-list';

const populatedRows: FoodReadinessViewModel['rows'] = [
  {
    demandKey: 'chicken-breast',
    name: 'Chicken Breast',
    quantityLabel: '2 lb',
    contextLabel: 'Tue & Thu dinners',
    status: 'eligible',
  },
  {
    demandKey: 'spinach',
    name: 'Spinach',
    quantityLabel: '10 oz',
    contextLabel: 'Wed lunch prep',
    status: 'eligible',
  },
  {
    demandKey: 'greek-yogurt',
    name: 'Greek Yogurt',
    quantityLabel: '32 oz',
    contextLabel: 'Breakfasts this week',
    status: 'eligible',
  },
  {
    demandKey: 'olive-oil',
    name: 'Olive Oil',
    quantityLabel: '1 bottle',
    contextLabel: 'Already on My Grocery List',
    status: 'already_added',
  },
];

function readiness(
  partial: Partial<FoodReadinessViewModel> & Pick<FoodReadinessViewModel, 'status'>,
): FoodReadinessViewModel {
  return {
    rows: [],
    groceryListLabel: GROCERY_LIST_LABEL,
    ...partial,
  };
}

function readyAnytime(
  partial: Partial<ReadyAnytimeViewModel> &
    Pick<ReadyAnytimeViewModel, 'status' | 'hasActivePlan'>,
): ReadyAnytimeViewModel {
  return {
    startDate: '2026-07-12',
    endDate: '2026-07-12',
    ...partial,
  };
}

export const FOOD_HOME_FIXTURES: Record<FoodHomeFixtureId, FoodHomeViewModel> = {
  populated: {
    fixtureId: 'populated',
    readiness: readiness({ status: 'populated', rows: populatedRows }),
    readyAnytime: readyAnytime({ status: 'idle', hasActivePlan: true }),
  },
  loading: {
    fixtureId: 'loading',
    readiness: readiness({ status: 'loading' }),
    readyAnytime: readyAnytime({ status: 'idle', hasActivePlan: true }),
  },
  no_active_plan: {
    fixtureId: 'no_active_plan',
    readiness: readiness({ status: 'no_active_plan' }),
    readyAnytime: readyAnytime({
      status: 'no_active_plan',
      hasActivePlan: false,
      message: 'Activate a plan to generate a grocery list from planned meals.',
    }),
  },
  no_planned_requirements: {
    fixtureId: 'no_planned_requirements',
    readiness: readiness({ status: 'no_planned_requirements' }),
    readyAnytime: readyAnytime({ status: 'idle', hasActivePlan: true }),
  },
  all_ready: {
    fixtureId: 'all_ready',
    readiness: readiness({
      status: 'all_ready',
      rows: populatedRows.map((row) => ({ ...row, status: 'already_added' as const })),
    }),
    readyAnytime: readyAnytime({ status: 'idle', hasActivePlan: true }),
  },
  error: {
    fixtureId: 'error',
    readiness: readiness({
      status: 'error',
      errorMessage: 'Could not load upcoming kitchen requirements.',
    }),
    readyAnytime: readyAnytime({
      status: 'error',
      hasActivePlan: true,
      errorMessage: 'Could not prepare this grocery list. Try again.',
    }),
  },
  ready_anytime_invalid: {
    fixtureId: 'ready_anytime_invalid',
    readiness: readiness({ status: 'populated', rows: populatedRows }),
    readyAnytime: readyAnytime({
      status: 'invalid_range',
      hasActivePlan: true,
      startDate: '2026-07-18',
      endDate: '2026-07-12',
      message: 'Start date cannot be after end date.',
    }),
  },
  ready_anytime_no_meals: {
    fixtureId: 'ready_anytime_no_meals',
    readiness: readiness({ status: 'populated', rows: populatedRows }),
    readyAnytime: readyAnytime({
      status: 'no_meals_in_range',
      hasActivePlan: true,
      message: 'Nothing is planned in this range.',
    }),
  },
};

export const FOOD_HOME_RECIPE_PICKER_FIXTURES: SavedRecipePickerItem[] = [
  {
    id: 'recipe-lemon-herb-chicken',
    title: 'Lemon Herb Chicken',
    subtitle: 'Recipe · 4 servings',
    available: true,
  },
  {
    id: 'recipe-spinach-frittata',
    title: 'Spinach Frittata',
    subtitle: 'Recipe · 2 servings',
    available: true,
  },
  {
    id: 'recipe-unavailable-stew',
    title: 'Weekend Stew (archived)',
    subtitle: 'Unavailable for meal seeding',
    available: false,
  },
];

export function getFoodHomeFixture(id: FoodHomeFixtureId = 'populated'): FoodHomeViewModel {
  return FOOD_HOME_FIXTURES[id] ?? FOOD_HOME_FIXTURES.populated;
}

export function parseFoodHomeFixtureId(value: unknown): FoodHomeFixtureId | null {
  if (typeof value !== 'string') return null;
  if (value in FOOD_HOME_FIXTURES) return value as FoodHomeFixtureId;
  return null;
}

/**
 * Presentation fixtures are allowed only outside production, or when an
 * explicit local demo query is present in non-production builds.
 */
export function foodHomeFixturesAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export const FOOD_HOME_DEMO_LIST_ID = DEMO_LIST_ID;
