import {
  buildPlanWeekDaysFromPlan,
  planWeekHorizon,
  proposePlanWeek,
  rowsForPlanWeekDate,
} from '../policy';
import {
  PLANS_FORWARD_COVERAGE_POLICY,
  assessForwardCoverage,
} from '@/lib/plans/decisioning/forwardCoveragePolicy';
import type { PlansMealGuidanceRow } from '@/lib/plans/home/types';
import type { Plan, PlanDay, PlannedMeal, PlanSlot, ResolvedScheduleSlot } from '@/lib/plans/types';

function row(
  slotKey: string,
  state: PlansMealGuidanceRow['state'],
  label = slotKey,
): PlansMealGuidanceRow {
  return {
    slotKey,
    targetTimeLabel: '11:00',
    targetTimeValue: '11:00',
    label,
    mealName: state === 'empty' ? null : 'Oats',
    mealId: state === 'empty' ? null : `${slotKey}-meal`,
    state,
  };
}

function dayInput(args: {
  date: string;
  inPlanRange?: boolean;
  hasPlanDay?: boolean;
  rows: PlansMealGuidanceRow[];
  attachableSlotKeys?: string[];
}) {
  return {
    date: args.date,
    inPlanRange: args.inPlanRange ?? true,
    hasPlanDay: args.hasPlanDay ?? true,
    rows: args.rows,
    attachableSlotKeys: args.attachableSlotKeys ?? args.rows.map((item) => item.slotKey),
  };
}

describe('planWeekHorizon', () => {
  it('uses today through today+6, not a generic calendar grid', () => {
    expect(planWeekHorizon('2026-08-16')).toEqual({
      start: '2026-08-16',
      end: '2026-08-22',
      dates: [
        '2026-08-16',
        '2026-08-17',
        '2026-08-18',
        '2026-08-19',
        '2026-08-20',
        '2026-08-21',
        '2026-08-22',
      ],
    });
  });
});

describe('proposePlanWeek', () => {
  it('sends missing rhythm to Meal Rhythm instead of inventing occasions', () => {
    const proposal = proposePlanWeek({
      today: '2026-08-16',
      hasUsableRhythm: false,
      days: [],
      planId: 'plan-1',
      forwardCoveredDayCount: 0,
    });
    expect(proposal.view).toBe('missing_rhythm');
    expect(proposal.days).toEqual([]);
    expect(proposal.reasonCodes).toContain('missing_usable_meal_rhythm');
    expect(proposal.canAttachAny).toBe(false);
    expect(proposal.canEnsureAny).toBe(false);
    expect(proposal.forwardCoverage.policyId).toBe(PLANS_FORWARD_COVERAGE_POLICY.id);
    expect(proposal.forwardCoverage.policyVersion).toBe(PLANS_FORWARD_COVERAGE_POLICY.version);
  });

  it('walks enabled rhythm occasions and preserves already-planned meals', () => {
    const proposal = proposePlanWeek({
      today: '2026-08-16',
      hasUsableRhythm: true,
      planId: 'plan-1',
      forwardCoveredDayCount: 1,
      days: [
        dayInput({
          date: '2026-08-16',
          rows: [row('breakfast', 'pending', 'Breakfast'), row('lunch', 'empty', 'Lunch')],
        }),
        dayInput({
          date: '2026-08-17',
          rows: [row('breakfast', 'empty', 'Breakfast'), row('lunch', 'empty', 'Lunch')],
        }),
      ],
    });
    expect(proposal.view).toBe('board');
    expect(proposal.days[0]?.occasions.map((item) => item.status)).toEqual(['planned', 'open']);
    expect(proposal.nextOpen).toEqual({
      date: '2026-08-16',
      slotKey: 'lunch',
      label: 'Lunch',
      canAttach: true,
      canEnsure: false,
    });
    expect(proposal.openCount).toBe(3);
    expect(proposal.plannedCount).toBe(1);
    expect(proposal.reasonCodes).toContain('week_remaining_open_occasions');
    expect(proposal.forwardCoverage).toEqual(assessForwardCoverage(1));
    expect(proposal.reasonCodes).toContain('forward_coverage_weak');
    expect(proposal.reasonCodes).toContain(
      `${PLANS_FORWARD_COVERAGE_POLICY.id}:${PLANS_FORWARD_COVERAGE_POLICY.version}`,
    );
  });

  it('does not treat library-only days as planned and does not attach outside the plan', () => {
    const proposal = proposePlanWeek({
      today: '2026-08-16',
      hasUsableRhythm: true,
      planId: null,
      forwardCoveredDayCount: 0,
      days: [
        dayInput({
          date: '2026-08-16',
          inPlanRange: false,
          hasPlanDay: false,
          attachableSlotKeys: [],
          rows: [row('breakfast', 'empty', 'Breakfast')],
        }),
      ],
    });
    expect(proposal.canAttachAny).toBe(false);
    expect(proposal.canEnsureAny).toBe(false);
    expect(proposal.days[0]?.occasions[0]?.status).toBe('open');
    expect(proposal.days[0]?.occasions[0]?.canAttach).toBe(false);
    expect(proposal.days[0]?.occasions[0]?.canEnsure).toBe(false);
    expect(proposal.reasonCodes).toContain('no_active_plan_attach_deferred');
    expect(proposal.view).toBe('board');
  });

  it('keeps days outside the active plan range read-only', () => {
    const proposal = proposePlanWeek({
      today: '2026-08-16',
      hasUsableRhythm: true,
      planId: 'plan-1',
      forwardCoveredDayCount: 0,
      days: [
        dayInput({
          date: '2026-08-16',
          inPlanRange: false,
          hasPlanDay: false,
          attachableSlotKeys: [],
          rows: [row('dinner', 'empty', 'Dinner')],
        }),
      ],
    });
    expect(proposal.days[0]?.attachable).toBe(false);
    expect(proposal.days[0]?.occasions[0]?.canAttach).toBe(false);
    expect(proposal.days[0]?.occasions[0]?.canEnsure).toBe(false);
    expect(proposal.reasonCodes).toContain('week_outside_active_plan');
  });

  it('marks the week complete only when attachable open occasions are filled', () => {
    const proposal = proposePlanWeek({
      today: '2026-08-16',
      hasUsableRhythm: true,
      planId: 'plan-1',
      forwardCoveredDayCount: 4,
      days: [
        dayInput({
          date: '2026-08-16',
          rows: [row('breakfast', 'pending'), row('lunch', 'eaten')],
        }),
      ],
    });
    expect(proposal.view).toBe('complete');
    expect(proposal.nextOpen).toBeNull();
    expect(proposal.reasonCodes).toContain('week_attachable_occasions_planned');
    expect(proposal.reasonCodes).toContain('forward_coverage_healthy');
    expect(proposal.forwardCoverage.horizonDays).toBe(6);
    expect(proposal.forwardCoverage.healthyMinCoveredDays).toBe(3);
  });

  it('does not overwrite a planned occasion as attachable', () => {
    const proposal = proposePlanWeek({
      today: '2026-08-16',
      hasUsableRhythm: true,
      planId: 'plan-1',
      forwardCoveredDayCount: 0,
      days: [
        dayInput({
          date: '2026-08-16',
          rows: [row('breakfast', 'pending', 'Breakfast')],
        }),
      ],
    });
    expect(proposal.days[0]?.occasions[0]?.status).toBe('planned');
    expect(proposal.days[0]?.occasions[0]?.canAttach).toBe(false);
    expect(proposal.days[0]?.occasions[0]?.canEnsure).toBe(false);
  });

  it('marks in-range missing plan_day/slot occasions as ensurable, not library-only', () => {
    const proposal = proposePlanWeek({
      today: '2026-08-16',
      hasUsableRhythm: true,
      planId: 'plan-1',
      forwardCoveredDayCount: 0,
      days: [
        dayInput({
          date: '2026-08-16',
          inPlanRange: true,
          hasPlanDay: false,
          attachableSlotKeys: [],
          rows: [row('lunch', 'empty', 'Lunch')],
        }),
      ],
    });
    expect(proposal.days[0]?.occasions[0]?.canAttach).toBe(false);
    expect(proposal.days[0]?.occasions[0]?.canEnsure).toBe(true);
    expect(proposal.canEnsureAny).toBe(true);
    expect(proposal.view).toBe('board');
    expect(proposal.nextOpen).toEqual({
      date: '2026-08-16',
      slotKey: 'lunch',
      label: 'Lunch',
      canAttach: false,
      canEnsure: true,
    });
    expect(proposal.reasonCodes).toContain('canonical_planned_meal_attach');
    expect(proposal.reasonCodes).not.toContain('week_outside_active_plan');
  });
});

describe('rowsForPlanWeekDate / buildPlanWeekDaysFromPlan', () => {
  const schedule: ResolvedScheduleSlot[] = [
    {
      key: 'breakfast',
      label: 'Breakfast',
      target_time: '08:00',
      slot_block: 'morning',
      enabled: true,
    },
    {
      key: 'lunch',
      label: 'Lunch',
      target_time: '12:30',
      slot_block: 'midday',
      enabled: true,
    },
  ];

  function plan(overrides: Partial<Plan> = {}): Plan {
    return {
      id: 'plan-1',
      person_id: 'person-1',
      title: 'Week',
      plan_shape: 'week',
      source: 'ai_generated',
      status: 'active',
      start_date: '2026-08-16',
      end_date: '2026-08-22',
      program_slug: null,
      program_run_id: null,
      input_snapshot_json: {} as Plan['input_snapshot_json'],
      nds_version: '1',
      classifier_version: '1',
      created_at: '2026-08-16T10:00:00.000Z',
      updated_at: '2026-08-16T10:00:00.000Z',
      ...overrides,
    };
  }

  function day(date: string): PlanDay {
    return {
      id: `day-${date}`,
      plan_id: 'plan-1',
      person_id: 'person-1',
      date_local: date,
      projected_nds_100: null,
      projected_wfr_10: null,
      projected_ps_10: null,
      projected_pnd_10: null,
      projected_fp_10: null,
      projected_as_10: null,
      projected_mnc_10: null,
      projected_ob_10: null,
      projection_confidence: null,
      projection_debug_json: null,
      notes: null,
      nds_version: '1',
      classifier_version: '1',
      created_at: '',
      updated_at: '',
    };
  }

  function slot(id: string, dayId: string, label: string, time: string): PlanSlot {
    return {
      id,
      plan_day_id: dayId,
      person_id: 'person-1',
      slot_block: 'morning',
      slot_ordinal: 0,
      slot_label: label,
      target_time: time,
      created_at: '',
      updated_at: '',
    };
  }

  function meal(
    id: string,
    dayId: string,
    slotId: string,
    name: string,
  ): PlannedMeal {
    return {
      id,
      plan_id: 'plan-1',
      plan_day_id: dayId,
      plan_slot_id: slotId,
      person_id: 'person-1',
      name,
      meal_type: 'breakfast',
      payload: {},
      protein_score_10: null,
      is_main_meal: false,
      psq_multiplier: 1,
      meal_derived_data: {},
      nds_confidence: 'medium',
      source_template_id: null,
      source_imported_meal_id: null,
      reusable_provenance: null,
      nds_version: '1',
      classifier_version: '1',
      execution_state: 'pending',
      journal_entry_id: null,
      created_at: '',
      updated_at: '',
    };
  }

  it('preserves an existing planned meal instead of replacing it with a default', () => {
    const d = day('2026-08-16');
    const breakfast = slot('slot-b', d.id, 'Breakfast', '08:00');
    const rows = rowsForPlanWeekDate({
      date: '2026-08-16',
      scheduleSlots: schedule,
      days: [d],
      slots: [breakfast],
      meals: [meal('meal-oats', d.id, breakfast.id, 'Overnight oats')],
    });
    expect(rows[0]?.mealName).toBe('Overnight oats');
    expect(rows[0]?.mealId).toBe('meal-oats');
    expect(rows[0]?.state).toBe('pending');
    expect(rows[1]?.state).toBe('empty');
    expect(rows[1]?.mealName).toBeNull();
  });

  it('does not invent occasions beyond the saved Meal Rhythm', () => {
    const built = buildPlanWeekDaysFromPlan({
      today: '2026-08-16',
      scheduleSlots: [schedule[0]!],
      plan: plan(),
      days: [day('2026-08-16')],
      slots: [slot('slot-b', 'day-2026-08-16', 'Breakfast', '08:00')],
      meals: [],
    });
    expect(built).toHaveLength(7);
    expect(built[0]?.rows.map((item) => item.slotKey)).toEqual(['breakfast']);
    expect(built.every((item) => item.rows.length === 1)).toBe(true);
  });
});
