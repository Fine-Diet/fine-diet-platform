/**
 * Pure coverage helpers for Plans next-best-action.
 * Thresholds live in forwardCoveragePolicy — this file only derives counts.
 */

import { addDaysToDateKey } from '@/lib/plans/planDateRange';
import type { PlanDay, PlannedMeal } from '@/lib/plans/types';
import type { PlansMealGuidanceDay, PlansMealGuidanceRow, PlansMealWindowState } from '@/lib/plans/home/types';
import { PLANS_FORWARD_COVERAGE_POLICY } from './forwardCoveragePolicy';
import type { DayCoverageKind } from './types';

const PLANNED_STATES = new Set<PlansMealWindowState>([
  'pending',
  'eaten',
  'skipped',
]);

export function isPlannedWindowState(state: PlansMealWindowState): boolean {
  return PLANNED_STATES.has(state);
}

export function coverageFromRows(rows: PlansMealGuidanceRow[]): DayCoverageKind {
  if (rows.length === 0) return 'unknown';
  const planned = rows.filter((row) => isPlannedWindowState(row.state)).length;
  if (planned === 0) return 'empty';
  if (planned < rows.length) return 'partial';
  return 'covered';
}

export function countForwardCoveredDaysFromPlan(args: {
  today: string;
  horizonDays?: number;
  days: Array<Pick<PlanDay, 'id' | 'date_local'>>;
  meals: Array<Pick<PlannedMeal, 'plan_day_id'>>;
}): number {
  const horizon = args.horizonDays ?? PLANS_FORWARD_COVERAGE_POLICY.horizonDays;
  let covered = 0;
  for (let offset = 1; offset <= horizon; offset += 1) {
    const date = addDaysToDateKey(args.today, offset);
    const day = args.days.find((entry) => entry.date_local === date);
    if (!day) continue;
    if (args.meals.some((meal) => meal.plan_day_id === day.id)) {
      covered += 1;
    }
  }
  return covered;
}

export function countForwardCoveredDaysFromMarkers(
  days: PlansMealGuidanceDay[],
  today: string,
): number {
  return days.filter(
    (day) =>
      day.date > today &&
      day.markers.some((marker) => isPlannedWindowState(marker.state)),
  ).length;
}
