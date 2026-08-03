/**
 * Deterministic Plans Home presentation fixtures.
 * Allowed only outside production.
 */

import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import type {
  PlansHomeFixtureId,
  PlansHomeViewModel,
  PlansMealGuidanceDay,
  PlansMealGuidanceRow,
  PlansMealGuidanceViewModel,
  PlansMealWindowState,
  PlansPantryReadinessViewModel,
} from './types';

const WEEK_START = '2026-07-19'; // Sun
const SLOT_KEYS = ['breakfast', 'lunch', 'afternoon_snack', 'dinner'] as const;
const SLOT_META: Record<
  (typeof SLOT_KEYS)[number],
  { label: string; time: string; timeLabel: string }
> = {
  breakfast: { label: 'Breakfast', time: '11:00', timeLabel: '11:00' },
  lunch: { label: 'Lunch', time: '14:00', timeLabel: '2:00' },
  afternoon_snack: { label: 'Mini-Meal', time: '16:00', timeLabel: '4:00' },
  dinner: { label: 'Dinner', time: '18:00', timeLabel: '6:00' },
};

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()]!;
}

function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

function markersFor(
  states: PlansMealWindowState[],
): PlansMealGuidanceDay['markers'] {
  return SLOT_KEYS.map((slotKey, index) => ({
    slotKey,
    state: states[index] ?? 'empty',
  }));
}

function buildWeek(
  selectedStates: PlansMealWindowState[],
  otherStates: PlansMealWindowState[] = ['empty', 'empty', 'empty', 'empty'],
): PlansMealGuidanceDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(WEEK_START, index);
    return {
      date,
      weekdayShort: weekdayShort(date),
      dayOfMonth: dayOfMonth(date),
      markers: markersFor(index === 0 ? selectedStates : otherStates),
    };
  });
}

function row(
  slotKey: (typeof SLOT_KEYS)[number],
  state: PlansMealWindowState,
  mealName: string | null,
  mealId: string | null = null,
): PlansMealGuidanceRow {
  const meta = SLOT_META[slotKey];
  return {
    slotKey,
    targetTimeLabel: meta.timeLabel,
    targetTimeValue: meta.time,
    label: meta.label,
    mealName,
    mealId,
    state,
  };
}

function guidance(
  partial: Partial<PlansMealGuidanceViewModel> &
    Pick<PlansMealGuidanceViewModel, 'status'>,
): PlansMealGuidanceViewModel {
  return {
    selectedDate: WEEK_START,
    days: buildWeek(['empty', 'empty', 'empty', 'empty']),
    rows: [],
    planId: null,
    ...partial,
  };
}

function pantry(
  partial: Partial<PlansPantryReadinessViewModel> &
    Pick<PlansPantryReadinessViewModel, 'status'>,
): PlansPantryReadinessViewModel {
  return {
    columns: [],
    managePantryHref: APP_ROUTES.foodPantry,
    groceryListId: null,
    ...partial,
  };
}

const populatedPantryColumns = (
  listId: string | null,
): PlansPantryReadinessViewModel['columns'] => [
  {
    id: 'essentials',
    title: 'Essentials',
    primary: '80%',
    lines: ['12 stocked', '02 low', '01 missing'],
    href: APP_ROUTES.foodPantry,
  },
  {
    id: 'perishables',
    title: 'Perishables',
    primary: '73%',
    lines: ['08 fresh', '02 use soon', '01 expired'],
    href: APP_ROUTES.foodPantry,
  },
  {
    id: 'on_the_list',
    title: 'On The List',
    primary: '4 added',
    lines: ['02 unresolved', '01 unpriced', '01 ready to buy'],
    href: listId
      ? APP_ROUTE_BUILDERS.foodGroceryList(listId)
      : APP_ROUTES.foodGroceries,
  },
];

const populatedRows: PlansMealGuidanceRow[] = [
  row('breakfast', 'eaten', 'Stub breakfast', 'meal-breakfast'),
  row('lunch', 'empty', null),
  row('afternoon_snack', 'pending', 'Stub mini-meal', 'meal-mini'),
  row('dinner', 'pending', 'Stub dinner', 'meal-dinner'),
];

const loggedRows: PlansMealGuidanceRow[] = [
  row('breakfast', 'eaten', 'Stub breakfast', 'meal-breakfast'),
  row('lunch', 'eaten', 'Stub lunch', 'meal-lunch'),
  row('afternoon_snack', 'pending', 'Stub mini-meal', 'meal-mini'),
  row('dinner', 'pending', 'Stub dinner', 'meal-dinner'),
];

const skippedRows: PlansMealGuidanceRow[] = [
  row('breakfast', 'eaten', 'Stub breakfast', 'meal-breakfast'),
  row('lunch', 'skipped', 'Stub lunch', 'meal-lunch'),
  row('afternoon_snack', 'pending', 'Stub mini-meal', 'meal-mini'),
  row('dinner', 'pending', 'Stub dinner', 'meal-dinner'),
];

const emptyRows: PlansMealGuidanceRow[] = SLOT_KEYS.map((slotKey) =>
  row(slotKey, 'empty', null),
);

const DEMO_LIST_ID = 'fixture-my-grocery-list';
const DEMO_PLAN_ID = 'fixture-active-plan';

export const PLANS_HOME_FIXTURES: Record<PlansHomeFixtureId, PlansHomeViewModel> = {
  populated: {
    fixtureId: 'populated',
    guidance: guidance({
      status: 'ready',
      planId: DEMO_PLAN_ID,
      days: buildWeek(['eaten', 'empty', 'pending', 'pending']),
      rows: populatedRows,
    }),
    pantry: pantry({
      status: 'populated',
      groceryListId: DEMO_LIST_ID,
      columns: populatedPantryColumns(DEMO_LIST_ID),
    }),
  },
  loading: {
    fixtureId: 'loading',
    guidance: guidance({ status: 'loading' }),
    pantry: pantry({ status: 'loading' }),
  },
  no_schedule: {
    fixtureId: 'no_schedule',
    guidance: guidance({
      status: 'no_schedule',
      planId: DEMO_PLAN_ID,
      days: [],
      rows: [],
    }),
    pantry: pantry({
      status: 'populated',
      groceryListId: DEMO_LIST_ID,
      columns: populatedPantryColumns(DEMO_LIST_ID),
    }),
  },
  no_active_plan: {
    fixtureId: 'no_active_plan',
    guidance: guidance({
      status: 'no_active_plan',
      days: buildWeek(['empty', 'empty', 'empty', 'empty']),
      rows: emptyRows,
    }),
    pantry: pantry({
      status: 'populated',
      groceryListId: DEMO_LIST_ID,
      columns: populatedPantryColumns(DEMO_LIST_ID),
    }),
  },
  empty_day: {
    fixtureId: 'empty_day',
    guidance: guidance({
      status: 'ready',
      planId: DEMO_PLAN_ID,
      days: buildWeek(['empty', 'empty', 'empty', 'empty']),
      rows: emptyRows,
    }),
    pantry: pantry({
      status: 'populated',
      groceryListId: DEMO_LIST_ID,
      columns: populatedPantryColumns(DEMO_LIST_ID),
    }),
  },
  logged: {
    fixtureId: 'logged',
    guidance: guidance({
      status: 'ready',
      planId: DEMO_PLAN_ID,
      days: buildWeek(['eaten', 'eaten', 'pending', 'pending']),
      rows: loggedRows,
    }),
    pantry: pantry({
      status: 'populated',
      groceryListId: DEMO_LIST_ID,
      columns: populatedPantryColumns(DEMO_LIST_ID),
    }),
  },
  skipped: {
    fixtureId: 'skipped',
    guidance: guidance({
      status: 'ready',
      planId: DEMO_PLAN_ID,
      days: buildWeek(['eaten', 'skipped', 'pending', 'pending']),
      rows: skippedRows,
    }),
    pantry: pantry({
      status: 'populated',
      groceryListId: DEMO_LIST_ID,
      columns: populatedPantryColumns(DEMO_LIST_ID),
    }),
  },
  action_error: {
    fixtureId: 'action_error',
    guidance: guidance({
      status: 'ready',
      planId: DEMO_PLAN_ID,
      days: buildWeek(['eaten', 'empty', 'pending', 'pending']),
      rows: populatedRows,
      errorMessage: 'Could not update this meal. Try again.',
    }),
    pantry: pantry({
      status: 'populated',
      groceryListId: DEMO_LIST_ID,
      columns: populatedPantryColumns(DEMO_LIST_ID),
    }),
  },
  pantry_empty: {
    fixtureId: 'pantry_empty',
    guidance: guidance({
      status: 'ready',
      planId: DEMO_PLAN_ID,
      days: buildWeek(['eaten', 'empty', 'pending', 'pending']),
      rows: populatedRows,
    }),
    pantry: pantry({
      status: 'empty',
      message: 'No Pantry items yet. Add staples to track readiness.',
      columns: [
        {
          id: 'essentials',
          title: 'Essentials',
          primary: '—',
          lines: ['0 stocked', '0 low', '0 missing'],
          href: APP_ROUTES.foodPantry,
        },
        {
          id: 'perishables',
          title: 'Perishables',
          primary: '—',
          lines: ['0 fresh', '0 use soon', '0 expired'],
          href: APP_ROUTES.foodPantry,
        },
        {
          id: 'on_the_list',
          title: 'On The List',
          primary: '0 added',
          lines: ['0 unresolved', '0 unpriced', '0 ready to buy'],
          href: APP_ROUTES.foodGroceries,
        },
      ],
    }),
  },
  pantry_no_list: {
    fixtureId: 'pantry_no_list',
    guidance: guidance({
      status: 'ready',
      planId: DEMO_PLAN_ID,
      days: buildWeek(['eaten', 'empty', 'pending', 'pending']),
      rows: populatedRows,
    }),
    pantry: pantry({
      status: 'no_list',
      message: 'No active grocery list yet.',
      columns: populatedPantryColumns(null).map((column) =>
        column.id === 'on_the_list'
          ? { ...column, primary: '0 added', lines: ['No list', 'Open Groceries', 'to start'] }
          : column,
      ),
    }),
  },
  pantry_error: {
    fixtureId: 'pantry_error',
    guidance: guidance({
      status: 'ready',
      planId: DEMO_PLAN_ID,
      days: buildWeek(['eaten', 'empty', 'pending', 'pending']),
      rows: populatedRows,
    }),
    pantry: pantry({
      status: 'error',
      errorMessage: 'Could not load Pantry readiness.',
    }),
  },
};

export function getPlansHomeFixture(id: PlansHomeFixtureId = 'populated'): PlansHomeViewModel {
  return PLANS_HOME_FIXTURES[id] ?? PLANS_HOME_FIXTURES.populated;
}

export function parsePlansHomeFixtureId(value: unknown): PlansHomeFixtureId | null {
  if (typeof value !== 'string') return null;
  if (value in PLANS_HOME_FIXTURES) return value as PlansHomeFixtureId;
  return null;
}

export function plansHomeFixturesAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export const PLANS_HOME_DEMO_PLAN_ID = DEMO_PLAN_ID;
export const PLANS_HOME_DEMO_LIST_ID = DEMO_LIST_ID;
export const PLANS_HOME_FIXTURE_WEEK_START = WEEK_START;
