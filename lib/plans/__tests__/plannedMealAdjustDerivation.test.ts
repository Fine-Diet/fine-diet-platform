import { plannedMealToMealDocument } from '@/lib/meals/adapters';
import { foodObjectToGrounding, applyGroundingToComponent } from '@/lib/meals/componentGrounding';
import type { FoodObject } from '@/lib/food/types';
import type { MealComponent, MealDocument } from '@/lib/meals/types';
import type { PlannedMeal } from '../types';
import {
  deriveAdjustedConsumption,
  updateComponentQuantityAndUnit,
  updateComponentDisplayName,
  consumedNutritionToJournalMacros,
  formatConsumedNutritionPreview,
} from '../plannedMealAdjustDerivation';

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
      totals: { calories: 400, protein_g: 20, carbs_g: 50, fat_g: 10 },
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
          calories: 100,
          macros: { protein: 2, carbs: 10, fat: 1 },
        },
      ],
    },
    protein_score_10: 7,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: {},
    nds_confidence: 'high',
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

function sampleFood(): FoodObject {
  return {
    id: 'food-egg',
    canonicalName: 'Egg, large',
    brandName: null,
    aliases: [],
    sourceType: 'common',
    sourceProvider: null,
    sourceId: null,
    sourceDataset: null,
    upc: null,
    servingSizeG: 50,
    servingUnit: 'serving',
    servingDescription: '1 large',
    householdServingText: null,
    measures: [{ unit: 'serving', grams: 50, label: '1 large' }],
    calories: 70,
    proteinG: 6,
    carbsG: 0.5,
    fatG: 5,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    nutrientsExtended: {},
    nutrientProvenance: 'internal',
    nutrientConfidence: 'high',
    personId: null,
    isVerified: true,
    imageUrl: null,
    category: null,
    tags: [],
    createdAt: '',
    updatedAt: '',
  };
}

function baseDoc(): MealDocument {
  return plannedMealToMealDocument(samplePlanned());
}

describe('deriveAdjustedConsumption', () => {
  it('scales preview and payload calories consistently by consumed servings', () => {
    const doc = baseDoc();
    const atOne = deriveAdjustedConsumption({
      baseDocument: doc,
      title: doc.title,
      components: doc.components,
      consumedServings: 1,
    });
    const atTwo = deriveAdjustedConsumption({
      baseDocument: doc,
      title: doc.title,
      components: doc.components,
      consumedServings: 2,
    });

    expect(atOne.consumedNutrition?.calories).toBe(400);
    expect(atTwo.consumedNutrition?.calories).toBe(800);
    expect(atOne.intakePayload.calories).toBe(atOne.consumedNutrition?.calories);
    expect(atTwo.intakePayload.calories).toBe(atTwo.consumedNutrition?.calories);
    expect(atTwo.intakePayload.quantity).toBe(2);
  });

  it('recalculates per_component quantity edits proportionally', () => {
    const doc = baseDoc();
    const oats = doc.components[0]!;
    const doubled = updateComponentQuantityAndUnit(oats, 2, oats.unit);
    const result = deriveAdjustedConsumption({
      baseDocument: doc,
      title: doc.title,
      components: [doubled, doc.components[1]!],
      consumedServings: 1,
    });

    expect(result.consumedNutrition?.calories).toBe(700);
    expect(result.intakePayload.calories).toBe(700);
  });

  it('applies full grounding on food replacement and clears stale nutrition', () => {
    const doc = baseDoc();
    const oats = doc.components[0]!;
    const replaced = applyGroundingToComponent(
      { ...oats, name: 'Egg, large', quantity: 2, unit: 'serving', quantity_g: 120 },
      foodObjectToGrounding(sampleFood()),
    );
    const result = deriveAdjustedConsumption({
      baseDocument: doc,
      title: 'Eggs instead',
      components: [replaced],
      consumedServings: 1,
    });

    expect(replaced.food_object_id).toBe('food-egg');
    expect(replaced.calories).toBe(70);
    expect(replaced.quantity_g).toBeUndefined();
    expect(replaced.nutrition_basis).toBe('per_serving');
    expect(result.consumedNutrition?.calories).toBe(140);
    expect(result.intakePayload.calories).toBe(140);
    expect(consumedNutritionToJournalMacros(result.consumedNutrition).protein).toBe(12);
  });

  it('marks needs review when quantity changes without safe per_component scaling', () => {
    const component: MealComponent = {
      component_id: 'c1',
      name: 'Mystery food',
      quantity: 1,
      unit: 'cup',
      food_object_id: null,
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
      nutrition_basis: 'per_serving',
      match_status: 'none',
      source_kind: 'user_entered',
      needs_review: true,
    };
    const updated = updateComponentQuantityAndUnit(component, 2, 'cup');
    const result = deriveAdjustedConsumption({
      baseDocument: baseDoc(),
      title: 'Test',
      components: [updated],
      consumedServings: 1,
    });
    expect(result.needsReview).toBe(true);
    expect(result.consumedNutrition).toBeNull();
  });

  it('invalidates per_component nutrition on unit-only change', () => {
    const doc = baseDoc();
    const oats = doc.components[0]!;
    expect(oats.calories).toBe(300);

    const unitChanged = updateComponentQuantityAndUnit(oats, oats.quantity, 'tbsp');
    expect(unitChanged.unit).toBe('tbsp');
    expect(unitChanged.calories).toBeNull();
    expect(unitChanged.needs_review).toBe(true);
    expect(unitChanged.food_object_id).toBeNull();

    const result = deriveAdjustedConsumption({
      baseDocument: doc,
      title: doc.title,
      components: [unitChanged, doc.components[1]!],
      consumedServings: 1,
    });
    expect(result.needsReview).toBe(true);
    expect(result.consumedNutrition).toBeNull();
  });

  it('detaches grounding when a matched component name is freely edited', () => {
    const doc = baseDoc();
    const grounded = applyGroundingToComponent(
      { ...doc.components[0]!, name: 'Egg, large', quantity: 1, unit: 'serving' },
      foodObjectToGrounding(sampleFood()),
    );
    expect(grounded.food_object_id).toBe('food-egg');

    const renamed = updateComponentDisplayName(grounded, 'Scrambled eggs');
    expect(renamed.food_object_id).toBeNull();
    expect(renamed.calories).toBeNull();
    expect(renamed.needs_review).toBe(true);
    expect(renamed.name).toBe('Scrambled eggs');

    const result = deriveAdjustedConsumption({
      baseDocument: doc,
      title: 'Renamed meal',
      components: [renamed],
      consumedServings: 1,
    });
    expect(result.needsReview).toBe(true);
    expect(result.consumedNutrition).toBeNull();
  });
});

describe('formatConsumedNutritionPreview', () => {
  it('shows all available primary macros at 0.5, 1, and 2 servings', () => {
    const doc = baseDoc();
    for (const servings of [0.5, 1, 2]) {
      const result = deriveAdjustedConsumption({
        baseDocument: doc,
        title: doc.title,
        components: doc.components,
        consumedServings: servings,
      });
      const nutrition = result.consumedNutrition;
      expect(nutrition?.calories).not.toBeNull();
      const preview = formatConsumedNutritionPreview(nutrition, result.needsReview);
      expect(preview).toContain(`${Math.round(nutrition!.calories!)} cal`);
      expect(preview).toContain(`${Math.round(nutrition!.macros.protein_g!)}g protein`);
      expect(preview).toContain(`${Math.round(nutrition!.macros.carbs_g!)}g carbs`);
      expect(preview).toContain(`${Math.round(nutrition!.macros.fat_g!)}g fat`);
    }
  });
});
