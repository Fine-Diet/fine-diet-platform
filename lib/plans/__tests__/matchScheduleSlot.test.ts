import {
  findMealsForScheduleSlot,
  findPlannedMealById,
  resolvePlannedMealsForLogContext,
  resolveScheduleSlotKeyForMeal,
  collectPlannedMealsForScheduleSlotAcrossPlans,
} from '../matchScheduleSlot';
import type { PlannedMeal, PlanSlot, ResolvedScheduleSlot } from '../types';

function slot(key: string, label: string, time = '08:00'): ResolvedScheduleSlot {
  return {
    key: key as ResolvedScheduleSlot['key'],
    label,
    target_time: time,
    slot_block: 'morning',
    enabled: true,
  };
}

function planSlot(
  id: string,
  label: string,
  time: string | null,
  ordinal = 0,
): PlanSlot {
  return {
    id,
    plan_day_id: 'day-1',
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
  overrides: Partial<PlannedMeal> & { meal_type?: PlannedMeal['meal_type'] },
): PlannedMeal {
  return {
    id,
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: overrides.plan_slot_id ?? 'slot-a',
    person_id: 'person-1',
    name: overrides.name ?? `Meal ${id}`,
    meal_type: overrides.meal_type ?? 'breakfast',
    payload: overrides.payload ?? { totals: { calories: 400 } },
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
    execution_state: overrides.execution_state ?? 'pending',
    journal_entry_id: overrides.journal_entry_id ?? null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('findMealsForScheduleSlot', () => {
  const breakfast = slot('breakfast', 'Breakfast');
  const daySlots = [planSlot('slot-a', 'Breakfast', '08:00')];
  const dayMeals = [
    meal('m1', { name: 'Oats', plan_slot_id: 'slot-a' }),
    meal('m2', { name: 'Smoothie', plan_slot_id: 'slot-a', meal_type: 'breakfast' }),
    meal('m3', { name: 'Lunch salad', plan_slot_id: 'slot-b', meal_type: 'lunch' }),
  ];

  it('returns all matching meals for a slot', () => {
    const matches = findMealsForScheduleSlot(breakfast, dayMeals, daySlots);
    expect(matches.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('returns empty when nothing matches meal type or slot time', () => {
    const snack = slot('afternoon_snack', 'Afternoon snack', '15:00');
    expect(findMealsForScheduleSlot(snack, dayMeals, daySlots)).toEqual([]);
  });

  it('does not select a slot solely from v2 occasion→meal_type semantics', () => {
    const occasion2 = slot('occasion_2', 'Rise', '08:00');
    const otherSlots = [planSlot('slot-x', 'Other', '12:00')];
    const breakfastTyped = meal('m-b', {
      plan_slot_id: 'slot-x',
      meal_type: 'breakfast',
    });
    expect(findMealsForScheduleSlot(occasion2, [breakfastTyped], otherSlots)).toEqual([]);
  });

  it('matches v2 occasions via structural plan-slot time/label evidence', () => {
    const occasion2 = slot('occasion_2', 'Rise', '08:00');
    const day = [planSlot('slot-a', 'Rise', '08:00')];
    const neutralMeal = meal('m-n', {
      plan_slot_id: 'slot-a',
      meal_type: 'other',
    });
    expect(findMealsForScheduleSlot(occasion2, [neutralMeal], day).map((m) => m.id)).toEqual([
      'm-n',
    ]);
  });

  it('normalizes persisted HH:mm:ss times without weakening structural identity', () => {
    const miniMeal = slot('occasion_3', 'Mini Meal', '10:30');
    const day = [planSlot('slot-mini', 'Mini Meal', '10:30:00')];
    const planned = meal('m-mini', {
      plan_slot_id: 'slot-mini',
      meal_type: 'snack',
    });

    expect(findMealsForScheduleSlot(miniMeal, [planned], day)).toEqual([
      planned,
    ]);
  });

  it('does not let meal_type override an explicit different plan slot', () => {
    const breakfast = slot('occasion_2', 'Breakfast', '08:00');
    const lunch = slot('occasion_4', 'Lunch', '12:00');
    const lunchPlanSlot = planSlot('slot-lunch', 'Lunch', '12:00');
    const structurallyLunch = meal('m-lunch', {
      plan_slot_id: lunchPlanSlot.id,
      meal_type: 'breakfast',
    });

    expect(findMealsForScheduleSlot(breakfast, [structurallyLunch], [lunchPlanSlot])).toEqual([]);
    expect(
      findMealsForScheduleSlot(lunch, [structurallyLunch], [lunchPlanSlot]).map(
        (candidate) => candidate.id,
      ),
    ).toEqual(['m-lunch']);
  });

  it('keeps structurally distinct v2 occasions separate when labels match', () => {
    const rhythm = [
      slot('occasion_2', 'Fuel', '07:00'),
      slot('occasion_4', 'Fuel', '12:00'),
    ];
    const day = [
      planSlot('slot-early', 'Fuel', '07:00', 1),
      planSlot('slot-late', 'Fuel', '12:00', 2),
    ];
    const lateMeal = meal('m-late', {
      plan_slot_id: 'slot-late',
      meal_type: 'breakfast',
    });

    expect(findMealsForScheduleSlot(rhythm[0]!, [lateMeal], day, rhythm)).toEqual([]);
    expect(
      findMealsForScheduleSlot(rhythm[1]!, [lateMeal], day, rhythm).map(
        (candidate) => candidate.id,
      ),
    ).toEqual(['m-late']);
  });

  it('fails closed when structurally unavailable legacy fallback is ambiguous', () => {
    const rhythm = [
      slot('morning_snack', 'Morning snack', '10:00'),
      slot('evening_snack', 'Evening snack', '20:00'),
    ];
    const legacySnack = meal('m-snack', {
      plan_slot_id: 'missing',
      meal_type: 'snack',
    });

    expect(findMealsForScheduleSlot(rhythm[0]!, [legacySnack], [], rhythm)).toEqual([]);
    expect(findMealsForScheduleSlot(rhythm[1]!, [legacySnack], [], rhythm)).toEqual([]);
    expect(resolveScheduleSlotKeyForMeal(legacySnack, null, rhythm)).toBeNull();
  });
});

describe('resolvePlannedMealsForLogContext', () => {
  const breakfast = slot('breakfast', 'Breakfast');
  const daySlots = [planSlot('slot-a', 'Breakfast', '08:00')];
  const dayMeals = [
    meal('m1', { plan_slot_id: 'slot-a' }),
    meal('m2', { plan_slot_id: 'slot-a' }),
  ];

  it('prefers explicit plannedMealId over slot matching', () => {
    const result = resolvePlannedMealsForLogContext({
      plannedMealId: 'm2',
      slot: breakfast,
      dayMeals,
      daySlots,
    });
    expect(result.selected?.id).toBe('m2');
    expect(result.meals.map((m) => m.id)).toEqual(['m2']);
  });

  it('returns all slot matches when no explicit id', () => {
    const result = resolvePlannedMealsForLogContext({
      plannedMealId: null,
      slot: breakfast,
      dayMeals,
      daySlots,
    });
    expect(result.meals.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(result.selected?.id).toBe('m1');
  });

  it('returns empty when explicit id is missing from day meals', () => {
    const result = resolvePlannedMealsForLogContext({
      plannedMealId: 'missing',
      slot: breakfast,
      dayMeals,
      daySlots,
    });
    expect(result.meals).toEqual([]);
    expect(result.selected).toBeNull();
  });
});

describe('findPlannedMealById', () => {
  it('finds a meal by id', () => {
    const m = meal('abc', {});
    expect(findPlannedMealById([m], 'abc')).toBe(m);
  });
});

describe('resolveScheduleSlotKeyForMeal', () => {
  it('returns the precise afternoon snack key instead of generic snack meal_type', () => {
    const afternoonSnack = slot('afternoon_snack', 'Afternoon snack', '15:00');
    const daySlots = [planSlot('slot-snack', 'Afternoon snack', '15:00')];
    const snackMeal = meal('m-snack', {
      plan_slot_id: 'slot-snack',
      meal_type: 'snack',
    });
    expect(
      resolveScheduleSlotKeyForMeal(snackMeal, daySlots[0]!, [afternoonSnack]),
    ).toBe('afternoon_snack');
  });
});

describe('collectPlannedMealsForScheduleSlotAcrossPlans', () => {
  it('returns matches from every plan day context', () => {
    const breakfast = slot('breakfast', 'Breakfast');
    const planA = {
      planId: 'plan-a',
      meals: [meal('m1', { plan_id: 'plan-a', plan_slot_id: 'slot-a' })],
      slots: [planSlot('slot-a', 'Breakfast', '08:00')],
    };
    const planB = {
      planId: 'plan-b',
      meals: [meal('m2', { plan_id: 'plan-b', plan_slot_id: 'slot-b' })],
      slots: [planSlot('slot-b', 'Breakfast', '08:00')],
    };
    const matches = collectPlannedMealsForScheduleSlotAcrossPlans(breakfast, [planA, planB]);
    expect(matches.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('keeps repeated labels isolated using the full schedule structure', () => {
    const rhythm = [
      slot('occasion_3', 'Mini Meal', '10:30'),
      slot('occasion_6', 'Mini Meal', '17:00'),
    ];
    const context = {
      planId: 'plan-a',
      meals: [
        meal('m-am', { plan_slot_id: 'slot-am' }),
        meal('m-pm', { plan_slot_id: 'slot-pm' }),
      ],
      slots: [
        planSlot('slot-am', 'Mini Meal', '10:30:00', 1),
        planSlot('slot-pm', 'Mini Meal', '17:00:00', 2),
      ],
    };

    expect(
      collectPlannedMealsForScheduleSlotAcrossPlans(
        rhythm[0]!,
        [context],
        rhythm,
      ).map((candidate) => candidate.id),
    ).toEqual(['m-am']);
    expect(
      collectPlannedMealsForScheduleSlotAcrossPlans(
        rhythm[1]!,
        [context],
        rhythm,
      ).map((candidate) => candidate.id),
    ).toEqual(['m-pm']);
  });
});
