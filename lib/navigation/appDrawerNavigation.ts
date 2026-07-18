import { APP_ROUTES } from '@/lib/routes/appRoutes';

/**
 * Shared configuration for the signed-in app left drawer navigation.
 *
 * This is the single source of truth for the drawer's hub taxonomy so the
 * `AppSideMenu` component stays presentational. The taxonomy intentionally
 * differs from the bottom footer nav (Home, Programs, Log, Plans + Quick
 * Entry) — the drawer is the broader hub map.
 *
 * Routing rules (from the FD-APP-NAV execution packet):
 * - Use canonical `APP_ROUTES` where a route already exists.
 * - For partial / future items, point to the closest safe existing route
 *   (with query params where helpful) so navigation never 404s, and tag the
 *   item so the UI can show a "Soon" treatment.
 * - Assessments links to the Programs collection/section, never to Gut Check.
 *   Gut Check is one assessment instance and is deliberately absent here.
 */

export type DrawerItemStatus = 'current' | 'partial' | 'coming-soon';

export interface DrawerChildItem {
  id: string;
  label: string;
  /** Safe, navigable target. Closest existing route for partial/coming-soon. */
  href: string;
  status: DrawerItemStatus;
}

export interface DrawerHub {
  id: string;
  label: string;
  /** `link` renders a single row; `hub` renders an expandable accordion. */
  type: 'link' | 'hub';
  /** Target for a `link` hub, or the hub-header's own destination. */
  href: string;
  /** Route prefix used to derive the active hub from the current pathname. */
  matchPrefix: string;
  status: DrawerItemStatus;
  items?: DrawerChildItem[];
}

const { programs, log, logNew, plans, pantry, meals, profile, home } = APP_ROUTES;

/** Primary hubs, in display order, shown at the top of the drawer. */
export const APP_DRAWER_HUBS: DrawerHub[] = [
  {
    id: 'home',
    label: 'Home',
    type: 'link',
    href: home,
    matchPrefix: home,
    status: 'current',
  },
  {
    id: 'programs',
    label: 'Programs',
    type: 'hub',
    href: programs,
    matchPrefix: programs,
    status: 'current',
    items: [
      { id: 'programs-home', label: 'Programs Home', href: programs, status: 'current' },
      { id: 'active-program', label: 'Active Program', href: programs, status: 'partial' },
      { id: 'baseline', label: 'Fine Diet Method / Baseline', href: programs, status: 'coming-soon' },
      { id: 'assessments', label: 'Assessments', href: `${programs}?section=assessments`, status: 'coming-soon' },
      { id: 'program-library', label: 'Program Library', href: programs, status: 'current' },
      { id: 'integrative-care', label: 'Integrative Care', href: `${programs}?section=care`, status: 'coming-soon' },
    ],
  },
  {
    id: 'log',
    label: 'Log',
    type: 'hub',
    href: log,
    matchPrefix: log,
    status: 'current',
    items: [
      { id: 'log-overview', label: 'Log Overview', href: log, status: 'current' },
      { id: 'log-new', label: 'New Log Entry', href: logNew, status: 'current' },
      { id: 'log-nutrition', label: 'Nutrition', href: `${logNew}?type=intake&tab=food`, status: 'current' },
      { id: 'log-hydration', label: 'Hydration', href: `${logNew}?tab=water`, status: 'current' },
      { id: 'log-mood', label: 'Mood', href: `${logNew}?tab=mood`, status: 'current' },
      { id: 'log-movement', label: 'Movement', href: `${logNew}?tab=movement`, status: 'current' },
      { id: 'log-summary', label: 'Daily Summary', href: `${log}?section=summary`, status: 'partial' },
      { id: 'log-tracking', label: 'Tracking Preferences', href: `${profile}?section=tracking`, status: 'partial' },
    ],
  },
  {
    id: 'plans',
    label: 'Plans',
    type: 'hub',
    href: plans,
    matchPrefix: plans,
    status: 'current',
    items: [
      { id: 'plans-home', label: 'Plans Home', href: plans, status: 'current' },
      { id: 'plans-today', label: "Today's Plan", href: APP_ROUTES.todayPlan, status: 'current' },
      { id: 'plans-week', label: 'Weekly Plan', href: APP_ROUTES.plansWeek, status: 'current' },
      { id: 'plans-day-templates', label: 'Day Templates', href: APP_ROUTES.plansDayTemplates, status: 'current' },
      { id: 'plans-week-patterns', label: 'Week Patterns', href: APP_ROUTES.plansWeekPatterns, status: 'current' },
      { id: 'plans-grocery', label: 'Grocery List', href: plans, status: 'coming-soon' },
      { id: 'plans-meal-slots', label: 'Meal Slots', href: `${plans}?section=meal-slots`, status: 'coming-soon' },
      { id: 'plans-imports', label: 'Imports', href: APP_ROUTES.planImportNew, status: 'current' },
    ],
  },
  {
    id: 'meals',
    label: 'Meals & Recipes',
    type: 'hub',
    href: meals,
    matchPrefix: meals,
    status: 'current',
    items: [
      { id: 'meals-library', label: 'Meal & Recipe Library', href: meals, status: 'current' },
      { id: 'meals-add', label: 'Add Meal', href: `${meals}?action=add`, status: 'current' },
      { id: 'meals-import-recipe', label: 'Import Recipe', href: APP_ROUTES.planImportNew, status: 'current' },
      { id: 'meals-label-scan', label: 'Scan Nutrition Label', href: `${meals}?tool=label-scan`, status: 'coming-soon' },
      { id: 'meals-photo-estimate', label: 'Scan Meal / Photo Portion Estimate', href: `${logNew}?tool=scan-meal`, status: 'coming-soon' },
      { id: 'meals-portion-calculator', label: 'Portion Calculator', href: `${meals}?tool=portion-calculator`, status: 'coming-soon' },
    ],
  },
  {
    id: 'pantry',
    label: 'Pantry',
    type: 'hub',
    href: pantry,
    matchPrefix: pantry,
    status: 'current',
    items: [
      { id: 'pantry-home', label: 'Pantry Home', href: pantry, status: 'current' },
      { id: 'pantry-review', label: 'Review Pantry', href: pantry, status: 'current' },
      { id: 'pantry-add', label: 'Add Pantry Item', href: `${pantry}?action=add`, status: 'current' },
      { id: 'pantry-low-staples', label: 'Low Staples', href: `${pantry}?section=low-staples`, status: 'coming-soon' },
      { id: 'pantry-staples', label: 'Staples List', href: `${pantry}?section=staples`, status: 'coming-soon' },
      { id: 'pantry-readiness', label: 'Pantry Readiness', href: `${pantry}?section=readiness`, status: 'coming-soon' },
      { id: 'pantry-shopping-gaps', label: 'Shopping Gaps', href: `${pantry}?section=shopping-gaps`, status: 'coming-soon' },
    ],
  },
];

/**
 * Lower utility links, shown beneath a divider at the bottom of the drawer.
 * Profile and Settings resolve to the same destination, so they are merged
 * into a single combined entry.
 */
export const APP_DRAWER_UTILITIES: DrawerHub[] = [
  {
    id: 'profile',
    label: 'Profile & Settings',
    type: 'link',
    href: profile,
    matchPrefix: profile,
    status: 'current',
  },
];

const ALL_DRAWER_ENTRIES = [...APP_DRAWER_HUBS, ...APP_DRAWER_UTILITIES];

/**
 * Derive the active drawer hub id from the current pathname. Matches the most
 * specific prefix first so `/app` (Home) does not swallow `/app/programs` etc.
 */
export function getActiveDrawerHubId(pathname: string): string | null {
  const path = pathname.split('?')[0].split('#')[0];

  // Home is an exact match only — every app route starts with `/app`.
  if (path === APP_ROUTES.home) return 'home';

  const match = ALL_DRAWER_ENTRIES
    .filter((entry) => entry.id !== 'home')
    .filter((entry) => path === entry.matchPrefix || path.startsWith(`${entry.matchPrefix}/`))
    .sort((a, b) => b.matchPrefix.length - a.matchPrefix.length)[0];

  return match?.id ?? null;
}
