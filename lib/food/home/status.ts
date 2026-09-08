import { resolveGroceryHaulCreateEligibility } from '@/lib/plans/groceryHaul/eligibility';
import type { GroceryListReadinessDecision } from '@/lib/plans/groceryListReadiness/policy';
import type {
  GeneratedGroceryList,
  GroceryHaulCollectionItem,
} from '@/lib/plans/types';

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
