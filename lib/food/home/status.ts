import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import { resolveGroceryHaulCreateEligibility } from '@/lib/plans/groceryHaul/eligibility';
import type { GroceryListReadinessDecision } from '@/lib/plans/groceryListReadiness/policy';
import type {
  GeneratedGroceryList,
  GroceryHaulCollectionItem,
  PantryOnHandItem,
} from '@/lib/plans/types';

export type FoodHomeLoadState = 'loading' | 'ready' | 'error';

export type FoodHomeStatusCardContent = {
  value?: string;
  context?: string;
  href: string;
  action: string;
  loading?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

type CalendarDate = {
  year: number;
  month: number;
  day: number;
  epochDay: number;
};

function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year
    || utc.getUTCMonth() !== month - 1
    || utc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, epochDay: Math.floor(utc.getTime() / DAY_MS) };
}

function recentTimestamp(haul: GroceryHaulCollectionItem): number {
  const value = Date.parse(haul.updated_at || haul.created_at);
  return Number.isFinite(value) ? value : 0;
}

function compareWithinStatus(
  left: GroceryHaulCollectionItem,
  right: GroceryHaulCollectionItem,
  today: CalendarDate,
): number {
  const leftDate = parseCalendarDate(left.shopping_date);
  const rightDate = parseCalendarDate(right.shopping_date);
  const leftUpcoming = Boolean(leftDate && leftDate.epochDay >= today.epochDay);
  const rightUpcoming = Boolean(rightDate && rightDate.epochDay >= today.epochDay);

  if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
  if (leftUpcoming && rightUpcoming && leftDate && rightDate) {
    const dateOrder = leftDate.epochDay - rightDate.epochDay;
    if (dateOrder !== 0) return dateOrder;
  }

  const updatedOrder = recentTimestamp(right) - recentTimestamp(left);
  if (updatedOrder !== 0) return updatedOrder;
  return left.id.localeCompare(right.id);
}

/**
 * Selects one continuation target with no age-based suppression:
 * active execution first, then planned preparation; nearest upcoming date
 * wins within a state, with recent update and stable id fallbacks.
 */
export function selectNextFoodHomeHaul(
  hauls: GroceryHaulCollectionItem[],
  todayKey: string,
): GroceryHaulCollectionItem | null {
  const today = parseCalendarDate(todayKey);
  if (!today) return null;
  const active = hauls.filter((haul) => haul.status === 'active');
  const planned = hauls.filter((haul) => haul.status === 'planned');
  const candidates = active.length > 0 ? active : planned;
  return [...candidates].sort((left, right) => compareWithinStatus(left, right, today))[0] ?? null;
}

/**
 * Uses the existing Packet 10 readiness + Packet 11 eligibility policy.
 * Missing summaries fail closed.
 */
export function hasBuildableFoodHomeList(
  lists: GeneratedGroceryList[],
  summaries: Record<string, GroceryListReadinessDecision>,
): boolean {
  return lists.some((list) => {
    const decision = summaries[list.id];
    if (!decision) return false;
    return resolveGroceryHaulCreateEligibility({
      archivedAt: list.archived_at,
      readinessState: decision.state,
    }).eligible;
  });
}

function factualDate(date: CalendarDate): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}

/** Calm calendar-relative timing with no overdue or stale classification. */
export function formatFoodHomeHaulTiming(
  shoppingDate: string,
  todayKey: string,
): string {
  const date = parseCalendarDate(shoppingDate);
  const today = parseCalendarDate(todayKey);
  if (!date || !today) return shoppingDate;

  const days = date.epochDay - today.epochDay;
  if (days < 0) return factualDate(date);
  if (days === 0) return 'Today';

  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
  if (days < 7) return weekday;
  if (days < 14) return `Next ${weekday}`;
  return `${Math.round(days / 7)} Wks`;
}

/** Counts Pantry entries with positive on-hand quantity; does not sum across units. */
export function countPositivePantryOnHand(items: PantryOnHandItem[]): number {
  return items.filter((item) => item.quantity != null && item.quantity > 0).length;
}

export function buildEssentialsCardContent(args: {
  pantryLoadState: FoodHomeLoadState;
  pantryOnHandCount: number;
}): FoodHomeStatusCardContent {
  if (args.pantryLoadState === 'loading') {
    return {
      href: APP_ROUTES.foodPantry,
      action: 'Open Pantry',
      loading: true,
    };
  }
  if (args.pantryLoadState === 'error') {
    return {
      value: '—',
      context: 'Pantry unavailable',
      href: APP_ROUTES.foodPantry,
      action: 'Open Pantry',
    };
  }
  if (args.pantryOnHandCount > 0) {
    return {
      value: 'Stocked',
      context: `${args.pantryOnHandCount} on hand`,
      href: APP_ROUTES.foodPantry,
      action: 'Open Pantry',
    };
  }
  return {
    value: 'Empty',
    context: 'Add your essentials',
    href: APP_ROUTES.foodPantry,
    action: 'Open Pantry',
  };
}

export function buildNextHaulCardContent(args: {
  loadState: FoodHomeLoadState;
  haul: GroceryHaulCollectionItem | null;
  hasBuildableList: boolean;
  hasActiveList: boolean;
  todayKey: string;
}): FoodHomeStatusCardContent {
  if (args.loadState === 'loading') {
    return {
      href: APP_ROUTES.foodLists,
      action: 'Review Lists',
      loading: true,
    };
  }
  if (args.loadState === 'error') {
    return {
      value: '—',
      context: 'Haul unavailable',
      href: APP_ROUTES.foodHauls,
      action: 'Open Hauls',
    };
  }
  if (args.haul) {
    return {
      value: formatFoodHomeHaulTiming(args.haul.shopping_date, args.todayKey),
      context: args.haul.status === 'active' ? 'Shopping in progress' : 'Draft preparation',
      href: args.haul.status === 'active'
        ? APP_ROUTE_BUILDERS.foodHaulShop(args.haul.id)
        : APP_ROUTE_BUILDERS.foodHaul(args.haul.id),
      action: 'Continue Haul',
    };
  }
  if (args.hasBuildableList) {
    return {
      value: 'Ready',
      context: 'Lists are ready',
      href: APP_ROUTES.foodHauls,
      action: 'Build a Haul',
    };
  }
  if (args.hasActiveList) {
    return {
      value: 'No Haul',
      context: 'Lists need attention',
      href: APP_ROUTES.foodLists,
      action: 'Review Lists',
    };
  }
  return {
    value: 'No Haul',
    context: 'No Lists yet',
    href: APP_ROUTES.foodLists,
    action: 'Open Lists',
  };
}
