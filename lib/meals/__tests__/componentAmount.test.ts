import {
  convertMealComponentDisplayUnit,
  getMealComponentValidUnits,
  recoverGroundedPerServingNutrition,
} from '../componentAmount';
import { recomputeMealNutrition } from '../recompute';
import type { MealComponent } from '../types';
import { updateComponentQuantityUnit } from '../composer/componentOps';

function component(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'beans',
    component_kind: 'food_concept',
    name: 'Beans',
    quantity: 100,
    unit: 'g',
    quantity_g: 100,
    food_object_id: 'food-beans',
    serving_size_g: 100,
    measures: [{ unit: 'cup', grams: 200 }],
    calories: 100,
    macros: { protein_g: 10, carbs_g: 20, fat_g: 2 },
    nutrition_basis: 'per_component',
    match_status: 'matched',
    source_kind: 'food_object',
    needs_review: false,
    ...overrides,
  };
}

describe('Packet 15B grounded component amount semantics', () => {
  it('offers only canonical serving, gram, and household units', () => {
    expect(getMealComponentValidUnits(component())).toEqual([
      'g',
      'serving',
      'cup',
    ]);
  });

  it('converts 100 g to one serving without changing physical grams', () => {
    expect(convertMealComponentDisplayUnit(component(), 'serving')).toEqual({
      quantity: 1,
      unit: 'serving',
      quantityG: 100,
    });
  });

  it('round-trips serving, grams, and a household measure without drift', () => {
    const source = recoverGroundedPerServingNutrition(component());
    const serving = convertMealComponentDisplayUnit(source, 'serving')!;
    const asServing = {
      ...source,
      quantity: serving.quantity,
      unit: serving.unit,
      quantity_g: serving.quantityG,
    };
    const cup = convertMealComponentDisplayUnit(asServing, 'cup')!;
    const asCup = {
      ...asServing,
      quantity: cup.quantity,
      unit: cup.unit,
      quantity_g: cup.quantityG,
    };
    const grams = convertMealComponentDisplayUnit(asCup, 'g')!;
    expect(cup.quantity).toBe(0.5);
    expect(grams.quantity).toBe(100);
    expect(grams.quantityG).toBe(100);
  });

  it('recovers a stable per-serving basis from a safe absolute snapshot', () => {
    const recovered = recoverGroundedPerServingNutrition(
      component({ quantity: 200, quantity_g: 200, calories: 200 }),
    );
    expect(recovered.nutrition_basis).toBe('per_serving');
    expect(recovered.calories).toBe(100);
    expect(recovered.quantity).toBe(200);
    expect(recovered.quantity_g).toBe(200);
  });

  it('updates aggregate nutrition when physical amount changes', () => {
    const recovered = recoverGroundedPerServingNutrition(component());
    const [doubled] = updateComponentQuantityUnit(
      [recovered],
      recovered.component_id,
      200,
      'g',
    );
    const recomputed = recomputeMealNutrition([doubled]);
    expect(doubled.quantity_g).toBe(200);
    expect(recomputed.needs_review).toBe(false);
    expect(recomputed.totals.calories).toBe(200);
    expect(recomputed.totals.macros.protein_g).toBe(20);
  });

  it('keeps equivalent unit conversion nutrition unchanged', () => {
    const recovered = recoverGroundedPerServingNutrition(component());
    const converted = convertMealComponentDisplayUnit(recovered, 'serving')!;
    const [asServing] = updateComponentQuantityUnit(
      [recovered],
      recovered.component_id,
      converted.quantity,
      converted.unit,
    );
    expect(recomputeMealNutrition([asServing]).totals.calories).toBe(100);
  });

  it('marks an unrecoverable absolute snapshot for review and never invents nutrition', () => {
    const unsafe = component({
      unit: 'scoop',
      serving_size_g: null,
      measures: undefined,
      quantity_g: null,
    });
    const recovered = recoverGroundedPerServingNutrition(unsafe);
    expect(recovered.nutrition_basis).toBe('per_component');
    expect(recovered.needs_review).toBe(true);
    expect(convertMealComponentDisplayUnit(recovered, 'serving')).toBeNull();

    const [changed] = updateComponentQuantityUnit(
      [recovered],
      recovered.component_id,
      2,
      'scoop',
    );
    expect(changed.needs_review).toBe(true);
    expect(changed.calories).toBeNull();
    expect(changed.macros).toEqual({
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    });
  });

  it('leaves recipe-reference conversion behavior outside food-unit handling', () => {
    const recipe = component({
      component_kind: 'recipe_document',
      recipe_meal_document_id: 'recipe-1',
      food_object_id: null,
      nutrition_basis: 'per_serving',
    });
    expect(getMealComponentValidUnits(recipe)).toEqual(['g']);
    expect(convertMealComponentDisplayUnit(recipe, 'serving')).toBeNull();
    const [changed] = updateComponentQuantityUnit(
      [recipe],
      recipe.component_id,
      2,
      'slice',
    );
    expect(changed.quantity).toBe(2);
    expect(changed.unit).toBe('slice');
    expect(changed.recipe_meal_document_id).toBe('recipe-1');
  });
});
