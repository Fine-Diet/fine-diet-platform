import { dayPlanDraftSignature } from '@/lib/plans/dayPlanDraftStore';
import {
  materializeRhythmSlot,
  projectTemplateOntoRhythm,
  type ProjectedDayPlanSlot,
} from '@/lib/plans/projectTemplateOntoRhythm';
import type {
  PlanDayTemplate,
  PlanDayTemplateMeal,
  PlanDayTemplateSlot,
} from '@/lib/plans/types';

function meal(id: string, name: string, mealType: PlanDayTemplateMeal['meal_type'] = 'lunch'): PlanDayTemplateMeal {
  return {
    source_planned_meal_id: id,
    name,
    meal_type: mealType,
    payload: {
      items: [{
        name,
        quantity: 1,
        unit: 'serving',
        food_object_id: `food-${id}`,
        component_id: `comp-${id}`,
        calories: 200,
        macros: { protein_g: 20, carbs_g: 10, fat_g: 5 },
      }],
      totals: { calories: 200, protein_g: 20, carbs_g: 10, fat_g: 5 },
    },
    protein_score_10: 6,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: {
      protein_score_10: 6,
      is_main_meal: true,
      meal_calories: 200,
      meal_protein_g: 20,
      psq_multiplier: 1,
    },
    nds_confidence: 'medium',
    source_template_id: null,
    source_imported_meal_id: null,
    nds_version: 'nds_daily_2026-01-26.v10',
    classifier_version: 'processing_classifier_2026-02-08.v2',
  };
}

function slot(args: {
  id: string;
  ordinal: number;
  block: PlanDayTemplateSlot['slot_block'];
  label: string;
  time: string;
  meals?: PlanDayTemplateMeal[];
}): PlanDayTemplateSlot {
  return {
    source_plan_slot_id: args.id,
    slot_ordinal: args.ordinal,
    slot_block: args.block,
    slot_label: args.label,
    target_time: args.time,
    meals: args.meals ?? [],
  };
}

const CURRENT_RHYTHM: PlanDayTemplateSlot[] = [
  slot({ id: 'rhythm-mini-am', ordinal: 1, block: 'morning', label: 'Mini Meal', time: '06:30' }),
  slot({ id: 'rhythm-breakfast', ordinal: 2, block: 'morning', label: 'Breakfast', time: '10:00' }),
  slot({ id: 'rhythm-lunch', ordinal: 3, block: 'midday', label: 'Lunch', time: '11:30' }),
  slot({ id: 'rhythm-mini-pm', ordinal: 4, block: 'midday', label: 'Mini Meal', time: '14:00' }),
  slot({ id: 'rhythm-dinner', ordinal: 5, block: 'evening', label: 'Dinner', time: '17:00' }),
];

const SAVED_TWO: PlanDayTemplateSlot[] = [
  slot({
    id: 'saved-mini-am',
    ordinal: 1,
    block: 'morning',
    label: 'Mini Meal',
    time: '06:30',
    meals: [meal('oats', 'Oats', 'snack')],
  }),
  slot({
    id: 'saved-lunch',
    ordinal: 2,
    block: 'midday',
    label: 'Lunch',
    time: '11:30',
    meals: [meal('salmon', 'Salmon', 'lunch')],
  }),
];

function templateOf(slots: PlanDayTemplateSlot[]): PlanDayTemplate {
  return {
    id: 'day-plan-qa',
    person_id: 'person-1',
    name: 'QA Day — Sep 10',
    description: null,
    scope: 'day',
    source_plan_id: '',
    source_plan_day_id: 'day-1',
    source_date_local: '',
    slots,
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '',
    updated_at: '',
  };
}

function byLabelTime(projected: ProjectedDayPlanSlot[], label: string, time: string) {
  return projected.find(
    (slot) => slot.slot_label === label && slot.target_time === time,
  );
}

describe('projectTemplateOntoRhythm', () => {
  it('renders all five current occasions with two saved meals in the correct slots', () => {
    const projected = projectTemplateOntoRhythm(SAVED_TWO, CURRENT_RHYTHM);
    expect(CURRENT_RHYTHM).toHaveLength(5);
    expect(SAVED_TWO.filter((slot) => slot.meals.length > 0)).toHaveLength(2);
    expect(projected).toHaveLength(5);

    const miniAm = byLabelTime(projected, 'Mini Meal', '06:30');
    const breakfast = byLabelTime(projected, 'Breakfast', '10:00');
    const lunch = byLabelTime(projected, 'Lunch', '11:30');
    const miniPm = byLabelTime(projected, 'Mini Meal', '14:00');
    const dinner = byLabelTime(projected, 'Dinner', '17:00');

    expect(miniAm?.meals.map((entry) => entry.name)).toEqual(['Oats']);
    expect(lunch?.meals.map((entry) => entry.name)).toEqual(['Salmon']);
    expect(breakfast?.meals).toEqual([]);
    expect(miniPm?.meals).toEqual([]);
    expect(dinner?.meals).toEqual([]);
    expect(breakfast?.scaffold_only).toBe(true);
    expect(miniPm?.scaffold_only).toBe(true);
    expect(dinner?.scaffold_only).toBe(true);
    expect(miniAm?.scaffold_only).toBe(false);
    expect(lunch?.scaffold_only).toBe(false);
  });

  it('does not mutate saved slots or dirty a plan merely by projecting', () => {
    const original = templateOf(structuredClone(SAVED_TWO));
    const before = dayPlanDraftSignature(original);
    const snapshot = structuredClone(original.slots);
    projectTemplateOntoRhythm(original.slots, CURRENT_RHYTHM);
    expect(original.slots).toEqual(snapshot);
    expect(dayPlanDraftSignature(original)).toBe(before);
    expect(original.slots).toHaveLength(2);
    expect(original.slots.every((slot) => CURRENT_RHYTHM.some((rhythm) => (
      rhythm.source_plan_slot_id === slot.source_plan_slot_id
    )))).toBe(false);
  });

  it('keeps empty rhythm slots out of persistence until content is added', () => {
    const projected = projectTemplateOntoRhythm(SAVED_TWO, CURRENT_RHYTHM);
    const scaffold = projected.filter((slot) => slot.scaffold_only);
    expect(scaffold).toHaveLength(3);
    const persistedIds = new Set(SAVED_TWO.map((slot) => slot.source_plan_slot_id));
    for (const slot of scaffold) {
      expect(slot.persisted_source_plan_slot_id).toBeNull();
      expect(persistedIds.has(slot.source_plan_slot_id)).toBe(false);
      expect(materializeRhythmSlot(SAVED_TWO, slot).some(
        (entry) => entry.source_plan_slot_id === slot.source_plan_slot_id,
      )).toBe(true);
    }
    expect(SAVED_TWO).toHaveLength(2);
  });

  it('materializes a scaffold-only slot into template.slots when content is added', () => {
    const projected = projectTemplateOntoRhythm(SAVED_TWO, CURRENT_RHYTHM);
    const breakfast = byLabelTime(projected, 'Breakfast', '10:00');
    expect(breakfast?.scaffold_only).toBe(true);
    const next = materializeRhythmSlot(SAVED_TWO, breakfast!);
    expect(next).toHaveLength(3);
    expect(next.map((slot) => slot.source_plan_slot_id)).toContain('rhythm-breakfast');
    const persistedBreakfast = next.find((slot) => slot.source_plan_slot_id === 'rhythm-breakfast');
    expect(persistedBreakfast).toMatchObject({
      slot_label: 'Breakfast',
      target_time: '10:00',
      slot_block: 'morning',
      slot_ordinal: 2,
      meals: [],
    });
    expect(SAVED_TWO).toHaveLength(2);
  });

  it('isolates repeated Mini Meal labels by exact time', () => {
    const projected = projectTemplateOntoRhythm(SAVED_TWO, CURRENT_RHYTHM);
    expect(byLabelTime(projected, 'Mini Meal', '06:30')?.meals[0]?.name).toBe('Oats');
    expect(byLabelTime(projected, 'Mini Meal', '14:00')?.meals).toEqual([]);
  });

  it('keeps unmatched saved populated slots visible instead of dropping them', () => {
    const saved = [
      ...SAVED_TWO,
      slot({
        id: 'saved-late',
        ordinal: 9,
        block: 'evening',
        label: 'Late Snack',
        time: '21:00',
        meals: [meal('yogurt', 'Yogurt', 'snack')],
      }),
    ];
    const projected = projectTemplateOntoRhythm(saved, CURRENT_RHYTHM);
    expect(projected).toHaveLength(6);
    const unmatched = projected.find((slot) => slot.origin === 'unmatched_saved');
    expect(unmatched).toMatchObject({
      slot_label: 'Late Snack',
      target_time: '21:00',
      persisted_source_plan_slot_id: 'saved-late',
      scaffold_only: false,
    });
    expect(unmatched?.meals.map((entry) => entry.name)).toEqual(['Yogurt']);
    expect(byLabelTime(projected, 'Dinner', '17:00')?.meals).toEqual([]);
  });

  it('does not remap a 06:30 Mini Meal onto a remaining 14:00 Mini Meal', () => {
    const rhythmWithoutEarlyMini = CURRENT_RHYTHM.filter((slot) => slot.source_plan_slot_id !== 'rhythm-mini-am');
    const projected = projectTemplateOntoRhythm(SAVED_TWO, rhythmWithoutEarlyMini);
    const fourteen = byLabelTime(projected, 'Mini Meal', '14:00');
    expect(fourteen?.meals).toEqual([]);
    expect(fourteen?.scaffold_only).toBe(true);
    const unmatched = projected.find((slot) => slot.origin === 'unmatched_saved');
    expect(unmatched?.target_time).toBe('06:30');
    expect(unmatched?.meals[0]?.name).toBe('Oats');
  });
});
