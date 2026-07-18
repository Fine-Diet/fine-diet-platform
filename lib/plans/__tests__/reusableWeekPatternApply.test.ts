import type { PlanDay } from '@/lib/plans/types';
import {
  buildStructuralPlanSlotRows,
  listMissingPlanDatesThrough,
} from '@/lib/plans/planHorizonExtension';
import {
  collectPlanDayIdsForApplicationPlan,
  computeWeekPatternApplicationIntent,
  computeWeekPatternApplicationPlan,
} from '@/lib/plans/reusableWeekPatternApply';

function day(id: string, date: string): PlanDay {
  return {
    id,
    plan_id: 'plan-1',
    person_id: 'person-1',
    date_local: date,
    notes: null,
    projected_nds_100: null,
    projected_wfr_10: null,
    projected_ps_10: null,
    projected_pnd_10: null,
    projected_fp_10: null,
    projected_as_10: null,
    projected_mnc_10: null,
    projected_ob_10: null,
    projection_confidence: null,
    nds_version: 'nds.v1',
    classifier_version: 'classifier.v1',
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

  test('once intent requires one span ending on the pattern tail date', () => {
    const result = computeWeekPatternApplicationIntent({
      orderedPlanDays: ordered,
      targetStartPlanDayId: 'd2',
      patternDayCount: 2,
      mode: 'once',
    });
    expect(result.intent).toEqual({
      requestedSpanCount: 1,
      requiredEndDateLocal: '2026-07-20',
    });
  });

  test('repeat_weeks intent requires the full requested span count', () => {
    const result = computeWeekPatternApplicationIntent({
      orderedPlanDays: ordered,
      targetStartPlanDayId: 'd1',
      patternDayCount: 2,
      mode: 'repeat_weeks',
      repeatWeeks: 3,
    });
    expect(result.intent).toEqual({
      requestedSpanCount: 3,
      requiredEndDateLocal: '2026-07-23',
    });
  });

  test('repeat_weeks plan fails when existing days are insufficient', () => {
    const result = computeWeekPatternApplicationPlan({
      orderedPlanDays: ordered,
      targetStartPlanDayId: 'd1',
      patternDayCount: 2,
      mode: 'repeat_weeks',
      repeatWeeks: 4,
    });
    expect(result.plan).toBeNull();
    expect(result.error).toMatch(/does not have enough contiguous days/);
  });

  test('repeat_weeks plan applies the full requested count when days exist', () => {
    const result = computeWeekPatternApplicationPlan({
      orderedPlanDays: ordered,
      targetStartPlanDayId: 'd1',
      patternDayCount: 2,
      mode: 'repeat_weeks',
      repeatWeeks: 3,
    });
    expect(result.plan?.startPlanDayIds).toEqual(['d1', 'd3', 'd5']);
    expect(result.plan?.requestedSpanCount).toBe(3);
  });

  test('until_date intent counts only spans that fit before the end date', () => {
    const result = computeWeekPatternApplicationIntent({
      orderedPlanDays: ordered,
      targetStartPlanDayId: 'd1',
      patternDayCount: 2,
      mode: 'until_date',
      untilDateLocal: '2026-07-22',
    });
    expect(result.intent).toEqual({
      requestedSpanCount: 2,
      requiredEndDateLocal: '2026-07-21',
    });
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

describe('planHorizonExtension', () => {
  test('listMissingPlanDatesThrough returns contiguous missing dates', () => {
    expect(
      listMissingPlanDatesThrough(
        [day('d1', '2026-07-18'), day('d2', '2026-07-19')],
        '2026-07-22',
      ),
    ).toEqual(['2026-07-20', '2026-07-21', '2026-07-22']);
  });

  test('buildStructuralPlanSlotRows preserves enabled schedule slots', () => {
    expect(
      buildStructuralPlanSlotRows([
        {
          key: 'breakfast',
          slot_block: 'morning',
          label: 'Breakfast',
          target_time: '08:00',
          enabled: true,
          source: 'profile',
        },
        {
          key: 'snack',
          slot_block: 'midday',
          label: 'Snack',
          target_time: '15:00',
          enabled: false,
          source: 'profile',
        },
      ]),
    ).toEqual([
      {
        slot_block: 'morning',
        slot_ordinal: 1,
        slot_label: 'Breakfast',
        target_time: '08:00',
      },
    ]);
  });
});
