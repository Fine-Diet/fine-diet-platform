import type { PlanDay } from '@/lib/plans/types';
import {
  collectPlanDayIdsForApplicationPlan,
  computeWeekPatternApplicationPlan,
} from '@/lib/plans/reusableWeekPatternApply';

function day(id: string, date: string): PlanDay {
  return {
    id,
    plan_id: 'plan-1',
    person_id: 'person-1',
    date_local: date,
    day_index: 0,
    created_at: '2026-07-18T00:00:00.000Z',
    updated_at: '2026-07-18T00:00:00.000Z',
  };
}

describe('reusableWeekPatternApply', () => {
  const ordered = [
    day('d1', '2026-07-18'),
    day('d2', '2026-07-19'),
    day('d3', '2026-07-20'),
    day('d4', '2026-07-21'),
    day('d5', '2026-07-22'),
    day('d6', '2026-07-23'),
    day('d7', '2026-07-24'),
  ];

  test('once applies a single span', () => {
    const result = computeWeekPatternApplicationPlan({
      orderedPlanDays: ordered,
      targetStartPlanDayId: 'd2',
      patternDayCount: 2,
      mode: 'once',
    });
    expect(result.plan?.startPlanDayIds).toEqual(['d2']);
    expect(result.plan?.spanCount).toBe(1);
  });

  test('repeat_weeks plans multiple contiguous spans', () => {
    const result = computeWeekPatternApplicationPlan({
      orderedPlanDays: ordered,
      targetStartPlanDayId: 'd1',
      patternDayCount: 2,
      mode: 'repeat_weeks',
      repeatWeeks: 3,
    });
    expect(result.plan?.startPlanDayIds).toEqual(['d1', 'd3', 'd5']);
  });

  test('until_date stops before spans exceed the end date', () => {
    const result = computeWeekPatternApplicationPlan({
      orderedPlanDays: ordered,
      targetStartPlanDayId: 'd1',
      patternDayCount: 2,
      mode: 'until_date',
      untilDateLocal: '2026-07-22',
    });
    expect(result.plan?.startPlanDayIds).toEqual(['d1', 'd3']);
  });

  test('collectPlanDayIdsForApplicationPlan flattens all spans', () => {
    const plan = computeWeekPatternApplicationPlan({
      orderedPlanDays: ordered,
      targetStartPlanDayId: 'd1',
      patternDayCount: 2,
      mode: 'repeat_weeks',
      repeatWeeks: 2,
    }).plan!;
    expect(
      collectPlanDayIdsForApplicationPlan({
        orderedPlanDays: ordered,
        startPlanDayIds: plan.startPlanDayIds,
        patternDayCount: 2,
      }),
    ).toEqual(['d1', 'd2', 'd3', 'd4']);
  });
});
