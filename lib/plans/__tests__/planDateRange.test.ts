import {
  addDaysToDateKey,
  buildActivePlanDayHref,
  clampDateRange,
  filterPlanDaysInRange,
  getCalendarWeekRange,
  isCurrentCalendarWeek,
  resolvePlanWeekRangeFromQuery,
  shiftDateRangeByDays,
  todayLocalDateKey,
} from '../planDateRange';
import { toDateKey } from '@/lib/journal/types';
import type { PlanDay } from '../types';

function localDate(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

describe('planDateRange', () => {
  describe('getCalendarWeekRange', () => {
    test('Sunday anchor returns Sun–Sat of that week', () => {
      // 2026-07-12 is a Sunday
      const range = getCalendarWeekRange(localDate(2026, 7, 12));
      expect(range).toEqual({ start: '2026-07-12', end: '2026-07-18' });
    });

    test('Wednesday anchor returns Sun–Sat containing that day', () => {
      // 2026-07-15 is Wednesday
      const range = getCalendarWeekRange(localDate(2026, 7, 15));
      expect(range).toEqual({ start: '2026-07-12', end: '2026-07-18' });
    });
  });

  describe('resolvePlanWeekRangeFromQuery', () => {
    test('defaults to current calendar week when query is missing', () => {
      const expected = getCalendarWeekRange();
      expect(resolvePlanWeekRangeFromQuery(null, null)).toEqual(expected);
    });

    test('parses explicit start and end', () => {
      expect(resolvePlanWeekRangeFromQuery('2026-05-17', '2026-05-23')).toEqual({
        start: '2026-05-17',
        end: '2026-05-23',
      });
    });

    test('swaps inverted ranges', () => {
      expect(resolvePlanWeekRangeFromQuery('2026-05-23', '2026-05-17')).toEqual({
        start: '2026-05-17',
        end: '2026-05-23',
      });
    });

    test('clamps ranges longer than 31 days', () => {
      const range = resolvePlanWeekRangeFromQuery('2026-01-01', '2026-03-01');
      expect(range.start).toBe('2026-01-01');
      expect(range.end).toBe('2026-01-31');
    });
  });

  describe('isCurrentCalendarWeek', () => {
    test('true only for the actual current week', () => {
      const current = getCalendarWeekRange();
      expect(isCurrentCalendarWeek(current.start, current.end)).toBe(true);
      expect(isCurrentCalendarWeek('2026-05-17', '2026-05-23')).toBe(false);
    });
  });

  describe('filterPlanDaysInRange', () => {
    const days: PlanDay[] = [
      { id: 'a', plan_id: 'p', date_local: '2026-05-17' } as PlanDay,
      { id: 'b', plan_id: 'p', date_local: '2026-05-20' } as PlanDay,
      { id: 'c', plan_id: 'p', date_local: '2026-07-01' } as PlanDay,
    ];

    test('returns only days inside inclusive range', () => {
      expect(filterPlanDaysInRange(days, '2026-05-17', '2026-05-23')).toEqual([
        days[0],
        days[1],
      ]);
    });

    test('returns empty array when range has no plan days', () => {
      expect(filterPlanDaysInRange(days, '2026-06-01', '2026-06-07')).toEqual([]);
    });
  });

  describe('shiftDateRangeByDays', () => {
    test('preserves span when shifting', () => {
      const range = { start: '2026-05-17', end: '2026-05-23' };
      expect(shiftDateRangeByDays(range, 7)).toEqual({
        start: '2026-05-24',
        end: '2026-05-30',
      });
      expect(shiftDateRangeByDays(range, -7)).toEqual({
        start: '2026-05-10',
        end: '2026-05-16',
      });
    });
  });

  describe('local date safety', () => {
    test('toDateKey uses local calendar components', () => {
      expect(toDateKey(new Date(2026, 6, 12, 23, 30, 0))).toBe('2026-07-12');
      expect(toDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
    });

    test('todayLocalDateKey matches toDateKey(new Date())', () => {
      expect(todayLocalDateKey()).toBe(toDateKey(new Date()));
    });
  });

  describe('buildActivePlanDayHref', () => {
    test('routes active plan to dated day view', () => {
      expect(
        buildActivePlanDayHref({ id: 'plan-1' }, '2026-07-13'),
      ).toBe('/app/plans/day/2026-07-13?planId=plan-1');
    });

    test('falls back when no active plan', () => {
      expect(buildActivePlanDayHref(null)).toBe('/app/plans');
    });
  });

  describe('clampDateRange', () => {
    test('addDaysToDateKey crosses month boundary', () => {
      expect(addDaysToDateKey('2026-01-30', 3)).toBe('2026-02-02');
      expect(clampDateRange('2026-01-01', '2026-02-15').end).toBe('2026-01-31');
    });
  });
});
