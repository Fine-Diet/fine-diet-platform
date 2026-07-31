/**
 * Current-plan selection and generated-plan title/end_date helpers.
 *
 * Meal plans allow multiple historical rows. "Current" means status=active
 * only — newest created_at within the active set (tie-break start_date DESC).
 * Legacy multiple-active rows are tolerated. Archived/draft-only lists yield
 * null so intentional no-active state is never masked by history.
 */

import { addDaysToDateKey } from './planDateRange';
import type { Plan, PlanShape } from './types';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

export function selectCurrentPlan(plans: Plan[]): Plan | null {
  const actives = plans.filter((plan) => plan.status === 'active');
  if (actives.length === 0) return null;
  return (
    [...actives].sort((a, b) => {
      const byCreated = (b.created_at ?? '').localeCompare(a.created_at ?? '');
      if (byCreated !== 0) return byCreated;
      return (b.start_date ?? '').localeCompare(a.start_date ?? '');
    })[0] ?? null
  );
}

/** Post-generate handoff target for Plans Home. */
export function buildPostGeneratePlansHomeHref(startDate: string): {
  pathname: string;
  query: { date: string };
} {
  return {
    pathname: APP_ROUTES.plans,
    query: { date: startDate },
  };
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
