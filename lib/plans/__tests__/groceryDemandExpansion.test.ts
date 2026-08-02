process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import {
  NESTED_RECIPE_BOUNDARY_NOTE,
  RECIPE_SCALING_UNSAFE_NOTE,
  expandMealComposition,
  scaleRecipeIngredientQuantity,
} from '@/lib/meals/componentExpansion';
import {
  MEAL_SCHEMA_VERSION,
  type MealComponent,
  type MealDocument,
} from '@/lib/meals/types';
import {
  expandPlannedMealToDemandCandidates,
  flattenCompositionDemandLeaves,
} from '../groceryDemandExpansion';
import { deriveItemsFromMeals } from '../groceryServerService';
import type { PlannedMeal } from '../types';

function foodComponent(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'food-1',
    component_kind: 'food_concept',
    name: 'Chicken sausage',
    quantity: 1,
    unit: 'link',
    food_object_id: 'food-sausage',
    calories: 140,
    macros: { protein_g: 12, carbs_g: 2, fat_g: 9 },
    nutrition_basis: 'per_component',
    match_status: 'matched',
    source_kind: 'food_object',
    needs_review: false,
    ...overrides,
  };
}

function smoothieRecipe(overrides: Partial<MealDocument> = {}): MealDocument {
  return {
    schema_version: MEAL_SCHEMA_VERSION,
    document_version: 3,
    id: 'recipe-smoothie',
    person_id: 'person-1',
    kind: 'recipe',
    review_state: 'confirmed',
    title: 'Morning Smoothie',
    description: null,
    intents: ['breakfast'],
    meal_type_hint: 'breakfast',
    components: [
      foodComponent({
        component_id: 'ing-banana',
        name: 'Banana',
        quantity: 1,
        unit: 'each',
        food_object_id: 'food-banana',
        calories: 90,
        macros: { protein_g: 1, carbs_g: 23, fat_g: 0 },
      }),
      foodComponent({
        component_id: 'ing-yogurt',
        name: 'Greek yogurt',
        quantity: 1,
        unit: 'cup',
        food_object_id: 'food-yogurt',
        calories: 130,
        macros: { protein_g: 20, carbs_g: 8, fat_g: 0 },
      }),
    ],
    yield: { servings: 2, confirmed: true },
    recipe_yield_servings: 2,
    serving_label: 'serving',
    prep_notes: null,
    per_serving: null,
    totals: null,
    nutrition_status: 'calculated',
    source: { source_type: 'manual' },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

function plannedMeal(overrides: Partial<PlannedMeal> & { payload: Record<string, unknown> }): PlannedMeal {
  return {
    id: 'meal-1',
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: 'slot-1',
    person_id: 'person-1',
    name: 'Chicken Sausage + English Muffin + Smoothie Breakfast',
    meal_type: 'breakfast',
    source_template_id: null,
    source_imported_meal_id: null,
    reusable_provenance: null,
    execution_state: 'pending',
    journal_entry_id: null,
    protein_score_10: null,
    is_main_meal: false,
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

const canonicalBreakfastPayload = {
  items: [
    {
      name: 'Chicken sausage',
      quantity: 1,
      unit: 'link',
      food_object_id: 'food-sausage',
      component_id: 'comp-sausage',
      component_kind: 'food_concept',
    },
    {
      name: 'English muffin',
      quantity: 1,
      unit: 'each',
      food_object_id: 'food-muffin',
      component_id: 'comp-muffin',
      component_kind: 'food_concept',
    },
    {
      name: 'Morning Smoothie',
      quantity: 1,
      unit: 'serving',
      food_object_id: null,
      component_id: 'comp-smoothie',
      component_kind: 'recipe_document',
      recipe_meal_document_id: 'recipe-smoothie',
      recipe_version_token: 'v3',
      display_snapshot: { title: 'Morning Smoothie', yield_servings: 2 },
    },
  ],
  typed_components: [
    foodComponent({ component_id: 'comp-sausage' }),
    foodComponent({
      component_id: 'comp-muffin',
      name: 'English muffin',
      quantity: 1,
      unit: 'each',
      food_object_id: 'food-muffin',
    }),
    {
      component_id: 'comp-smoothie',
      component_kind: 'recipe_document' as const,
      name: 'Morning Smoothie',
      quantity: 1,
      unit: 'serving',
      food_object_id: null,
      recipe_meal_document_id: 'recipe-smoothie',
      recipe_version_token: 'v3',
      display_snapshot: { title: 'Morning Smoothie', yield_servings: 2 },
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
      nutrition_basis: 'per_component' as const,
      match_status: 'matched' as const,
      source_kind: 'food_object' as const,
      needs_review: false,
    },
  ],
};

describe('Package 5B grocery demand expansion', () => {
  it('keeps direct-only legacy items[] behavior unchanged', () => {
    const meal = plannedMeal({
      payload: {
        items: [
          { name: 'Spinach', quantity: 2, unit: 'cup', food_object_id: 'food-1' },
        ],
      },
    });
    const derived = deriveItemsFromMeals([meal]);
    expect(derived).toHaveLength(1);
    expect(derived[0]).toMatchObject({
      name: 'Spinach',
      quantity: 2,
      unit: 'cup',
      food_object_id: 'food-1',
      source_planned_meal_ids: ['meal-1'],
    });
  });

  it('expands mixed direct + recipe-reference demand for the canonical breakfast', () => {
    const meal = plannedMeal({ payload: canonicalBreakfastPayload });
    const derived = deriveItemsFromMeals([meal], [], {
      resolveRecipe: () => smoothieRecipe(),
    });
    const byFood = Object.fromEntries(
      derived.filter((d) => d.food_object_id).map((d) => [d.food_object_id!, d]),
    );
    expect(byFood['food-sausage']?.quantity).toBe(1);
    expect(byFood['food-muffin']?.quantity).toBe(1);
    // yield 2, portion 1 → half batch
    expect(byFood['food-banana']?.quantity).toBe(0.5);
    expect(byFood['food-yogurt']?.quantity).toBe(0.5);
    expect(derived.find((d) => d.name === 'Morning Smoothie')).toBeUndefined();
    expect(byFood['food-banana']?.notes).toMatch(/Morning Smoothie/);
    expect(byFood['food-banana']?.source_detail_json?.expansion_contributors).toBeTruthy();
  });

  it('scales recipe ingredient demand by portion / yield', () => {
    expect(
      scaleRecipeIngredientQuantity(1, 2, {
        yield: { servings: 2, confirmed: true },
        recipe_yield_servings: 2,
      }),
    ).toEqual({ quantity: 1, note: null });

    const meal = plannedMeal({
      payload: {
        ...canonicalBreakfastPayload,
        typed_components: canonicalBreakfastPayload.typed_components.map((c) =>
          c.component_id === 'comp-smoothie' ? { ...c, quantity: 2 } : c,
        ),
      },
    });
    const derived = deriveItemsFromMeals([meal], [], {
      resolveRecipe: () => smoothieRecipe(),
    });
    expect(derived.find((d) => d.food_object_id === 'food-banana')?.quantity).toBe(1);
    expect(derived.find((d) => d.food_object_id === 'food-yogurt')?.quantity).toBe(1);
  });

  it('soft-fails unsafe yield/portion scaling with null quantity + note', () => {
    const unsafe = scaleRecipeIngredientQuantity(1, 1, {
      yield: { servings: null, confirmed: false },
      recipe_yield_servings: null,
    });
    expect(unsafe.quantity).toBeNull();
    expect(unsafe.note).toBe(RECIPE_SCALING_UNSAFE_NOTE);

    const meal = plannedMeal({ payload: canonicalBreakfastPayload });
    const derived = deriveItemsFromMeals([meal], [], {
      resolveRecipe: () =>
        smoothieRecipe({
          yield: { servings: null, confirmed: false },
          recipe_yield_servings: null,
        }),
    });
    const banana = derived.find((d) => d.food_object_id === 'food-banana');
    expect(banana?.quantity).toBeNull();
    expect(banana?.notes).toContain(RECIPE_SCALING_UNSAFE_NOTE);
  });

  it('aggregates compatible demands and preserves all contributors', () => {
    const mealA = plannedMeal({
      id: 'meal-a',
      name: 'Breakfast A',
      payload: canonicalBreakfastPayload,
    });
    const mealB = plannedMeal({
      id: 'meal-b',
      name: 'Breakfast B',
      payload: canonicalBreakfastPayload,
    });
    const derived = deriveItemsFromMeals([mealA, mealB], [], {
      resolveRecipe: () => smoothieRecipe(),
    });
    const banana = derived.find((d) => d.food_object_id === 'food-banana');
    expect(banana?.quantity).toBe(1);
    expect(banana?.source_planned_meal_ids).toEqual(['meal-a', 'meal-b']);
    expect(banana?.contributors).toHaveLength(2);
  });

  it('does not merge same-name rows with different food identities', () => {
    const meal = plannedMeal({
      payload: {
        items: [
          { name: 'Spinach', quantity: 1, unit: 'cup', food_object_id: 'food-a' },
          { name: 'Spinach', quantity: 1, unit: 'cup', food_object_id: 'food-b' },
        ],
      },
    });
    const derived = deriveItemsFromMeals([meal]);
    expect(derived).toHaveLength(2);
  });

  it('does not merge incompatible units', () => {
    const meal = plannedMeal({
      payload: {
        items: [
          { name: 'Spinach', quantity: 1, unit: 'cup', food_object_id: 'food-1' },
          { name: 'Spinach', quantity: 100, unit: 'g', food_object_id: 'food-1' },
        ],
      },
    });
    const derived = deriveItemsFromMeals([meal]);
    expect(derived).toHaveLength(2);
  });

  it('reads archived referenced recipes when the loader returns them', () => {
    const meal = plannedMeal({ payload: canonicalBreakfastPayload });
    const derived = deriveItemsFromMeals([meal], [], {
      resolveRecipe: () =>
        smoothieRecipe({
          lifecycle_state: 'archived',
          archived_at: '2026-07-01T00:00:00.000Z',
        }),
    });
    expect(derived.find((d) => d.food_object_id === 'food-banana')).toBeTruthy();
  });

  it('falls back to legacy items[] when typed_components is absent', () => {
    const meal = plannedMeal({
      payload: {
        items: [
          { name: 'Oats', quantity: 50, unit: 'g', food_object_id: 'food-oats' },
        ],
      },
    });
    const candidates = expandPlannedMealToDemandCandidates(meal);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.food_object_id).toBe('food-oats');
  });

  it('keeps nested recipe expansion at a cycle-safe one-level boundary', () => {
    const nestedSauce: MealDocument = {
      ...smoothieRecipe({
        id: 'recipe-sauce',
        title: 'Base Sauce',
        components: [
          foodComponent({
            component_id: 'ing-tomato',
            name: 'Tomato',
            food_object_id: 'food-tomato',
          }),
        ],
      }),
    };
    const parentRecipe = smoothieRecipe({
      id: 'recipe-parent',
      title: 'Parent Bowl',
      components: [
        foodComponent({
          component_id: 'ing-rice',
          name: 'Rice',
          quantity: 1,
          unit: 'cup',
          food_object_id: 'food-rice',
        }),
        {
          component_id: 'ing-sauce',
          component_kind: 'recipe_document',
          name: 'Base Sauce',
          quantity: 1,
          unit: 'serving',
          food_object_id: null,
          recipe_meal_document_id: 'recipe-sauce',
          recipe_version_token: 'v1',
          calories: null,
          macros: { protein_g: null, carbs_g: null, fat_g: null },
          nutrition_basis: 'per_component',
          match_status: 'matched',
          source_kind: 'food_object',
          needs_review: false,
        },
      ],
      yield: { servings: 1, confirmed: true },
      recipe_yield_servings: 1,
    });

    const meal = plannedMeal({
      payload: {
        typed_components: [
          {
            component_id: 'comp-bowl',
            component_kind: 'recipe_document',
            name: 'Parent Bowl',
            quantity: 1,
            unit: 'serving',
            food_object_id: null,
            recipe_meal_document_id: 'recipe-parent',
            recipe_version_token: 'v1',
            calories: null,
            macros: { protein_g: null, carbs_g: null, fat_g: null },
            nutrition_basis: 'per_component',
            match_status: 'matched',
            source_kind: 'food_object',
            needs_review: false,
          },
        ],
        items: [],
      },
    });

    const recipes: Record<string, MealDocument> = {
      'recipe-parent': parentRecipe,
      'recipe-sauce': nestedSauce,
    };
    const tree = expandMealComposition(
      {
        schema_version: MEAL_SCHEMA_VERSION,
        id: 'meal-1',
        kind: 'meal',
        review_state: 'confirmed',
        title: meal.name,
        description: null,
        intents: [],
        meal_type_hint: 'breakfast',
        components: meal.payload.typed_components as MealComponent[],
        yield: null,
        recipe_yield_servings: null,
        serving_label: null,
        prep_notes: null,
        per_serving: null,
        totals: null,
        source: { source_type: 'planned_meal' },
        nds: null,
        nds_version: null,
        classifier_version: null,
        created_at: null,
        updated_at: null,
      },
      { resolveRecipe: (id) => recipes[id] },
    );
    const nested = tree.children?.[0]?.children?.find((c) => c.name === 'Base Sauce');
    expect(nested?.kind).toBe('recipe_portion');
    expect(nested?.notes).toContain(NESTED_RECIPE_BOUNDARY_NOTE);
    expect(nested?.children).toBeUndefined();

    const leaves = flattenCompositionDemandLeaves(tree, {
      planned_meal_id: 'meal-1',
      meal_name: meal.name,
    });
    expect(leaves.find((l) => l.food_object_id === 'food-rice')).toBeTruthy();
    expect(leaves.find((l) => l.food_object_id === 'food-tomato')).toBeUndefined();
    expect(leaves.find((l) => l.name === 'Base Sauce')?.notes).toContain(
      NESTED_RECIPE_BOUNDARY_NOTE,
    );
  });

  it('preserves recipe provenance on expansion edges', () => {
    const meal = plannedMeal({ payload: canonicalBreakfastPayload });
    const candidates = expandPlannedMealToDemandCandidates(meal, () => smoothieRecipe());
    const banana = candidates.find((c) => c.food_object_id === 'food-banana');
    expect(banana?.contributor.provenance).toMatchObject({
      plan_id: 'plan-1',
      planned_meal_id: 'meal-1',
      meal_component_id: 'comp-smoothie',
      recipe_meal_document_id: 'recipe-smoothie',
      recipe_component_id: 'ing-banana',
      food_object_id: 'food-banana',
    });
  });
});
