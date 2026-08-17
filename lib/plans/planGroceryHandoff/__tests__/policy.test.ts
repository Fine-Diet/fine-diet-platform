import {
  classifyGroceryGenerateOutcome,
  countCanonicalPlannedMealsInRange,
  evaluatePlanGroceryHandoff,
  formatContainingRangeCopy,
  formatNoPlannedDemandCopy,
  formatPlanGroceryClampCopy,
  planGroceryHandoffHref,
  proposePlanGroceryRange,
  PLAN_GROCERY_HANDOFF_POLICY_ID,
  PLAN_GROCERY_HANDOFF_POLICY_VERSION,
} from '../policy';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import type { Plan, PlanDay, PlannedMeal } from '@/lib/plans/types';

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

function day(date: string, id = `day-${date}`): PlanDay {
  return {
    id,
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

function meal(id: string, dayId: string): PlannedMeal {
  return {
    id,
    plan_id: 'plan-1',
    plan_day_id: dayId,
    plan_slot_id: `slot-${id}`,
    person_id: 'person-1',
    name: 'Oats',
    meal_type: 'breakfast',
    payload: { source_meal_document_id: `doc-${id}` },
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

describe('proposePlanGroceryRange', () => {
  it('defaults to the visible Plan Week horizon when the plan covers that week', () => {
    const proposed = proposePlanGroceryRange({
      today: '2026-08-16',
      plan: plan(),
      days: [day('2026-08-16'), day('2026-08-22')],
    });
    expect(proposed).toMatchObject({
      policyId: PLAN_GROCERY_HANDOFF_POLICY_ID,
      policyVersion: PLAN_GROCERY_HANDOFF_POLICY_VERSION,
      dateStart: '2026-08-16',
      dateEnd: '2026-08-22',
      hasOverlap: true,
      clamped: false,
      clampKind: 'none',
    });
  });

  it('clamps the visible week to the canonical plan end and makes that visible', () => {
    const proposed = proposePlanGroceryRange({
      today: '2026-08-16',
      plan: plan({ end_date: '2026-08-18' }),
      days: [day('2026-08-16'), day('2026-08-18')],
    });
    expect(proposed?.dateStart).toBe('2026-08-16');
    expect(proposed?.dateEnd).toBe('2026-08-18');
    expect(proposed?.clamped).toBe(true);
    expect(proposed?.clampKind).toBe('plan_end');
    expect(proposed?.reasonCodes).toContain('range_clamped_to_plan');
    expect(formatPlanGroceryClampCopy(proposed!)).toContain('2026-08-18');
  });

  it('does not invent a range when the visible week is outside the plan', () => {
    const proposed = proposePlanGroceryRange({
      today: '2026-08-16',
      plan: plan({ start_date: '2026-08-01', end_date: '2026-08-07' }),
      days: [day('2026-08-01'), day('2026-08-07')],
    });
    expect(proposed?.hasOverlap).toBe(false);
    expect(proposed?.reasonCodes).toContain('no_range_overlap');
    expect(formatPlanGroceryClampCopy(proposed!)).toMatch(/outside your current plan/i);
  });

  it('returns null without an active plan', () => {
    expect(
      proposePlanGroceryRange({
        today: '2026-08-16',
        plan: null,
        days: [],
      }),
    ).toBeNull();
  });
});

describe('countCanonicalPlannedMealsInRange', () => {
  const days = [day('2026-08-16'), day('2026-08-17'), day('2026-08-18')];

  it('counts only canonical planned meals inside the confirmed range', () => {
    expect(
      countCanonicalPlannedMealsInRange({
        days,
        meals: [meal('m1', 'day-2026-08-16'), meal('m2', 'day-2026-08-18')],
        dateStart: '2026-08-16',
        dateEnd: '2026-08-17',
      }),
    ).toBe(1);
  });

  it('does not count open occasions, structural slots, or library-only meals', () => {
    expect(
      countCanonicalPlannedMealsInRange({
        days,
        meals: [],
        dateStart: '2026-08-16',
        dateEnd: '2026-08-22',
      }),
    ).toBe(0);
  });

  it('counts Packet 8 repeated attached meals inside the range', () => {
    expect(
      countCanonicalPlannedMealsInRange({
        days,
        meals: [meal('source', 'day-2026-08-16'), meal('repeated', 'day-2026-08-17')],
        dateStart: '2026-08-16',
        dateEnd: '2026-08-17',
      }),
    ).toBe(2);
  });
});

describe('evaluatePlanGroceryHandoff', () => {
  const days = [day('2026-08-16'), day('2026-08-17'), day('2026-08-18')];
  const proposed = proposePlanGroceryRange({
    today: '2026-08-16',
    plan: plan({ end_date: '2026-08-18' }),
    days,
  })!;

  it('accepts a user-changed range that stays inside canonical plan coverage', () => {
    const decision = evaluatePlanGroceryHandoff({
      plan: plan({ end_date: '2026-08-18' }),
      days,
      meals: [meal('m1', 'day-2026-08-16')],
      proposed,
      dateStart: '2026-08-16',
      dateEnd: '2026-08-16',
    });
    expect(decision.action).toBe('commit');
    expect(decision.reasonCodes).toContain('user_changed_range');
    expect(decision.reasonCodes).toContain('destructive_regenerate_held');
    expect(decision.plannedMealCount).toBe(1);
  });

  it('rejects dates outside the plan instead of silently extending it', () => {
    const decision = evaluatePlanGroceryHandoff({
      plan: plan({ end_date: '2026-08-18' }),
      days,
      meals: [meal('m1', 'day-2026-08-16')],
      proposed,
      dateStart: '2026-08-16',
      dateEnd: '2026-08-22',
    });
    expect(decision).toMatchObject({
      action: 'reject',
      reasonCodes: ['outside_plan_coverage'],
    });
  });

  it('rejects invalid calendar dates', () => {
    const decision = evaluatePlanGroceryHandoff({
      plan: plan({ end_date: '2026-08-18' }),
      days,
      meals: [meal('m1', 'day-2026-08-16')],
      proposed,
      dateStart: '2026-08-32',
      dateEnd: '2026-08-32',
    });
    expect(decision.action).toBe('reject');
    expect(decision.reasonCodes).toContain('invalid_dates');
  });

  it('returns no_planned_demand without fabricating grocery demand', () => {
    const decision = evaluatePlanGroceryHandoff({
      plan: plan({ end_date: '2026-08-18' }),
      days,
      meals: [],
      proposed,
      dateStart: '2026-08-16',
      dateEnd: '2026-08-18',
    });
    expect(decision.action).toBe('no_planned_demand');
    expect(decision.reasonCodes).toContain('no_planned_demand');
    expect(formatNoPlannedDemandCopy()).toMatch(/open occasions/i);
  });
});

describe('classifyGroceryGenerateOutcome / href', () => {
  it('treats exact and containing lists as reuse, not regenerate', () => {
    expect(classifyGroceryGenerateOutcome('exact_range')).toBe('reused');
    expect(classifyGroceryGenerateOutcome('exact_day')).toBe('reused');
    expect(classifyGroceryGenerateOutcome('containing_range')).toBe('reused');
    expect(classifyGroceryGenerateOutcome('generated_exact_range')).toBe('generated');
    expect(classifyGroceryGenerateOutcome('generated_exact_day')).toBe('generated');
  });

  it('routes success to the returned list id on the existing grocery list surface', () => {
    expect(
      planGroceryHandoffHref({
        listId: 'list-1',
        requestedStart: '2026-08-16',
        requestedEnd: '2026-08-18',
        selectionKind: 'generated_exact_range',
      }),
    ).toBe(APP_ROUTE_BUILDERS.foodGroceryList('list-1'));
    expect(
      planGroceryHandoffHref({
        listId: 'list-1',
        requestedStart: '2026-08-16',
        requestedEnd: '2026-08-16',
        selectionKind: 'exact_day',
      }),
    ).toBe(APP_ROUTE_BUILDERS.foodGroceryList('list-1'));
    expect(
      planGroceryHandoffHref({
        listId: 'list-1',
        requestedStart: '2026-08-16',
        requestedEnd: '2026-08-18',
        selectionKind: 'generated_exact_range',
      }),
    ).not.toContain('/plan/');
  });

  it('does not present a containing-range reuse as an exact requested range', () => {
    expect(
      planGroceryHandoffHref({
        listId: 'list-week',
        requestedStart: '2026-08-16',
        requestedEnd: '2026-08-17',
        selectionKind: 'containing_range',
      }),
    ).toBe(
      `${APP_ROUTE_BUILDERS.foodGroceryList('list-week')}?requested_start=2026-08-16&requested_end=2026-08-17`,
    );
    expect(
      formatContainingRangeCopy({
        requestedStart: '2026-08-16',
        requestedEnd: '2026-08-17',
        activeStart: '2026-08-16',
        activeEnd: '2026-08-22',
      }),
    ).toBe(
      'Requested 2026-08-16 to 2026-08-17. Showing the existing grocery list for 2026-08-16 to 2026-08-22.',
    );
  });
});
