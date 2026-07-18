import type { FoodObject } from '@/lib/food/types';
import { recomputeMealNutrition } from '../recompute';
import type { MealComponent } from '../types';
import {
  applyGroundingToComponent,
  detachComponentGrounding,
  foodObjectToGrounding,
} from '../componentGrounding';

/**
 * Corrective fix (Phase 3 authenticated QA — defect plans-vs-log-nutrition-read):
 * Authenticated browser QA on the Plans "Build with ingredients" composer found
 * a resolved food match (food_object_id set, calories/macros populated) that
 * persisted into planned_meals.payload with 0/0/0/0 totals and needs_review
 * still true. Root cause: a freshly grounded component had no quantity/unit,
 * so the very next deterministic recompute pass (lib/meals/recompute.ts
 * deriveComponentScaleFactor -> missing_conversion_basis) downgraded it back
 * to needs_review with a null contribution — even though the match itself was
 * trusted. These tests pin the fix: grounding now defaults quantity/unit to
 * "1 serving" only when neither is already set, so a resolved match survives
 * the very next recompute pass with its contribution intact.
 */

function blankComponent(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'c1',
    name: '',
    quantity: null,
    unit: null,
    food_object_id: null,
    calories: null,
    macros: { protein_g: null, carbs_g: null, fat_g: null },
    nutrition_basis: 'per_component',
    match_status: 'none',
    source_kind: 'user_entered',
    needs_review: true,
    ...overrides,
  };
}

function food(overrides: Partial<FoodObject> = {}): FoodObject {
  return {
    id: 'food-rice',
    name: 'Rice',
    calories: 200,
    proteinG: 4,
    carbsG: 44,
    fatG: 0.5,
    servingSizeG: 150,
    ...overrides,
  } as unknown as FoodObject;
}

describe('applyGroundingToComponent — default quantity/unit on a fresh match', () => {
  it('defaults an unset quantity/unit to 1 serving so the match is immediately trusted', () => {
    const grounded = applyGroundingToComponent(blankComponent(), foodObjectToGrounding(food()));
    expect(grounded.quantity).toBe(1);
    expect(grounded.unit).toBe('serving');
    expect(grounded.needs_review).toBe(false);
    expect(grounded.calories).toBe(200);
  });

  it('the defaulted quantity/unit survive the very next recompute pass with a non-null contribution', () => {
    const grounded = applyGroundingToComponent(blankComponent(), foodObjectToGrounding(food()));
    const result = recomputeMealNutrition([grounded]);
    expect(result.needs_review).toBe(false);
    expect(result.components[0].status).toBe('recomputed');
    expect(result.components[0].nutrition?.calories).toBe(200);
    expect(result.totals.calories).toBe(200);
  });

  it('preserves an already-set quantity, only defaulting the missing unit', () => {
    const grounded = applyGroundingToComponent(
      blankComponent({ quantity: 3, unit: null }),
      foodObjectToGrounding(food()),
    );
    expect(grounded.quantity).toBe(3);
    expect(grounded.unit).toBe('serving');
    const result = recomputeMealNutrition([grounded]);
    expect(result.needs_review).toBe(false);
    expect(result.totals.calories).toBe(600);
  });

  it('preserves an already-set unit, only defaulting the missing quantity', () => {
    const grounded = applyGroundingToComponent(
      blankComponent({ quantity: null, unit: 'serving' }),
      foodObjectToGrounding(food()),
    );
    expect(grounded.quantity).toBe(1);
    expect(grounded.unit).toBe('serving');
  });

  it('never overwrites a fully user-entered quantity + unit', () => {
    const grounded = applyGroundingToComponent(
      blankComponent({ quantity: 2, unit: 'cup' }),
      foodObjectToGrounding(food({ measures: [{ unit: 'cup', grams: 240 }] } as never)),
    );
    expect(grounded.quantity).toBe(2);
    expect(grounded.unit).toBe('cup');
  });

  it('treats a non-positive existing quantity as unset and defaults it to 1', () => {
    const grounded = applyGroundingToComponent(
      blankComponent({ quantity: 0, unit: null }),
      foodObjectToGrounding(food()),
    );
    expect(grounded.quantity).toBe(1);
  });
});

describe('detachComponentGrounding — unaffected by the default-quantity fix', () => {
  it('still clears nutrition and flags for review regardless of quantity/unit', () => {
    const grounded = applyGroundingToComponent(blankComponent(), foodObjectToGrounding(food()));
    const detached = detachComponentGrounding(grounded);
    expect(detached.food_object_id).toBeNull();
    expect(detached.needs_review).toBe(true);
    expect(detached.calories).toBeNull();
    // Quantity/unit are display fields the user still owns — detaching
    // grounding never touches them.
    expect(detached.quantity).toBe(1);
    expect(detached.unit).toBe('serving');
  });
});
