import {
  canonicalMealForStructuralSlot,
  canonicalMealsByStructuralSlot,
} from '../canonicalSlotMeals';
import type { PlannedMeal } from '../types';

function meal(args: {
  id: string;
  slotId: string | null;
  updatedAt: string;
}): PlannedMeal {
  return {
    id: args.id,
    person_id: 'person-1',
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: args.slotId,
    name: args.id,
    meal_type: 'other',
    payload: { items: [], totals: { calories: 100 } },
    protein_score_10: null,
    is_main_meal: false,
    psq_multiplier: 1,
    meal_derived_data: {},
    nds_confidence: 'low',
    source_template_id: null,
    source_imported_meal_id: null,
    reusable_provenance: null,
    execution_state: 'pending',
    journal_entry_id: null,
    nds_version: '1',
    classifier_version: '1',
    created_at: args.updatedAt,
    updated_at: args.updatedAt,
  };
}

describe('canonical structural slot meals', () => {
  it('chooses the newest persisted sibling deterministically', () => {
    const older = meal({
      id: 'older',
      slotId: 'slot-1',
      updatedAt: '2026-09-09T01:00:00.000Z',
    });
    const newer = meal({
      id: 'newer',
      slotId: 'slot-1',
      updatedAt: '2026-09-09T02:00:00.000Z',
    });

    expect(canonicalMealForStructuralSlot([older, newer])).toBe(newer);
    expect(canonicalMealsByStructuralSlot([older, newer])).toEqual([newer]);
  });

  it('does not collapse meals whose structural ownership is unavailable', () => {
    const first = meal({
      id: 'legacy-a',
      slotId: null,
      updatedAt: '2026-09-09T01:00:00.000Z',
    });
    const second = meal({
      id: 'legacy-b',
      slotId: null,
      updatedAt: '2026-09-09T02:00:00.000Z',
    });

    expect(canonicalMealsByStructuralSlot([first, second])).toEqual([first, second]);
  });

  it('keeps different structural slots as separate planned occasions', () => {
    const breakfast = meal({
      id: 'breakfast',
      slotId: 'slot-1',
      updatedAt: '2026-09-09T01:00:00.000Z',
    });
    const lunch = meal({
      id: 'lunch',
      slotId: 'slot-2',
      updatedAt: '2026-09-09T02:00:00.000Z',
    });

    expect(canonicalMealsByStructuralSlot([breakfast, lunch])).toEqual([
      breakfast,
      lunch,
    ]);
  });
});
