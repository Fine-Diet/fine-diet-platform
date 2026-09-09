import {
  buildPlansHomeGuidance,
  mealExecutionToWindowState,
  resolveDefaultPlansHomeSelectedDate,
  resolvePlanDateCoverage,
} from '../buildGuidance';
import type { Plan, PlanDay, PlannedMeal, PlanSlot, ResolvedScheduleSlot } from '../../types';

function scheduleSlot(
  key: ResolvedScheduleSlot['key'],
  label: string,
  time: string,
): ResolvedScheduleSlot {
  return {
    key,
    label,
    target_time: time,
    slot_block: 'morning',
    enabled: true,
  };
}

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    person_id: 'person-1',
    title: 'Week of Jul 12, 2026',
    plan_shape: 'week',
    source: 'ai_generated',
    status: 'active',
    start_date: '2026-07-12',
    end_date: '2026-07-18',
    program_slug: null,
    program_run_id: null,
    input_snapshot_json: {} as Plan['input_snapshot_json'],
    nds_version: '1',
    classifier_version: '1',
    created_at: '2026-07-12T10:00:00.000Z',
    updated_at: '2026-07-12T10:00:00.000Z',
    ...overrides,
  };
}

function day(date: string, projectedNds: number | null = null): PlanDay {
  return {
    id: `day-${date}`,
    plan_id: 'plan-1',
    person_id: 'person-1',
    date_local: date,
    projected_nds_100: projectedNds,
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

function slot(
  id: string,
  dayId: string,
  label: string,
  time: string,
  ordinal = 0,
): PlanSlot {
  return {
    id,
    plan_day_id: dayId,
    person_id: 'person-1',
    slot_block: 'morning',
    slot_ordinal: ordinal,
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
  execution_state: PlannedMeal['execution_state'],
  journalEntryId: string | null = null,
  calories: number | null = null,
): PlannedMeal {
  return {
    id,
    plan_id: 'plan-1',
    plan_day_id: dayId,
    plan_slot_id: slotId,
    person_id: 'person-1',
    name,
    meal_type: 'breakfast',
    payload: calories == null ? {} : { totals: { calories } },
    protein_score_10: null,
    is_main_meal: false,
    psq_multiplier: 1,
    meal_derived_data: (calories == null ? {} : { meal_calories: calories }) as PlannedMeal['meal_derived_data'],
    nds_confidence: 'medium',
    source_template_id: null,
    source_imported_meal_id: null,
    reusable_provenance: null,
    nds_version: '1',
    classifier_version: '1',
    execution_state,
    journal_entry_id: journalEntryId,
    created_at: '',
    updated_at: '',
  };
}

describe('buildPlansHomeGuidance', () => {
  const schedule = [
    scheduleSlot('breakfast', 'Breakfast', '11:00'),
    scheduleSlot('lunch', 'Lunch', '14:00'),
  ];

  it('maps meal execution states', () => {
    expect(mealExecutionToWindowState(null)).toBe('empty');
    expect(
      mealExecutionToWindowState(
        meal('m1', 'day-1', 's1', 'Oats', 'eaten'),
      ),
    ).toBe('eaten');
  });

  it('returns no_active_plan when plan is missing', () => {
    const model = buildPlansHomeGuidance({
      plan: null,
      days: [],
      slots: [],
      meals: [],
      scheduleSlots: schedule,
      selectedDate: '2026-07-12',
      hasSchedule: true,
    });
    expect(model.status).toBe('no_active_plan');
    expect(model.planId).toBeNull();
    expect(model.rows).toHaveLength(2);
    expect(model.plannedCount).toBe(0);
    expect(model.totalCount).toBe(2);
  });

  it('returns ready with selected-day rows for the current plan', () => {
    const d = day('2026-07-12');
    const breakfastSlot = slot('slot-b', d.id, 'Breakfast', '11:00');
    const model = buildPlansHomeGuidance({
      plan: plan(),
      days: [d],
      slots: [breakfastSlot],
      meals: [meal('m1', d.id, breakfastSlot.id, 'Oats', 'pending')],
      scheduleSlots: schedule,
      selectedDate: '2026-07-12',
      hasSchedule: true,
    });
    expect(model.status).toBe('ready');
    expect(model.planId).toBe('plan-1');
    expect(model.rows[0]?.mealName).toBe('Oats');
    expect(model.rows[0]?.state).toBe('pending');
    expect(model.rows[1]?.state).toBe('empty');
    expect(model.plannedCount).toBe(1);
    expect(model.totalCount).toBe(2);
    expect(model.days[0]?.markers[0]?.planned).toBe(true);
    expect(model.days[0]?.markers[1]?.planned).toBe(false);
  });

  it('counts one structurally linked meal in exactly one row and week marker', () => {
    const d = day('2026-07-12');
    const rhythm = [
      scheduleSlot('occasion_2', 'Fuel', '08:00'),
      scheduleSlot('occasion_4', 'Fuel', '14:00'),
    ];
    const breakfastSlot = slot('slot-b', d.id, 'Fuel', '08:00', 1);
    const lunchSlot = slot('slot-l', d.id, 'Fuel', '14:00', 2);
    const savedLunch = meal(
      'm1',
      d.id,
      lunchSlot.id,
      'Founder QA meal',
      'pending',
    );
    // Deliberately stale/generic metadata reproduces the original collision:
    // structural Lunch association must win over meal_type='breakfast'.
    savedLunch.meal_type = 'breakfast';

    const model = buildPlansHomeGuidance({
      plan: plan(),
      days: [d],
      slots: [breakfastSlot, lunchSlot],
      meals: [savedLunch],
      scheduleSlots: rhythm,
      selectedDate: d.date_local,
      hasSchedule: true,
    });

    expect(model.rows.map((row) => row.mealId)).toEqual([null, 'm1']);
    expect(model.plannedCount).toBe(1);
    expect(model.totalCount).toBe(2);
    expect(model.days[0]?.markers.map((marker) => marker.planned)).toEqual([
      false,
      true,
    ]);
  });

  it('renders, counts, and summarizes legacy siblings as one structural occasion', () => {
    const d = day('2026-07-12', 99);
    const breakfastSlot = slot('slot-b', d.id, 'Breakfast', '11:00');
    const older = meal('older', d.id, breakfastSlot.id, 'Old save', 'pending', null, 900);
    older.updated_at = '2026-07-12T10:00:00.000Z';
    const current = meal('current', d.id, breakfastSlot.id, 'Current save', 'pending', null, 300);
    current.updated_at = '2026-07-12T11:00:00.000Z';
    current.payload = {
      ...current.payload,
      typed_components: [
        { component_id: 'a', name: 'A' },
        { component_id: 'b', name: 'B' },
        { component_id: 'c', name: 'C' },
      ],
    } as PlannedMeal['payload'];

    const model = buildPlansHomeGuidance({
      plan: plan(),
      days: [d],
      slots: [breakfastSlot],
      meals: [older, current],
      scheduleSlots: schedule,
      selectedDate: d.date_local,
      hasSchedule: true,
    });

    expect(model.rows[0]?.mealId).toBe('current');
    expect(model.rows[0]?.meal).toBe(current);
    expect(model.rows[0]?.planSlot?.id).toBe(breakfastSlot.id);
    expect(model.plannedCount).toBe(1);
    expect(model.days[0]?.markers[0]?.planned).toBe(true);
    expect(model.plannedCalories).toBe(300);
    expect(model.projectedNds).not.toBe(99);
  });

  it.each([
    ['eaten', 'journal-1'],
    ['skipped', null],
  ] as const)('keeps a %s meal planned for completeness', (executionState, journalEntryId) => {
    const d = day('2026-07-12');
    const breakfastSlot = slot('slot-b', d.id, 'Breakfast', '11:00');
    const model = buildPlansHomeGuidance({
      plan: plan(),
      days: [d],
      slots: [breakfastSlot],
      meals: [meal('m1', d.id, breakfastSlot.id, 'Oats', executionState, journalEntryId)],
      scheduleSlots: schedule,
      selectedDate: '2026-07-12',
      hasSchedule: true,
    });

    expect(model.rows[0]?.state).toBe(executionState);
    expect(model.rows[0]?.journalEntryId).toBe(journalEntryId);
    expect(model.days[0]?.markers[0]?.planned).toBe(true);
    expect(model.plannedCount).toBe(1);
    expect(model.totalCount).toBe(2);
  });

  it('builds selected-day planning nutrition from plan truth and current target', () => {
    const d = day('2026-07-12', 76.4);
    const breakfastSlot = slot('slot-b', d.id, 'Breakfast', '11:00');
    const lunchSlot = slot('slot-l', d.id, 'Lunch', '14:00');
    const model = buildPlansHomeGuidance({
      plan: plan(),
      days: [d],
      slots: [breakfastSlot, lunchSlot],
      meals: [
        meal('m1', d.id, breakfastSlot.id, 'Oats', 'eaten', 'journal-1', 420),
        meal('m2', d.id, lunchSlot.id, 'Soup', 'skipped', null, 330),
      ],
      scheduleSlots: schedule,
      selectedDate: '2026-07-12',
      hasSchedule: true,
      dailyCalorieGoal: 2100,
    });

    expect(model.projectedNds).toBe(76.4);
    expect(model.plannedCalories).toBe(750);
    expect(model.dailyCalorieGoal).toBe(2100);
  });

  it('does not turn an empty structural projection into a fabricated NDS', () => {
    const d = day('2026-07-12', 0);
    const model = buildPlansHomeGuidance({
      plan: plan(),
      days: [d],
      slots: [],
      meals: [],
      scheduleSlots: schedule,
      selectedDate: '2026-07-12',
      hasSchedule: true,
      dailyCalorieGoal: null,
    });

    expect(model.projectedNds).toBeNull();
    expect(model.plannedCalories).toBeNull();
    expect(model.dailyCalorieGoal).toBeNull();
  });

  it('returns no_schedule when schedule is absent', () => {
    const model = buildPlansHomeGuidance({
      plan: plan(),
      days: [],
      slots: [],
      meals: [],
      scheduleSlots: [],
      selectedDate: '2026-07-12',
      hasSchedule: false,
    });
    expect(model.status).toBe('no_schedule');
  });

  it('keeps local calendar context available when date is outside coverage', () => {
    const d = day('2026-07-12');
    const breakfastSlot = slot('slot-b', d.id, 'Breakfast', '11:00');
    const model = buildPlansHomeGuidance({
      plan: plan(),
      days: [d],
      slots: [breakfastSlot],
      meals: [meal('m1', d.id, breakfastSlot.id, 'Stub meal name', 'pending')],
      scheduleSlots: schedule,
      selectedDate: '2026-08-03',
      hasSchedule: true,
      dateInPlanRange: false,
    });
    expect(model.status).toBe('out_of_range');
    expect(model.planId).toBe('plan-1');
    expect(model.rows).toHaveLength(2);
    expect(model.days).toHaveLength(7);
    expect(model.plannedCount).toBe(0);
    expect(model.totalCount).toBe(2);
    expect(model.errorMessage).toMatch(/outside the active plan/i);
  });
});

describe('resolvePlanDateCoverage / resolveDefaultPlansHomeSelectedDate', () => {
  it('derives coverage from plan_days when present', () => {
    const coverage = resolvePlanDateCoverage({
      plan: plan({ start_date: '2026-07-26', end_date: null }),
      days: [day('2026-07-26'), day('2026-08-01')],
    });
    expect(coverage).toEqual({ start: '2026-07-26', end: '2026-08-01' });
  });

  it('defaults to today when today is inside the active plan range', () => {
    const resolved = resolveDefaultPlansHomeSelectedDate({
      today: '2026-07-15',
      plan: plan(),
      days: [day('2026-07-12'), day('2026-07-18')],
    });
    expect(resolved.selectedDate).toBe('2026-07-15');
    expect(resolved.inRange).toBe(true);
  });

  it('does not silently jump to start_date when today is past the plan', () => {
    const resolved = resolveDefaultPlansHomeSelectedDate({
      today: '2026-08-03',
      plan: plan({
        id: '82f54025-expired-active',
        start_date: '2026-07-26',
        end_date: '2026-08-01',
      }),
      days: [day('2026-07-26'), day('2026-08-01')],
    });
    expect(resolved.selectedDate).toBe('2026-08-03');
    expect(resolved.inRange).toBe(false);
    expect(resolved.selectedDate).not.toBe('2026-07-26');
  });

  it('does not silently jump to start_date when today is before the plan', () => {
    const resolved = resolveDefaultPlansHomeSelectedDate({
      today: '2026-07-01',
      plan: plan({ start_date: '2026-07-12', end_date: '2026-07-18' }),
      days: [day('2026-07-12'), day('2026-07-18')],
    });
    expect(resolved.selectedDate).toBe('2026-07-01');
    expect(resolved.inRange).toBe(false);
  });

  it('honors explicit historical ?date when it falls inside coverage', () => {
    const resolved = resolveDefaultPlansHomeSelectedDate({
      today: '2026-08-03',
      plan: plan({ start_date: '2026-07-26', end_date: '2026-08-01' }),
      days: [day('2026-07-26'), day('2026-08-01')],
      explicitDate: '2026-07-28',
    });
    expect(resolved.selectedDate).toBe('2026-07-28');
    expect(resolved.inRange).toBe(true);
  });

  it('marks explicit ?date out of range when it falls outside coverage', () => {
    const resolved = resolveDefaultPlansHomeSelectedDate({
      today: '2026-08-03',
      plan: plan(),
      days: [day('2026-07-12'), day('2026-07-18')],
      explicitDate: '2026-08-03',
    });
    expect(resolved.selectedDate).toBe('2026-08-03');
    expect(resolved.inRange).toBe(false);
  });
});
