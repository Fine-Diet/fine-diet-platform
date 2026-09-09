/**
 * Plans Home typed view models.
 *
 * Live adapters and presentation fixtures both render through these contracts.
 */

import type { PlannedMeal, PlanSlot } from '@/lib/plans/types';

export type PlansMealWindowState = 'empty' | 'pending' | 'eaten' | 'skipped' | 'unknown';

export type PlansMealGuidanceStatus =
  | 'loading'
  | 'no_schedule'
  | 'no_active_plan'
  | 'out_of_range'
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
  /** Planning intent only. Execution state must never change this value. */
  planned: boolean;
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
  /** Exact persisted container and structural owner used by Home + Day. */
  meal?: PlannedMeal | null;
  planSlot?: PlanSlot | null;
  journalEntryId?: string | null;
  state: PlansMealWindowState;
}

export interface PlansMealGuidanceViewModel {
  status: PlansMealGuidanceStatus;
  selectedDate: string;
  days: PlansMealGuidanceDay[];
  rows: PlansMealGuidanceRow[];
  planId: string | null;
  plannedCount: number;
  totalCount: number;
  projectedNds: number | null;
  plannedCalories: number | null;
  dailyCalorieGoal: number | null;
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

/** Row copy may reflect execution; its marker remains planning-intent only. */
export function contextualActionForRow(state: PlansMealWindowState): {
  label: string;
  marker: 'hollow' | 'filled';
} {
  switch (state) {
    case 'eaten':
      return { label: 'Logged', marker: 'filled' };
    case 'empty':
      return { label: 'Plan', marker: 'hollow' };
    case 'pending':
      return { label: 'Planned', marker: 'filled' };
    case 'skipped':
      return { label: 'Skipped', marker: 'filled' };
    case 'unknown':
    default:
      return { label: 'Planned', marker: 'filled' };
  }
}
