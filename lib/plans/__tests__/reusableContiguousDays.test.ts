import {
  assertContiguousDateKeys,
  assertContiguousPlanDays,
  CONTIGUOUS_PLAN_DAYS_ERROR,
  maxConsecutiveDayCountFrom,
  resolveConsecutiveDayRange,
} from '@/lib/plans/reusableContiguousDays';
import type { PlanDay } from '@/lib/plans/types';

function makePlanDay(id: string, dateLocal: string): PlanDay {
  return {
    id,
    plan_id: 'p1',
    person_id: 'person',
    date_local: dateLocal,
    created_at: '',
    updated_at: '',
  };
}

describe('reusableContiguousDays', () => {
  test('accepts a single day', () => {
    expect(() => assertContiguousDateKeys(['2026-07-18'])).not.toThrow();
  });

  test('accepts contiguous days', () => {
    expect(() => assertContiguousDateKeys(['2026-07-18', '2026-07-19', '2026-07-20'])).not.toThrow();
  });

  test('rejects non-contiguous days', () => {
    expect(() => assertContiguousDateKeys(['2026-07-18', '2026-07-20'])).toThrow(
      CONTIGUOUS_PLAN_DAYS_ERROR,
    );
  });

  test('assertContiguousPlanDays sorts before validating', () => {
    const days: PlanDay[] = [
      {
        id: 'd2',
        plan_id: 'p1',
        person_id: 'person',
        date_local: '2026-07-19',
        created_at: '',
        updated_at: '',
      },
      {
        id: 'd1',
        plan_id: 'p1',
        person_id: 'person',
        date_local: '2026-07-18',
        created_at: '',
        updated_at: '',
      },
    ];
    expect(() => assertContiguousPlanDays(days)).not.toThrow();
  });
});

describe('maxConsecutiveDayCountFrom', () => {
  const orderedPlanDays: PlanDay[] = [
    makePlanDay('d1', '2026-07-18'),
    makePlanDay('d2', '2026-07-19'),
    makePlanDay('d3', '2026-07-20'),
  ];

  test('returns remaining day count from the start day', () => {
    expect(maxConsecutiveDayCountFrom(orderedPlanDays, 'd2')).toBe(2);
  });

  test('returns 0 when the start day is not found', () => {
    expect(maxConsecutiveDayCountFrom(orderedPlanDays, 'missing')).toBe(0);
  });
});

describe('resolveConsecutiveDayRange', () => {
  const orderedPlanDays: PlanDay[] = [
    makePlanDay('d1', '2026-07-18'),
    makePlanDay('d2', '2026-07-19'),
    makePlanDay('d3', '2026-07-20'),
  ];

  test('resolves a valid consecutive range', () => {
    const result = resolveConsecutiveDayRange(orderedPlanDays, 'd1', 2);
    expect(result.days?.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(result.error).toBeUndefined();
  });

  test('returns an error instead of throwing when day count exceeds availability', () => {
    expect(() => resolveConsecutiveDayRange(orderedPlanDays, 'd2', 5)).not.toThrow();
    const result = resolveConsecutiveDayRange(orderedPlanDays, 'd2', 5);
    expect(result.days).toBeNull();
    expect(result.error).toContain('Only 2 consecutive day');
  });

  test('returns an error instead of throwing when the underlying dates are non-contiguous', () => {
    const gappedDays: PlanDay[] = [
      makePlanDay('d1', '2026-07-18'),
      makePlanDay('d2', '2026-07-20'),
      makePlanDay('d3', '2026-07-21'),
    ];
    expect(() => resolveConsecutiveDayRange(gappedDays, 'd1', 2)).not.toThrow();
    const result = resolveConsecutiveDayRange(gappedDays, 'd1', 2);
    expect(result.days).toBeNull();
    expect(result.error).toMatch(/gap or duplicate date/);
  });

  test('rejects a non-positive-integer day count without throwing', () => {
    const result = resolveConsecutiveDayRange(orderedPlanDays, 'd1', 0);
    expect(result.days).toBeNull();
    expect(result.error).toMatch(/positive integer/);
  });

  test('returns an error when the start day id is not present', () => {
    const result = resolveConsecutiveDayRange(orderedPlanDays, 'missing', 1);
    expect(result.days).toBeNull();
    expect(result.error).toMatch(/not found/);
  });
});
