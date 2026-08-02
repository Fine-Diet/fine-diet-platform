import type { PlanDayTemplateSlot, PlanSlot, PlannedMealType } from '../types';
import {
  normalizeSlotTime,
  matchReusableSlotToTarget,
  placeReusableSlot,
  UNRESOLVED_PLACEMENT_NOTE,
  DUPLICATE_CLAIM_PLACEMENT_NOTE,
} from '../reusableSlotMatching';

function targetSlot(overrides: Partial<PlanSlot> & Pick<PlanSlot, 'id' | 'slot_ordinal'>): PlanSlot {
  return {
    plan_day_id: 'day-1',
    person_id: 'person-1',
    slot_block: 'morning',
    slot_label: 'Breakfast',
    target_time: '10:00:00',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function sourceSlot(
  overrides: Partial<PlanDayTemplateSlot> &
    Pick<PlanDayTemplateSlot, 'source_plan_slot_id' | 'slot_ordinal'>,
): PlanDayTemplateSlot {
  return {
    slot_block: 'morning',
    slot_label: 'Breakfast',
    target_time: '10:00',
    meals: [
      {
        source_planned_meal_id: 'meal-1',
        name: 'Test meal',
        meal_type: 'breakfast',
        payload: { items: [{ name: 'Egg' }] },
        source_template_id: null,
        source_imported_meal_id: null,
        protein_score_10: null,
        is_main_meal: false,
        psq_multiplier: 1,
        meal_derived_data: {
          protein_score_10: null,
          is_main_meal: false,
          meal_calories: 0,
          meal_protein_g: 0,
          psq_multiplier: 1,
        },
        nds_confidence: 'medium',
        nds_version: '1',
        classifier_version: '1',
      },
    ],
    ...overrides,
  };
}

const aug2Targets: PlanSlot[] = [
  targetSlot({
    id: 't0',
    slot_ordinal: 0,
    slot_block: 'morning',
    slot_label: 'Breakfast',
    target_time: '10:00:00',
  }),
  targetSlot({
    id: 't1',
    slot_ordinal: 1,
    slot_block: 'midday',
    slot_label: 'Lunch',
    target_time: '14:00:00',
  }),
  targetSlot({
    id: 't2',
    slot_ordinal: 2,
    slot_block: 'midday',
    slot_label: 'Afternoon snack',
    target_time: '15:30:00',
  }),
  targetSlot({
    id: 't3',
    slot_ordinal: 3,
    slot_block: 'evening',
    slot_label: 'Dinner',
    target_time: '18:00:00',
  }),
];

describe('normalizeSlotTime', () => {
  it('treats HH:MM and HH:MM:SS as equivalent', () => {
    expect(normalizeSlotTime('10:00')).toBe('10:00');
    expect(normalizeSlotTime('10:00:00')).toBe('10:00');
    expect(normalizeSlotTime('9:05:00')).toBe('09:05');
  });
});

describe('matchReusableSlotToTarget Package 5B fidelity', () => {
  it('matches HH:MM source to HH:MM:SS target via semantic identity', () => {
    const match = matchReusableSlotToTarget(
      sourceSlot({
        source_plan_slot_id: 'src-breakfast',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '10:00',
      }),
      aug2Targets,
      { preferredMealType: 'breakfast' },
    );
    expect(match.reason).toBe('semantic');
    expect(match.slot?.id).toBe('t0');
  });

  it('does not shift breakfast/lunch/dinner when source is 1-based and target is 0-based', () => {
    const breakfast = matchReusableSlotToTarget(
      sourceSlot({
        source_plan_slot_id: 's1',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '10:00',
      }),
      aug2Targets,
      { preferredMealType: 'breakfast' },
    );
    const lunch = matchReusableSlotToTarget(
      sourceSlot({
        source_plan_slot_id: 's2',
        slot_ordinal: 2,
        slot_block: 'midday',
        slot_label: 'Lunch',
        target_time: '14:00',
        meals: [
          {
            ...sourceSlot({ source_plan_slot_id: 's2', slot_ordinal: 2 }).meals[0]!,
            meal_type: 'lunch' as PlannedMealType,
            name: 'Combined New Meal V1',
          },
        ],
      }),
      aug2Targets,
      { preferredMealType: 'lunch' },
    );
    const dinner = matchReusableSlotToTarget(
      sourceSlot({
        source_plan_slot_id: 's4',
        slot_ordinal: 4,
        slot_block: 'evening',
        slot_label: 'Dinner',
        target_time: '18:00',
        meals: [
          {
            ...sourceSlot({ source_plan_slot_id: 's4', slot_ordinal: 4 }).meals[0]!,
            meal_type: 'dinner' as PlannedMealType,
            name: 'Morning Smoothie',
          },
        ],
      }),
      aug2Targets,
      { preferredMealType: 'dinner' },
    );

    expect(breakfast.slot?.slot_label).toBe('Breakfast');
    expect(lunch.slot?.slot_label).toBe('Lunch');
    expect(dinner.slot?.slot_label).toBe('Dinner');
    expect(dinner.reason).toBe('semantic');
  });

  it('never ordinal-fallbacks breakfast into lunch', () => {
    const match = matchReusableSlotToTarget(
      {
        source_plan_slot_id: 's1',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        // Bad time still soft-matches Breakfast by block+label; must not use Lunch ord=1.
        target_time: '99:99',
      },
      aug2Targets,
      { preferredMealType: 'breakfast' },
    );
    expect(match.slot?.slot_label).toBe('Breakfast');
    expect(match.slot?.slot_ordinal).toBe(0);
    expect(match.reason).toBe('semantic');
  });

  it('never ordinal-fallbacks lunch into snack', () => {
    const match = matchReusableSlotToTarget(
      {
        source_plan_slot_id: 's2',
        slot_ordinal: 2,
        slot_block: 'midday',
        slot_label: 'Lunch',
        target_time: '99:99',
      },
      aug2Targets,
      { preferredMealType: 'lunch' },
    );
    // Soft semantic should still find Lunch by block+label despite bad time.
    expect(match.slot?.slot_label).toBe('Lunch');
    expect(match.reason).toBe('semantic');
  });

  it('resolves dinner to evening/dinner despite ordinal mismatch', () => {
    const match = matchReusableSlotToTarget(
      {
        source_plan_slot_id: 's4',
        slot_ordinal: 4,
        slot_block: 'evening',
        slot_label: 'Dinner',
        target_time: '18:00',
      },
      aug2Targets,
      { preferredMealType: 'dinner' },
    );
    expect(match.slot?.id).toBe('t3');
    expect(match.reason).toBe('semantic');
  });

  it('uses source_id only when the live slot remains semantically compatible', () => {
    const ok = matchReusableSlotToTarget(
      {
        source_plan_slot_id: 't0',
        slot_ordinal: 99,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '10:00',
      },
      aug2Targets,
    );
    expect(ok.reason).toBe('source_id');
    expect(ok.slot?.id).toBe('t0');

    const bad = matchReusableSlotToTarget(
      {
        source_plan_slot_id: 't1',
        slot_ordinal: 0,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '10:00',
      },
      aug2Targets,
      { preferredMealType: 'breakfast' },
    );
    expect(bad.reason).not.toBe('source_id');
    expect(bad.slot?.id).toBe('t0');
  });
});

describe('placeReusableSlot claimed targets', () => {
  it('prevents duplicate target-slot claims and keeps unresolved placement visible', () => {
    const claimed = new Set<string>();
    const first = placeReusableSlot(
      sourceSlot({
        source_plan_slot_id: 's1',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '10:00',
      }),
      aug2Targets,
      claimed,
    );
    expect(first.planSlotId).toBe('t0');
    expect(first.conflict).toBeNull();

    const second = placeReusableSlot(
      sourceSlot({
        source_plan_slot_id: 's1b',
        slot_ordinal: 9,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '10:00',
        meals: [
          {
            ...sourceSlot({ source_plan_slot_id: 's1b', slot_ordinal: 9 }).meals[0]!,
            name: 'Second breakfast',
          },
        ],
      }),
      aug2Targets,
      claimed,
    );
    expect(second.planSlotId).toBeNull();
    expect(second.match.reason).toBe('duplicate_claim');
    expect(second.conflict?.reason).toBe('duplicate_claim');
    expect(second.conflict?.detail).toBe(DUPLICATE_CLAIM_PLACEMENT_NOTE);
    expect(second.conflict?.meal_names).toContain('Second breakfast');
  });

  it('keeps unresolved source meals explicit rather than dropping them', () => {
    const claimed = new Set<string>();
    const placement = placeReusableSlot(
      sourceSlot({
        source_plan_slot_id: 'orphan',
        slot_ordinal: 50,
        slot_block: null,
        slot_label: 'Mystery slot',
        target_time: null,
        meals: [
          {
            ...sourceSlot({ source_plan_slot_id: 'orphan', slot_ordinal: 50 }).meals[0]!,
            name: 'Orphan meal',
            meal_type: 'other',
          },
        ],
      }),
      aug2Targets,
      claimed,
    );
    expect(placement.planSlotId).toBeNull();
    expect(placement.conflict?.reason).toBe('unresolved');
    expect(placement.conflict?.detail).toBe(UNRESOLVED_PLACEMENT_NOTE);
    expect(placement.conflict?.meal_names).toEqual(['Orphan meal']);
  });
});
