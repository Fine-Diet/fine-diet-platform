/**
 * Current-plan selection and generated-plan title/end_date helpers.
 *
 * Meal plans allow multiple historical rows. "Current" means status=active
 * only. Zero active → null (never mask with draft/archived history).
 * Multiple active is an integrity conflict: resolve deterministically for
 * read continuity (created_at DESC, start_date DESC, id DESC) while exposing
 * conflict metadata for diagnostics.
 */

import { addDaysToDateKey } from './planDateRange';
import type { Plan, PlanShape } from './types';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

export type CurrentPlanResolution = {
  plan: Plan | null;
  activeCount: number;
  integrityConflict: boolean;
  conflictPlanIds: string[];
};

function compareActivePlansNewestFirst(a: Plan, b: Plan): number {
  const byCreated = (b.created_at ?? '').localeCompare(a.created_at ?? '');
  if (byCreated !== 0) return byCreated;
  const byStart = (b.start_date ?? '').localeCompare(a.start_date ?? '');
  if (byStart !== 0) return byStart;
  return (b.id ?? '').localeCompare(a.id ?? '');
}

export function resolveCurrentPlan(plans: Plan[]): CurrentPlanResolution {
  const actives = plans.filter((plan) => plan.status === 'active');
  if (actives.length === 0) {
    return {
      plan: null,
      activeCount: 0,
      integrityConflict: false,
      conflictPlanIds: [],
    };
  }
  const ordered = [...actives].sort(compareActivePlansNewestFirst);
  const plan = ordered[0] ?? null;
  const integrityConflict = actives.length > 1;
  return {
    plan,
    activeCount: actives.length,
    integrityConflict,
    conflictPlanIds: integrityConflict ? ordered.map((p) => p.id) : [],
  };
}

/** Deterministic current-plan picker used by all app surfaces. */
export function selectCurrentPlan(plans: Plan[]): Plan | null {
  return resolveCurrentPlan(plans).plan;
}

/** Post-generate handoff target for Plans Home (legacy overview deep-link). */
export function buildPostGeneratePlansHomeHref(startDate: string): {
  pathname: string;
  query: { date: string };
} {
  return {
    pathname: APP_ROUTES.plans,
    query: { date: startDate },
  };
}

/**
 * Preferred post-generate handoff: land on the generated week workbench so
 * first-run users never bounce through the overview loop.
 */
export function buildPostGenerateWeekHref(args: {
  start_date: string;
  end_date?: string | null;
}): {
  pathname: string;
  query: { start: string; end: string };
} {
  const end =
    args.end_date && /^\d{4}-\d{2}-\d{2}$/.test(args.end_date)
      ? args.end_date
      : addDaysToDateKey(args.start_date, 6);
  return {
    pathname: APP_ROUTES.plansWeek,
    query: { start: args.start_date, end },
  };
}

/** Plans overview primary CTA: create when none, open when one exists. */
export function overviewWeeklyPlanPrimaryCtaLabel(hasActivePlan: boolean): string {
  return hasActivePlan ? 'Open Weekly Planner' : 'Create Weekly Plan';
}

export function resolveGeneratedPlanEndDate(args: {
  end_date?: string | null;
  start_date: string;
  plan_shape: PlanShape;
  planDayDates?: string[];
}): string | null {
  if (args.end_date && /^\d{4}-\d{2}-\d{2}$/.test(args.end_date)) {
    return args.end_date;
  }
  if (args.planDayDates && args.planDayDates.length > 0) {
    const ordered = [...args.planDayDates].sort((a, b) => a.localeCompare(b));
    return ordered[ordered.length - 1] ?? null;
  }
  if (args.plan_shape === 'week') return addDaysToDateKey(args.start_date, 6);
  if (args.plan_shape === 'day') return args.start_date;
  return null;
}

export function isStubPlanTitle(title: string | null | undefined): boolean {
  if (!title || !title.trim()) return true;
  return /^stub\b/i.test(title.trim());
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatPlanTitleFallback(args: {
  start_date: string;
  end_date: string | null;
  plan_shape: PlanShape;
}): string {
  const start = formatShortDate(args.start_date);
  if (args.plan_shape === 'day') return `Day plan · ${start}`;
  if (args.plan_shape === 'week') return `Week of ${start}`;
  if (args.end_date && args.end_date !== args.start_date) {
    return `Plan · ${start}–${formatShortDate(args.end_date)}`;
  }
  return `Plan · ${start}`;
}

/**
 * Prefer a real authored title; replace empty/stub gateway titles with a
 * deterministic dated fallback so "Stub week plan" never surfaces.
 */
export function resolveGeneratedPlanTitle(args: {
  authoredTitle?: string | null;
  start_date: string;
  end_date: string | null;
  plan_shape: PlanShape;
}): string {
  const authored = args.authoredTitle?.trim() ?? '';
  if (authored && !isStubPlanTitle(authored)) return authored;
  return formatPlanTitleFallback(args);
}
