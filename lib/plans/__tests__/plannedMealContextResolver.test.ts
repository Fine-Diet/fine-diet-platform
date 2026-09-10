import {
  resolvePlannedMealContext,
  type PlannedMealContextReadClient,
} from '../plannedMealContextResolver';
import type {
  Plan,
  PlannedMeal,
  PlanSlot,
  ResolvedScheduleSlot,
} from '../types';

const DATE = '2026-09-09';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'manual-day-plan',
    person_id: 'person-1',
    title: 'Day plan · 2026-09-09',
    plan_shape: 'day',
    source: 'user_manual',
    status: 'draft',
    start_date: DATE,
    end_date: DATE,
    program_slug: null,
    program_run_id: null,
    input_snapshot_json: {} as Plan['input_snapshot_json'],
    nds_version: '1',
    classifier_version: '1',
    created_at: '2026-09-09T00:24:02.000Z',
    updated_at: '2026-09-09T00:24:02.000Z',
    ...overrides,
  };
}

function planSlot(
  id: string,
  label: string,
  targetTime: string,
  ordinal: number,
): PlanSlot {
  return {
    id,
    plan_day_id: 'day-1',
    person_id: 'person-1',
    slot_block: ordinal < 3 ? 'morning' : 'evening',
    slot_ordinal: ordinal,
    slot_label: label,
    target_time: targetTime,
    created_at: '',
    updated_at: '',
  };
}

function scheduleSlot(
  key: ResolvedScheduleSlot['key'],
  label: string,
  targetTime: string,
): ResolvedScheduleSlot {
  return {
    key,
    label,
    target_time: targetTime,
    slot_block: 'evening',
    enabled: true,
  };
}

function meal(
  id: string,
  planSlotId: string,
  overrides: Partial<PlannedMeal> = {},
): PlannedMeal {
  return {
    id,
    plan_id: 'manual-day-plan',
    plan_day_id: 'day-1',
    plan_slot_id: planSlotId,
    person_id: 'person-1',
    name: id,
    meal_type: 'dinner',
    payload: { totals: { calories: 500 } },
    source_template_id: null,
    source_imported_meal_id: null,
    reusable_provenance: null,
    execution_state: 'pending',
    journal_entry_id: null,
    protein_score_10: null,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: {},
    nds_confidence: 'medium',
    nds_version: '1',
    classifier_version: '1',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function client(overrides: Partial<PlannedMealContextReadClient> = {}) {
  return {
    list: jest.fn().mockResolvedValue([plan()]),
    getDayDetail: jest.fn().mockResolvedValue({ meals: [], slots: [] }),
    getMeal: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as jest.Mocked<PlannedMealContextReadClient>;
}

describe('resolvePlannedMealContext authenticated runtime boundary', () => {
  it('discovers the persisted-style draft manual day Plan used by Plans Home', async () => {
    const dinnerSlot = planSlot('slot-dinner', 'Dinner', '17:00:00', 5);
    const dinner = meal('Dinner', dinnerSlot.id);
    const readClient = client({
      getDayDetail: jest.fn().mockResolvedValue({
        meals: [dinner],
        slots: [dinnerSlot],
      }),
    });

    const result = await resolvePlannedMealContext(
      {
        dateKey: DATE,
        mealSlot: scheduleSlot('occasion_7', 'Dinner', '17:00'),
        scheduleSlots: [
          scheduleSlot('occasion_7', 'Dinner', '17:00'),
        ],
      },
      readClient,
    );

    expect(result).toEqual({
      status: 'resolved',
      meals: [dinner],
      planId: 'manual-day-plan',
      diagnostic: null,
    });
    expect(readClient.getDayDetail).toHaveBeenCalledWith(
      'manual-day-plan',
      DATE,
    );
    expect(readClient.getMeal).not.toHaveBeenCalled();
  });

  it('keeps repeated Mini Meals isolated by structural time', async () => {
    const amSlot = planSlot('slot-am', 'Mini Meal', '06:30:00', 1);
    const pmSlot = planSlot('slot-pm', 'Mini Meal', '17:00:00', 5);
    const amMeal = meal('AM Mini Meal', amSlot.id, { meal_type: 'snack' });
    const pmMeal = meal('PM Mini Meal', pmSlot.id, { meal_type: 'snack' });
    const schedule = [
      scheduleSlot('occasion_1', 'Mini Meal', '06:30'),
      scheduleSlot('occasion_6', 'Mini Meal', '17:00'),
    ];
    const readClient = client({
      getDayDetail: jest.fn().mockResolvedValue({
        meals: [amMeal, pmMeal],
        slots: [amSlot, pmSlot],
      }),
    });

    const am = await resolvePlannedMealContext(
      { dateKey: DATE, mealSlot: schedule[0]!, scheduleSlots: schedule },
      readClient,
    );
    const pm = await resolvePlannedMealContext(
      { dateKey: DATE, mealSlot: schedule[1]!, scheduleSlots: schedule },
      readClient,
    );

    expect(am.meals.map((candidate) => candidate.id)).toEqual([
      'AM Mini Meal',
    ]);
    expect(pm.meals.map((candidate) => candidate.id)).toEqual([
      'PM Mini Meal',
    ]);
  });

  it('uses explicit plannedMealId without generic Plan or slot discovery', async () => {
    const exact = meal('exact-meal', 'slot-exact');
    const readClient = client({
      getMeal: jest.fn().mockResolvedValue({
        meal: exact,
        date_local: DATE,
      }),
    });

    const result = await resolvePlannedMealContext(
      {
        dateKey: DATE,
        mealSlot: scheduleSlot('occasion_7', 'Dinner', '17:00'),
        explicitPlannedMealId: exact.id,
      },
      readClient,
    );

    expect(result.meals).toEqual([exact]);
    expect(readClient.getMeal).toHaveBeenCalledWith(exact.id, { date: DATE });
    expect(readClient.list).not.toHaveBeenCalled();
    expect(readClient.getDayDetail).not.toHaveBeenCalled();
  });

  it('distinguishes an empty match from a retrieval failure', async () => {
    const slot = scheduleSlot('occasion_7', 'Dinner', '17:00');
    const emptyClient = client();
    const failingClient = client({
      getDayDetail: jest.fn().mockRejectedValue(new Error('runtime read failed')),
    });

    const empty = await resolvePlannedMealContext(
      { dateKey: DATE, mealSlot: slot, scheduleSlots: [slot] },
      emptyClient,
    );
    const failed = await resolvePlannedMealContext(
      { dateKey: DATE, mealSlot: slot, scheduleSlots: [slot] },
      failingClient,
    );

    expect(empty).toEqual(
      expect.objectContaining({
        status: 'empty',
        diagnostic: expect.objectContaining({ kind: 'empty' }),
      }),
    );
    expect(failed).toEqual(
      expect.objectContaining({
        status: 'error',
        diagnostic: expect.objectContaining({
          kind: 'retrieval_error',
          phase: 'day_detail',
          message: 'runtime read failed',
        }),
      }),
    );
  });
});
