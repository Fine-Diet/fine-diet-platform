import { addDaysToDateKey } from '@/lib/plans/planDateRange';
import type { Plan, PlanDay, ResolvedScheduleSlot } from '@/lib/plans/types';
import {
  buildStructuralPlanSlotRows,
  listMissingPlanDatesThrough,
  resolvePlanHorizonScheduleSlots,
} from '@/lib/plans/planHorizonExtension';
import {
  assertWeekPatternApplicationSpanDatesContiguous,
  collectPlanDayIdsForApplicationPlan,
  computeWeekPatternApplicationIntent,
  computeWeekPatternApplicationPlan,
  MAX_PLAN_HORIZON_EXTENSION_DAYS,
  MAX_WEEK_PATTERN_APPLICATION_SPAN_COUNT,
  MAX_WEEK_PATTERN_REPEAT_WEEKS,
  WEEK_PATTERN_SPAN_DATE_GAP_ERROR,
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

  test('full requested span is never silently truncated when enough days exist', () => {
    const longOrdered = Array.from({ length: 21 }, (_, i) =>
      day(`d${i + 1}`, addDaysToDateKey('2026-07-01', i)),
    );
    const intent = computeWeekPatternApplicationIntent({
      orderedPlanDays: longOrdered,
      targetStartPlanDayId: 'd1',
      patternDayCount: 7,
      mode: 'repeat_weeks',
      repeatWeeks: 3,
    });
    const plan = computeWeekPatternApplicationPlan({
      orderedPlanDays: longOrdered,
      targetStartPlanDayId: 'd1',
      patternDayCount: 7,
      mode: 'repeat_weeks',
      repeatWeeks: 3,
    });
    expect(intent.intent?.requestedSpanCount).toBe(3);
    expect(plan.plan?.spanCount).toBe(intent.intent?.requestedSpanCount);
    expect(plan.plan?.startPlanDayIds).toEqual(['d1', 'd8', 'd15']);
  });

  describe('request validation (should map to HTTP 400)', () => {
    test('rejects an invalid application_mode', () => {
      const result = computeWeekPatternApplicationIntent({
        orderedPlanDays: ordered,
        targetStartPlanDayId: 'd1',
        patternDayCount: 2,
        // @ts-expect-error intentionally invalid for the test
        mode: 'nonsense',
      });
      expect(result.intent).toBeNull();
      expect(result.errorKind).toBe('validation');
      expect(result.error).toMatch(/application_mode must be one of/);
    });

    test('rejects a non-integer repeat_weeks', () => {
      const result = computeWeekPatternApplicationIntent({
        orderedPlanDays: ordered,
        targetStartPlanDayId: 'd1',
        patternDayCount: 2,
        mode: 'repeat_weeks',
        repeatWeeks: 1.5,
      });
      expect(result.intent).toBeNull();
      expect(result.errorKind).toBe('validation');
    });

    test('rejects a negative repeat_weeks', () => {
      const result = computeWeekPatternApplicationIntent({
        orderedPlanDays: ordered,
        targetStartPlanDayId: 'd1',
        patternDayCount: 2,
        mode: 'repeat_weeks',
        repeatWeeks: -3,
      });
      expect(result.intent).toBeNull();
      expect(result.errorKind).toBe('validation');
    });

    test('rejects repeat_weeks beyond the maximum bound', () => {
      const result = computeWeekPatternApplicationIntent({
        orderedPlanDays: ordered,
        targetStartPlanDayId: 'd1',
        patternDayCount: 2,
        mode: 'repeat_weeks',
        repeatWeeks: MAX_WEEK_PATTERN_REPEAT_WEEKS + 1,
      });
      expect(result.intent).toBeNull();
      expect(result.errorKind).toBe('validation');
      expect(result.error).toMatch(/must not exceed/);
    });

    test('rejects a malformed until_date_local', () => {
      const result = computeWeekPatternApplicationIntent({
        orderedPlanDays: ordered,
        targetStartPlanDayId: 'd1',
        patternDayCount: 2,
        mode: 'until_date',
        untilDateLocal: 'not-a-date',
      });
      expect(result.intent).toBeNull();
      expect(result.errorKind).toBe('validation');
      expect(result.error).toMatch(/valid YYYY-MM-DD/);
    });

    test('rejects a calendar-invalid until_date_local (rollover month/day)', () => {
      const result = computeWeekPatternApplicationIntent({
        orderedPlanDays: ordered,
        targetStartPlanDayId: 'd1',
        patternDayCount: 2,
        mode: 'until_date',
        untilDateLocal: '2026-13-45',
      });
      expect(result.intent).toBeNull();
      expect(result.errorKind).toBe('validation');
    });

    test('rejects until_date_local before the target start day (impossible ordering)', () => {
      const result = computeWeekPatternApplicationIntent({
        orderedPlanDays: ordered,
        targetStartPlanDayId: 'd4',
        patternDayCount: 2,
        mode: 'until_date',
        untilDateLocal: '2026-07-19',
      });
      expect(result.intent).toBeNull();
      expect(result.errorKind).toBe('validation');
      expect(result.error).toMatch(/on or after/);
    });

    test('rejects a request whose horizon-days span exceeds the maximum bound', () => {
      const longOrdered = Array.from({ length: 400 }, (_, i) =>
        day(`d${i + 1}`, addDaysToDateKey('2026-01-01', i)),
      );
      // patternDayCount=1 with the max repeat_weeks stays within the
      // horizon-days bound...
      const withinBound = computeWeekPatternApplicationIntent({
        orderedPlanDays: longOrdered,
        targetStartPlanDayId: 'd1',
        patternDayCount: 1,
        mode: 'repeat_weeks',
        repeatWeeks: MAX_WEEK_PATTERN_REPEAT_WEEKS,
      });
      expect(withinBound.intent).not.toBeNull();
      expect(withinBound.intent!.requestedSpanCount).toBeLessThanOrEqual(
        MAX_WEEK_PATTERN_APPLICATION_SPAN_COUNT,
      );

      // ...but a longer per-span day count pushes the required horizon past
      // MAX_PLAN_HORIZON_EXTENSION_DAYS even though the span count itself is
      // still within MAX_WEEK_PATTERN_APPLICATION_SPAN_COUNT.
      const overHorizon = computeWeekPatternApplicationIntent({
        orderedPlanDays: longOrdered,
        targetStartPlanDayId: 'd1',
        patternDayCount: 20,
        mode: 'repeat_weeks',
        repeatWeeks: MAX_WEEK_PATTERN_REPEAT_WEEKS,
      });
      expect(overHorizon.intent).toBeNull();
      expect(overHorizon.errorKind).toBe('validation');
      expect(overHorizon.error).toMatch(
        new RegExp(`exceeds the maximum horizon of ${MAX_PLAN_HORIZON_EXTENSION_DAYS} days`),
      );
    });

    test('until_date mode never returns more spans than the max bound', () => {
      const longOrdered = Array.from({ length: 3000 }, (_, i) =>
        day(`d${i + 1}`, addDaysToDateKey('2020-01-01', i)),
      );
      const result = computeWeekPatternApplicationIntent({
        orderedPlanDays: longOrdered,
        targetStartPlanDayId: 'd1',
        patternDayCount: 1,
        mode: 'until_date',
        untilDateLocal: '2027-01-01',
      });
      expect(result.intent).toBeNull();
      expect(result.errorKind).toBe('validation');
      expect(result.error).toMatch(/exceeds the maximum of|exceeds the maximum horizon/);
    });

    test('returns not_found (not validation) when the start day is missing', () => {
      const result = computeWeekPatternApplicationIntent({
        orderedPlanDays: ordered,
        targetStartPlanDayId: 'missing-day',
        patternDayCount: 2,
        mode: 'once',
      });
      expect(result.intent).toBeNull();
      expect(result.errorKind).toBe('not_found');
    });
  });

  describe('assertWeekPatternApplicationSpanDatesContiguous (date-and-contiguity integrity)', () => {
    test('passes for genuinely contiguous spans', () => {
      expect(() =>
        assertWeekPatternApplicationSpanDatesContiguous({
          orderedPlanDays: ordered,
          startPlanDayIds: ['d1', 'd4'],
          patternDayCount: 2,
        }),
      ).not.toThrow();
    });

    test('throws when the underlying plan_days have a calendar-date gap', () => {
      const withGap = [
        day('g1', '2026-07-18'),
        day('g2', '2026-07-19'),
        // Gap: no 2026-07-20 row, but g3 continues at 07-21 (a stale
        // index-based read could otherwise silently treat g3 as offset 2).
        day('g3', '2026-07-21'),
        day('g4', '2026-07-22'),
      ];
      expect(() =>
        assertWeekPatternApplicationSpanDatesContiguous({
          orderedPlanDays: withGap,
          startPlanDayIds: ['g1'],
          patternDayCount: 4,
        }),
      ).toThrow(WEEK_PATTERN_SPAN_DATE_GAP_ERROR);
    });

    test('throws when plan_days contain a duplicate date_local', () => {
      const withDuplicate = [
        day('u1', '2026-07-18'),
        day('u2', '2026-07-19'),
        day('u3', '2026-07-19'), // duplicate date_local
        day('u4', '2026-07-20'),
      ];
      expect(() =>
        assertWeekPatternApplicationSpanDatesContiguous({
          orderedPlanDays: withDuplicate,
          startPlanDayIds: ['u1'],
          patternDayCount: 3,
        }),
      ).toThrow(WEEK_PATTERN_SPAN_DATE_GAP_ERROR);
    });
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

  const legacyProfileSlots: ResolvedScheduleSlot[] = [
    {
      key: 'breakfast',
      slot_block: 'morning',
      label: 'Breakfast (current profile)',
      target_time: '07:00',
      enabled: true,
      source: 'profile',
    },
  ];

  const programRequiredSnapshotSlots: ResolvedScheduleSlot[] = [
    {
      key: 'breakfast',
      slot_block: 'morning',
      label: 'Program breakfast',
      target_time: '06:30',
      enabled: true,
      source: 'program_required',
    },
    {
      key: 'snack',
      slot_block: 'midday',
      label: 'Snack (disallowed)',
      target_time: '15:00',
      enabled: false,
      source: 'program_disallowed',
    },
  ];

  function planWithScheduleSnapshot(
    resolvedSlots: ResolvedScheduleSlot[] | undefined,
  ): Pick<Plan, 'input_snapshot_json'> {
    return {
      input_snapshot_json: {
        body: {
          age_years: null,
          sex: null,
          height_cm: null,
          weight_kg: null,
          weight_as_of: null,
          body_fat_percent: null,
        },
        preferences: {
          dining_out_frequency: null,
          shopping_mode_preference: null,
          household_size: null,
          eating_window: null,
          eating_window_start: null,
          eating_window_end: null,
          dietary_style: null,
          allergies: null,
        },
        targets: {
          daily_calorie_goal: null,
          macro_goals: null,
          nds_score_100_target: null,
          subscore_floors_10: null,
        },
        program_guidance: null,
        schedule_snapshot:
          resolvedSlots === undefined
            ? null
            : {
                profile_schedule: { version: 1, slots: {}, updated_at: '2026-07-18T00:00:00.000Z' },
                resolved_slots: resolvedSlots,
                conflicts: [],
              },
      },
    };
  }

  test('horizon extension preserves the plan-frozen schedule_snapshot, including program-required/disallowed structure', () => {
    const plan = planWithScheduleSnapshot(programRequiredSnapshotSlots);
    const result = resolvePlanHorizonScheduleSlots(plan, legacyProfileSlots);
    expect(result.usedLegacyFallback).toBe(false);
    expect(result.scheduleSlots).toEqual(programRequiredSnapshotSlots);
    // Must not silently substitute the person's live profile schedule.
    expect(result.scheduleSlots).not.toEqual(legacyProfileSlots);
  });

  test('falls back to the legacy profile schedule when the plan has no schedule_snapshot', () => {
    const plan = planWithScheduleSnapshot(undefined);
    const result = resolvePlanHorizonScheduleSlots(plan, legacyProfileSlots);
    expect(result.usedLegacyFallback).toBe(true);
    expect(result.scheduleSlots).toEqual(legacyProfileSlots);
  });

  test('falls back to the legacy profile schedule when schedule_snapshot has no resolved_slots', () => {
    const plan = planWithScheduleSnapshot([]);
    const result = resolvePlanHorizonScheduleSlots(plan, legacyProfileSlots);
    expect(result.usedLegacyFallback).toBe(true);
    expect(result.scheduleSlots).toEqual(legacyProfileSlots);
  });
});
