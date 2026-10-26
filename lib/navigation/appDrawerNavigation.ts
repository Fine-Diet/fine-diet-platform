import { APP_ROUTES } from '@/lib/routes/appRoutes';
import {
  getLogTrackingDestination,
  getLogTrackingHref,
  normalizeEnabledLogTrackingKeys,
} from '@/lib/navigation/logTrackingDestinations';

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
 * - Assessments stays in the Programs submenu as a disabled item. It does not
 *   route anywhere, including Gut Check. Gut Check is one assessment instance
 *   and is deliberately absent here.
 */

export type DrawerItemStatus = 'current' | 'partial' | 'coming-soon';

export interface DrawerChildItem {
  id: string;
  label: string;
  /** Safe, navigable target. Omitted for non-navigating subgroup headers. */
  href?: string;
  status: DrawerItemStatus;
  /** Optional durable IA parent rendered as a non-navigating group label. */
  group?: 'manage' | 'library';
  /** Visible taxonomy item with no route until its real surface exists. */
  disabled?: boolean;
  /** Exact pathname match. Prefix matching would mark Explore active on every child route. */
  match?: 'exact' | 'prefix';
  /** Nested links under a non-navigating subgroup row (e.g. Food → Shopping). */
  children?: DrawerChildItem[];
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

const {
  programs,
  log,
  logNew,
  plans,
  food,
  foodPantry,
  foodMeals,
  foodLists,
  foodHauls,
  profile,
  home,
} = APP_ROUTES;

/** Food drawer subgroup id for Shopping → Haul / List. */
export const FOOD_DRAWER_SHOPPING_SUBGROUP_ID = 'food-shopping';

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
      {
        id: 'programs-explore',
        label: 'Explore',
        href: programs,
        status: 'current',
        match: 'exact',
      },
      {
        id: 'my-programs',
        label: 'My Programs',
        href: APP_ROUTES.programsMy,
        status: 'current',
      },
      {
        id: 'assessments',
        label: 'Assessments',
        status: 'coming-soon',
        disabled: true,
      },
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
      ...getLogDrawerItems([]),
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
      {
        id: 'plans-overview',
        label: 'Overview',
        href: plans,
        status: 'current',
        match: 'exact',
      },
      { id: 'plans-day', label: 'Day', href: APP_ROUTES.plansDay, status: 'current' },
      { id: 'plans-week', label: 'Week', href: APP_ROUTES.plansWeek, status: 'current' },
      { id: 'plans-month', label: 'Month', href: APP_ROUTES.plansMonth, status: 'current' },
      { id: 'plans-library', label: 'Library', href: APP_ROUTES.plansLibrary, status: 'current' },
    ],
  },
  {
    id: 'food',
    label: 'Food',
    type: 'hub',
    href: food,
    matchPrefix: food,
    status: 'current',
    items: [
      { id: 'food-home', label: 'Home', href: food, status: 'current' },
      { id: 'food-pantry', label: 'Pantry', href: foodPantry, status: 'current' },
      {
        id: FOOD_DRAWER_SHOPPING_SUBGROUP_ID,
        label: 'Shopping',
        status: 'current',
        children: [
          { id: 'food-lists', label: 'Lists', href: foodLists, status: 'current' },
          { id: 'food-hauls', label: 'Hauls', href: foodHauls, status: 'current' },
        ],
      },
      { id: 'food-meals', label: 'Recipes', href: foodMeals, status: 'current' },
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

/** Build Log rows from the same normalized tracking keys used by Daily Summary. */
export function getLogDrawerItems(enabledKeys: readonly unknown[]) {
  const trackers = normalizeEnabledLogTrackingKeys(enabledKeys).map((key) => {
    const destination = getLogTrackingDestination(key)!;
    const href = getLogTrackingHref(destination);
    return {
      id: `log-tracking-${key}`,
      label: destination.label,
      ...(href ? { href } : {}),
      status: destination.captureSupported ? 'current' as const : 'coming-soon' as const,
      ...(!destination.captureSupported ? { disabled: true } : {}),
    };
  });

  return [
    { id: 'log-overview', label: 'Log Overview', href: log, status: 'current' as const, match: 'exact' as const },
    { id: 'log-new', label: 'New Log Entry', href: logNew, status: 'current' as const, match: 'exact' as const },
    ...trackers,
    { id: 'log-summary', label: 'Daily Summary', href: `${log}?section=summary`, status: 'partial' as const },
    { id: 'log-tracking', label: 'Tracking Preferences', href: `${profile}?section=tracking#tracking-prefs`, status: 'partial' as const },
  ];
}

/** Match tracker query routes exactly while allowing date/block context and query-order changes. */
export function isDrawerChildActive(item: DrawerChildItem, asPath: string): boolean {
  if (item.disabled || !item.href) return false;
  const cleanPath = asPath.split('#')[0];
  const pathOnly = cleanPath.split('?')[0];
  const hrefPath = item.href.split('?')[0].split('#')[0];
  if (pathOnly !== hrefPath) {
    return item.match !== 'exact' && !item.href.includes('?') && pathOnly.startsWith(`${hrefPath}/`);
  }

  const actualParams = new URLSearchParams(cleanPath.split('?')[1] ?? '');
  const expectedParams = new URLSearchParams(item.href.split('?')[1]?.split('#')[0] ?? '');
  if (item.id.startsWith('log-tracking-')) {
    const actualTabs = actualParams.getAll('tab');
    const destination = getLogTrackingDestination(item.id.slice('log-tracking-'.length));
    if (!destination?.tab || actualTabs.length !== 1 || actualTabs[0] !== destination.tab) return false;
  }
  if (expectedParams.size > 0) {
    let matches = true;
    expectedParams.forEach((value, key) => {
      if (actualParams.get(key) !== value) matches = false;
    });
    return matches;
  }
  if (item.id === 'log-new' && actualParams.has('tab')) return false;
  if (item.id === 'log-overview' && actualParams.get('section') === 'summary') return false;
  if (item.match === 'exact') return pathOnly === hrefPath;
  // Query-less destinations are active on their exact route. Log tracker
  // destinations above remain query-aware and validate their single tab.
  return !item.href.includes('?');
}

/** True when the pathname is under canonical Haul or List Food routes. */
export function isFoodDrawerShoppingChildPath(pathname: string): boolean {
  const path = pathname.split('?')[0].split('#')[0];
  return (
    path === foodHauls
    || path.startsWith(`${foodHauls}/`)
    || path === foodLists
    || path.startsWith(`${foodLists}/`)
  );
}

export function getFoodDrawerHub() {
  return APP_DRAWER_HUBS.find((hub) => hub.id === 'food');
}

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
