import { buildPlannedMealLogHref, type BuildPlannedMealLogHrefInput } from '@/lib/plans/plannedMealLogRoute';

export const APP_ROUTES = {
  home: '/app',
  onboarding: '/app/onboarding',
  programs: '/app/programs',
  plans: '/app/plans',
  plansWeek: '/app/plans/week',
  pantry: '/app/pantry',
  meals: '/app/meals',
  todayPlan: '/app/plans/today',
  planImportNew: '/app/plans/imports/new',
  planSocialImportNew: '/app/plans/imports/social/new',
  log: '/app/log',
  logNew: '/app/log/new',
  profile: '/app/profile',
  settings: '/app/settings',
} as const;

export const LEGACY_JOURNAL_ROUTES = {
  home: '/journal/home',
  insights: '/journal/insights',
  programs: '/journal/programs',
  plans: '/journal/plans',
  journal: '/journal',
  log: '/journal/log',
  profile: '/journal/profile',
} as const;

export { buildPlannedMealLogHref };

export const APP_ROUTE_BUILDERS = {
  programDetail: (slug: string) => `${APP_ROUTES.programs}/${slug}`,
  planDay: (date: string) => `${APP_ROUTES.plans}/day/${date}`,
  planDayWithPlan: (date: string, planId: string) =>
    `${APP_ROUTES.plans}/day/${date}?planId=${encodeURIComponent(planId)}`,
  logNewPlanned: (input: BuildPlannedMealLogHrefInput) => buildPlannedMealLogHref(input),
  planGrocery: (planId: string) => `${APP_ROUTES.plans}/grocery/${planId}`,
  planImport: (id: string) => `${APP_ROUTES.plans}/imports/${id}`,
  planSocialImport: (id: string) => `${APP_ROUTES.plans}/imports/social/${id}`,
  planEatOut: (id: string) => `${APP_ROUTES.plans}/eat-out/${id}`,
  logEntry: (id: string) => `${APP_ROUTES.log}/entry/${id}`,
} as const;

export const LEGACY_JOURNAL_ROUTE_BUILDERS = {
  programDetail: (slug: string) => `${LEGACY_JOURNAL_ROUTES.programs}/${slug}`,
  planDay: (date: string) => `${LEGACY_JOURNAL_ROUTES.plans}/day/${date}`,
  planGrocery: (planId: string) => `${LEGACY_JOURNAL_ROUTES.plans}/grocery/${planId}`,
  planImport: (id: string) => `${LEGACY_JOURNAL_ROUTES.plans}/imports/${id}`,
  planSocialImport: (id: string) => `${LEGACY_JOURNAL_ROUTES.plans}/imports/social/${id}`,
  planEatOut: (id: string) => `${LEGACY_JOURNAL_ROUTES.plans}/eat-out/${id}`,
  logEntry: (id: string) => `${LEGACY_JOURNAL_ROUTES.journal}/entry/${id}`,
} as const;

function stripQueryAndHash(pathname: string): string {
  return pathname.split('?')[0].split('#')[0];
}

export function isCanonicalAppRoute(pathname: string): boolean {
  const path = stripQueryAndHash(pathname);
  return path === APP_ROUTES.home || path.startsWith(`${APP_ROUTES.home}/`);
}

export function isLegacyJournalRoute(pathname: string): boolean {
  const path = stripQueryAndHash(pathname);
  return path === LEGACY_JOURNAL_ROUTES.journal || path.startsWith(`${LEGACY_JOURNAL_ROUTES.journal}/`);
}

export function isAppShellRoute(pathname: string): boolean {
  return isCanonicalAppRoute(pathname) || isLegacyJournalRoute(pathname);
}

export function getCanonicalAppRouteForLegacyJournalPath(pathname: string): string | null {
  const path = stripQueryAndHash(pathname);

  if (path === LEGACY_JOURNAL_ROUTES.home) return APP_ROUTES.home;
  if (path === LEGACY_JOURNAL_ROUTES.insights) return APP_ROUTES.programs;
  if (path === LEGACY_JOURNAL_ROUTES.programs) return APP_ROUTES.programs;
  if (path.startsWith(`${LEGACY_JOURNAL_ROUTES.programs}/`)) {
    return path.replace(LEGACY_JOURNAL_ROUTES.programs, APP_ROUTES.programs);
  }
  if (path === LEGACY_JOURNAL_ROUTES.plans) return APP_ROUTES.plans;
  if (path === `${LEGACY_JOURNAL_ROUTES.plans}/week`) return APP_ROUTES.plansWeek;
  if (path.startsWith(`${LEGACY_JOURNAL_ROUTES.plans}/day/`)) {
    return path.replace(`${LEGACY_JOURNAL_ROUTES.plans}/day`, `${APP_ROUTES.plans}/day`);
  }
  if (path.startsWith(`${LEGACY_JOURNAL_ROUTES.plans}/grocery/`)) {
    return path.replace(`${LEGACY_JOURNAL_ROUTES.plans}/grocery`, `${APP_ROUTES.plans}/grocery`);
  }
  if (path.startsWith(`${LEGACY_JOURNAL_ROUTES.plans}/imports/`)) {
    return path.replace(`${LEGACY_JOURNAL_ROUTES.plans}/imports`, `${APP_ROUTES.plans}/imports`);
  }
  if (path === LEGACY_JOURNAL_ROUTES.journal) return APP_ROUTES.log;
  if (path === LEGACY_JOURNAL_ROUTES.log) return APP_ROUTES.logNew;
  if (path.startsWith(`${LEGACY_JOURNAL_ROUTES.journal}/entry/`)) {
    return path.replace(`${LEGACY_JOURNAL_ROUTES.journal}/entry`, `${APP_ROUTES.log}/entry`);
  }
  if (path === LEGACY_JOURNAL_ROUTES.profile) return APP_ROUTES.profile;

  return null;
}
