/**
 * Pure builders for Plans Home Log vs Update action routes.
 * Log (non-empty) → planned-meal log adjust flow.
 * Update → plan day editMeal.
 * Empty Log → normal log-new flow (caller handles separately).
 */

import { buildPlannedMealLogHref } from '@/lib/plans/plannedMealLogRoute';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import type { PlansMealGuidanceRow } from './types';

export function buildPlansHomeLogHref(args: {
  row: Pick<PlansMealGuidanceRow, 'mealId' | 'slotKey' | 'targetTimeValue'>;
  selectedDate: string;
  redirect?: string;
}): string | null {
  if (!args.row.mealId) return null;
  return buildPlannedMealLogHref({
    date: args.selectedDate,
    time: args.row.targetTimeValue,
    mealSlot: args.row.slotKey,
    plannedMealId: args.row.mealId,
    redirect: args.redirect ?? APP_ROUTES.plans,
  });
}

export function buildPlansHomeUpdateHref(args: {
  row: Pick<PlansMealGuidanceRow, 'mealId'>;
  selectedDate: string;
  planId: string | null;
}): string | null {
  if (!args.row.mealId) return null;
  const base = args.planId
    ? APP_ROUTE_BUILDERS.planDayWithPlan(args.selectedDate, args.planId)
    : APP_ROUTE_BUILDERS.planDay(args.selectedDate);
  const joiner = base.includes('?') ? '&' : '?';
  return `${base}${joiner}editMeal=${encodeURIComponent(args.row.mealId)}`;
}

export function buildPlansHomeCreateMealHref(args: {
  date: string;
  slot: PlansMealGuidanceRow['slotKey'];
  planId: string | null;
}): string {
  const params = new URLSearchParams({
    date: args.date,
    slot: args.slot,
  });
  if (args.planId) params.set('planId', args.planId);
  return `${APP_ROUTES.plansCreateMeal}?${params.toString()}`;
}

export function buildPlansHomeEmptyLogHref(args: {
  row: Pick<PlansMealGuidanceRow, 'slotKey' | 'targetTimeValue'>;
  selectedDate: string;
}): string {
  const params = new URLSearchParams({
    tab: 'food',
    date: args.selectedDate,
    time: args.row.targetTimeValue,
    mealSlot: args.row.slotKey,
    redirect: APP_ROUTES.plans,
  });
  return `${APP_ROUTES.logNew}?${params.toString()}`;
}
