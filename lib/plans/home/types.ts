/**
 * Plans Home typed view models.
 *
 * Live adapters and presentation fixtures both render through these contracts.
 */

export type PlansMealWindowState = 'empty' | 'pending' | 'eaten' | 'skipped' | 'unknown';

export type PlansMealGuidanceStatus =
  | 'loading'
  | 'no_schedule'
  | 'no_active_plan'
  | 'ready'
  | 'error';

export type PlansPantryReadinessStatus =
  | 'loading'
  | 'populated'
  | 'empty'
  | 'no_list'
  | 'no_pricing'
  | 'error';

export type PlansHomeFixtureId =
  | 'populated'
  | 'loading'
  | 'no_schedule'
  | 'no_active_plan'
  | 'empty_day'
  | 'logged'
  | 'skipped'
  | 'action_error'
  | 'pantry_empty'
  | 'pantry_no_list'
  | 'pantry_error';

export interface PlansMealWindowMarker {
  slotKey: string;
  state: PlansMealWindowState;
}

export interface PlansMealGuidanceDay {
  date: string; // YYYY-MM-DD
  weekdayShort: string; // Sun
  dayOfMonth: number;
  markers: PlansMealWindowMarker[];
}

export interface PlansMealGuidanceRow {
  slotKey: string;
  targetTimeLabel: string; // "11:00"
  targetTimeValue: string; // "11:00" HH:mm for routes
  label: string;
  mealName: string | null;
  mealId: string | null;
  state: PlansMealWindowState;
}

export interface PlansMealGuidanceViewModel {
  status: PlansMealGuidanceStatus;
  selectedDate: string;
  days: PlansMealGuidanceDay[];
  rows: PlansMealGuidanceRow[];
  planId: string | null;
  errorMessage?: string;
}

export interface PlansPantryMetricColumn {
  id: 'essentials' | 'perishables' | 'on_the_list';
  title: string;
  primary: string;
  lines: string[];
  href: string;
}

export interface PlansPantryReadinessViewModel {
  status: PlansPantryReadinessStatus;
  columns: PlansPantryMetricColumn[];
  managePantryHref: string;
  groceryListId: string | null;
  errorMessage?: string;
  message?: string;
}

export interface PlansHomeViewModel {
  fixtureId: PlansHomeFixtureId | 'live';
  guidance: PlansMealGuidanceViewModel;
  pantry: PlansPantryReadinessViewModel;
}

export type PlansLogMealHandler = (row: PlansMealGuidanceRow) => Promise<{
  ok: boolean;
  errorMessage?: string;
}>;

/** Collapsed contextual indicator derived from row state (not a stored status). */
export function contextualActionForRow(state: PlansMealWindowState): {
  label: string;
  marker: 'check' | 'hollow' | 'filled' | 'skipped' | 'unknown';
} {
  switch (state) {
    case 'eaten':
      return { label: 'Logged', marker: 'check' };
    case 'empty':
      return { label: 'Plan', marker: 'hollow' };
    case 'pending':
      return { label: 'Update', marker: 'filled' };
    case 'skipped':
      return { label: 'Skipped', marker: 'skipped' };
    case 'unknown':
    default:
      return { label: '—', marker: 'unknown' };
  }
}
