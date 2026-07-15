import {
  buildAdjustedPlannedMealIntakePayload,
  buildExactPlannedMealIntakePayload,
  plannedMealAlreadyLogged,
} from '../plannedMealExecutionPayload';
import { plannedMealToMealDocument } from '@/lib/meals/adapters';
import type { PlannedMeal } from '../types';

function samplePlanned(): PlannedMeal {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: 'slot-1',
    person_id: 'person-1',
    name: 'Planned oats',
    meal_type: 'breakfast',
    payload: {
      totals: { calories: 420, protein_g: 18, carbs_g: 55, fat_g: 12 },
      items: [
        {
          name: 'Rolled oats',
          quantity: 1,
          unit: 'cup',
          calories: 300,
          macros: { protein: 10, carbs: 40, fat: 6 },
        },
        {
          name: 'Berries',
          quantity: 0.5,
          unit: 'cup',
          calories: 120,
          macros: { protein: 2, carbs: 15, fat: 1 },
        },
      ],
    },
    protein_score_10: 7,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: {},
    nds_confidence: 'high',
    source_template_id: 'tmpl-1',
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

describe('buildExactPlannedMealIntakePayload', () => {
  it('does not mutate the planned meal source', () => {
    const planned = samplePlanned();
    const before = JSON.stringify(planned.payload);
    buildExactPlannedMealIntakePayload(planned);
    expect(JSON.stringify(planned.payload)).toBe(before);
  });

  it('preserves grouped components and marks logged_as_planned true', () => {
    const payload = buildExactPlannedMealIntakePayload(samplePlanned());
    expect(payload.logged_as_planned).toBe(true);
    expect(payload.source_planned_meal_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(payload.meal_group?.components.length).toBe(2);
    expect(payload.meal_group?.logged_as_planned).toBe(true);
    expect(payload.meal_group?.source_template_id).toBe('tmpl-1');
  });
});

describe('buildAdjustedPlannedMealIntakePayload', () => {
  it('marks adjusted logs and preserves provenance pointers', () => {
    const doc = plannedMealToMealDocument(samplePlanned());
    doc.title = 'Actually ate eggs';
    const payload = buildAdjustedPlannedMealIntakePayload(doc, {
      consumed_servings: 1.5,
      instance_note: 'Half portion',
    });
    expect(payload.logged_as_planned).toBe(false);
    expect(payload.name).toBe('Actually ate eggs');
    expect(payload.meal_group?.logged_as_planned).toBe(false);
    expect(payload.meal_group?.detached_from_source).toBe(true);
    expect(payload.meal_group?.source_planned_meal_id).toBe(
      '11111111-1111-1111-1111-111111111111',
    );
    expect(payload.meal_group?.instance_notes).toBe('Half portion');
  });
});

describe('plannedMealAlreadyLogged', () => {
  it('detects eaten meals with journal links', () => {
    expect(
      plannedMealAlreadyLogged({
        ...samplePlanned(),
        execution_state: 'eaten',
        journal_entry_id: 'entry-1',
      }),
    ).toBe(true);
  });

  it('returns false for pending meals', () => {
    expect(plannedMealAlreadyLogged(samplePlanned())).toBe(false);
  });
});
