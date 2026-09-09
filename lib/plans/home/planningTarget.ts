import { resolveGeneratedPlanEndDate, selectCurrentPlan } from '@/lib/plans/currentPlan';
import type { Plan } from '@/lib/plans/types';

export type PlansHomePlanningTargetKind = 'active_coverage' | 'manual_dated_day';

export interface PlansHomePlanningTargetSelection {
  plan: Plan;
  kind: PlansHomePlanningTargetKind;
}

function planCoversDate(plan: Plan, dateLocal: string): boolean {
  const end =
    resolveGeneratedPlanEndDate({
      end_date: plan.end_date,
      start_date: plan.start_date,
      plan_shape: plan.plan_shape,
    }) ?? plan.start_date;
  return dateLocal >= plan.start_date && dateLocal <= end;
}

function isWritableManualDatedDay(plan: Plan, dateLocal: string): boolean {
  return (
    plan.source === 'user_manual' &&
    plan.plan_shape === 'day' &&
    plan.status !== 'archived' &&
    plan.start_date === dateLocal &&
    (plan.end_date == null || plan.end_date === dateLocal)
  );
}

function compareManualDatedPlans(a: Plan, b: Plan): number {
  if (a.status !== b.status) {
    if (a.status === 'active') return -1;
    if (b.status === 'active') return 1;
  }
  const byUpdated = (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
  if (byUpdated !== 0) return byUpdated;
  const byCreated = (b.created_at ?? '').localeCompare(a.created_at ?? '');
  if (byCreated !== 0) return byCreated;
  return (b.id ?? '').localeCompare(a.id ?? '');
}

/**
 * Read-only Plans Home target selection. It never changes plan lifecycle.
 * The canonical active plan wins only while it covers the selected date.
 * Otherwise an exact-date writable manual day container is selected
 * deterministically.
 */
export function selectPlansHomePlanningTarget(
  plans: Plan[],
  dateLocal: string,
): PlansHomePlanningTargetSelection | null {
  const current = selectCurrentPlan(plans);
  if (current && planCoversDate(current, dateLocal)) {
    return { plan: current, kind: 'active_coverage' };
  }

  const manualDay = plans
    .filter((plan) => isWritableManualDatedDay(plan, dateLocal))
    .sort(compareManualDatedPlans)[0];
  return manualDay ? { plan: manualDay, kind: 'manual_dated_day' } : null;
}

/**
 * A successful Plans Home Save gets one immediate exact-target read. Ordinary
 * loads and later navigation continue through deterministic target selection.
 */
export function resolvePlansHomeReadPlanId(args: {
  plans: Plan[];
  dateLocal: string;
  postSaveTarget?: { planId: string; dateLocal: string } | null;
}): string | null {
  if (args.postSaveTarget?.dateLocal === args.dateLocal) {
    return args.postSaveTarget.planId;
  }
  return selectPlansHomePlanningTarget(args.plans, args.dateLocal)?.plan.id ?? null;
}

export { isWritableManualDatedDay, planCoversDate };
