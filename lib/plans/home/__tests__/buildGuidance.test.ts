import { buildPlansHomeGuidance, mealExecutionToWindowState } from '../buildGuidance';
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

function plan(): Plan {
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
  execution_state: PlannedMeal['execution_state'],
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
    execution_state,
    journal_entry_id: null,
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
});
