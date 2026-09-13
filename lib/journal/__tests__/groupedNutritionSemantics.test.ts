import { computeMealDerivedFromPayload } from '@/lib/nds/mealDerived';
import { payloadForMealDerived } from '../groupedNutritionSemantics';

describe('grouped journal NDS mutation semantics', () => {
  it('does not multiply already-consumed grouped totals by fractional servings again', () => {
    const normalized = payloadForMealDerived({
      name: 'Half Meal',
      quantity: 0.5,
      calories: 300,
      macros: { protein: 20 },
      meal_group: {},
    });
    expect(computeMealDerivedFromPayload(normalized).meal_calories).toBe(300);
    expect(computeMealDerivedFromPayload(normalized).meal_protein_g).toBe(20);
  });

  it('retains per-serving multiplication for flat Single Items', () => {
    const normalized = payloadForMealDerived({
      name: 'Apple',
      quantity: 2,
      calories: 95,
      macros: { protein: 1 },
    });
    expect(computeMealDerivedFromPayload(normalized).meal_calories).toBe(190);
    expect(computeMealDerivedFromPayload(normalized).meal_protein_g).toBe(2);
  });
});
