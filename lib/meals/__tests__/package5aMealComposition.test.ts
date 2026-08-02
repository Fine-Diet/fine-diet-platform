/**
 * Package 5A — Canonical Food Graph / Meal Composition regression coverage.
 */

import { mealDocumentToPlannedMealPayload, plannedMealToMealDocument } from '../adapters';
import { expandMealComposition } from '../componentExpansion';
import { addComponentFromRecipe, addComponentFromSelection, blankComponent } from '../composer/componentOps';
import { composerReducer, createComposerState } from '../composer/state';
import {
  inferMealComponentKind,
  normalizeMealComponentContract,
  normalizeMealDocumentComponentContract,
} from '../normalizeMealComponentContract';
import {
  assertNoRecipeCycle,
  buildRecipeReferenceComponent,
  RecipeAttachError,
  resolveMealDocumentVersionToken,
} from '../recipeComponent';
import { recomputeMealNutrition } from '../recompute';
import { validateMealDocumentForStorage } from '../storage';
import { MealDocumentSchema } from '../validators';
import {
  DEFAULT_MEAL_DOCUMENT_VERSION,
  MEAL_SCHEMA_VERSION,
  type MealComponent,
  type MealDocument,
} from '../types';

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

function recipeDoc(overrides: Partial<MealDocument> = {}): MealDocument {
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
        component_id: 'ing-1',
        name: 'Banana',
        food_object_id: 'food-banana',
        calories: 90,
        macros: { protein_g: 1, carbs_g: 23, fat_g: 0 },
      }),
    ],
    yield: { servings: 1, confirmed: true },
    recipe_yield_servings: 1,
    serving_label: 'serving',
    prep_notes: null,
    per_serving: {
      calories: 220,
      macros: { protein_g: 20, carbs_g: 30, fat_g: 4 },
    },
    totals: {
      calories: 220,
      macros: { protein_g: 20, carbs_g: 30, fat_g: 4 },
    },
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

function mealDoc(components: MealComponent[]): MealDocument {
  return {
    schema_version: MEAL_SCHEMA_VERSION,
    document_version: DEFAULT_MEAL_DOCUMENT_VERSION,
    id: 'meal-breakfast',
    person_id: 'person-1',
    kind: 'meal',
    review_state: 'confirmed',
    title: 'Chicken Sausage + English Muffin + Smoothie Breakfast',
    description: null,
    intents: ['breakfast'],
    meal_type_hint: 'breakfast',
    components,
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: null,
    totals: null,
    source: { source_type: 'manual' },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

describe('Package 5A component kind normalization', () => {
  it('infers food_concept from food_object_id and never invents recipe refs from names', () => {
    expect(inferMealComponentKind({ food_object_id: 'x' })).toBe('food_concept');
    expect(inferMealComponentKind({ name: 'Morning Smoothie' } as never)).toBe('user_entered');
    expect(
      inferMealComponentKind({ recipe_meal_document_id: 'recipe-1', name: 'anything' }),
    ).toBe('recipe_document');
  });

  it('hydrates legacy components without data loss and preserves unknown fields', () => {
    const legacy = {
      component_id: 'legacy-1',
      name: 'English muffin',
      quantity: 1,
      unit: 'item',
      food_object_id: 'food-muffin',
      calories: 120,
      macros: { protein_g: 4, carbs_g: 22, fat_g: 1 },
      nutrition_basis: 'per_component',
      match_status: 'matched',
      source_kind: 'unmatched',
      needs_review: false,
      future_client_field: 'keep-me',
    };
    const normalized = normalizeMealComponentContract(legacy) as MealComponent & {
      future_client_field?: string;
    };
    expect(normalized.component_kind).toBe('food_concept');
    expect(normalized.source_kind).toBe('user_entered');
    expect(normalized.quantity).toBe(1);
    expect(normalized.food_object_id).toBe('food-muffin');
    expect(normalized.future_client_field).toBe('keep-me');
  });
});

describe('Package 5A recipe reference components', () => {
  it('builds a durable recipe component with version + snapshots', () => {
    const component = buildRecipeReferenceComponent({
      componentId: 'comp-smoothie',
      recipe: recipeDoc(),
      quantity: 1,
    });
    expect(component.component_kind).toBe('recipe_document');
    expect(component.recipe_meal_document_id).toBe('recipe-smoothie');
    expect(component.recipe_version_token).toBe('v3');
    expect(component.display_snapshot?.title).toBe('Morning Smoothie');
    expect(component.nutrition_snapshot?.status).toBe('available');
    expect(component.calories).toBe(220);
  });

  it('keeps meal snapshot stable when the referenced recipe later changes', () => {
    const attached = buildRecipeReferenceComponent({
      componentId: 'comp-smoothie',
      recipe: recipeDoc(),
      quantity: 1,
    });
    const laterRecipe = recipeDoc({
      document_version: 4,
      title: 'Morning Smoothie (Protein Boost)',
      per_serving: {
        calories: 999,
        macros: { protein_g: 40, carbs_g: 10, fat_g: 8 },
      },
    });
    expect(attached.display_snapshot?.title).toBe('Morning Smoothie');
    expect(attached.calories).toBe(220);
    expect(resolveMealDocumentVersionToken(laterRecipe)).toBe('v4');
    expect(attached.recipe_version_token).toBe('v3');
  });

  it('rejects archived and circular recipe attaches', () => {
    expect(() =>
      buildRecipeReferenceComponent({
        componentId: 'x',
        recipe: recipeDoc({ lifecycle_state: 'archived', archived_at: '2026-08-01T00:00:00.000Z' }),
      }),
    ).toThrow(RecipeAttachError);

    expect(() =>
      assertNoRecipeCycle(
        'meal-host',
        recipeDoc({
          components: [
            {
              ...foodComponent(),
              component_kind: 'recipe_document',
              recipe_meal_document_id: 'meal-host',
              recipe_version_token: 'v1',
            },
          ],
        }),
      ),
    ).toThrow(RecipeAttachError);
  });

  it('supports mixed direct food + recipe components with stable component_id identity', () => {
    const muffin = foodComponent({
      component_id: 'comp-muffin',
      name: 'English muffin',
      food_object_id: 'food-muffin',
      calories: 120,
      macros: { protein_g: 4, carbs_g: 22, fat_g: 1 },
    });
    const sausage = foodComponent({ component_id: 'comp-sausage' });
    const withRecipe = addComponentFromRecipe(
      [sausage, muffin],
      'comp-smoothie',
      { recipe: recipeDoc(), quantity: 1 },
    );
    expect(withRecipe.map((c) => c.component_id)).toEqual([
      'comp-sausage',
      'comp-muffin',
      'comp-smoothie',
    ]);
    expect(withRecipe[2]?.component_kind).toBe('recipe_document');

    const reordered = [withRecipe[2]!, withRecipe[0]!, withRecipe[1]!];
    expect(reordered.find((c) => c.component_id === 'comp-smoothie')?.recipe_version_token).toBe(
      'v3',
    );
  });
});

describe('Package 5A persist + planning adapters', () => {
  it('validates mixed meals and preserves unknown passthrough fields', () => {
    const components = addComponentFromRecipe(
      [
        foodComponent({ component_id: 'comp-sausage' }),
        foodComponent({
          component_id: 'comp-muffin',
          name: 'English muffin',
          food_object_id: 'food-muffin',
        }),
      ],
      'comp-smoothie',
      { recipe: recipeDoc(), quantity: 1 },
    );
    const doc = mealDoc(components);
    const parsed = MealDocumentSchema.safeParse({
      ...doc,
      client_extension: { native_hint: true },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as { client_extension?: { native_hint?: boolean } }).client_extension)
        .toEqual({ native_hint: true });
    }

    const stored = validateMealDocumentForStorage(doc, { personId: 'person-1' });
    expect(stored.ok).toBe(true);
  });

  it('planning payload preserves typed recipe references without dropping them', () => {
    const components = addComponentFromRecipe(
      [foodComponent({ component_id: 'comp-sausage' })],
      'comp-smoothie',
      { recipe: recipeDoc(), quantity: 1 },
    );
    const payload = mealDocumentToPlannedMealPayload(mealDoc(components)) as {
      items: Array<{ component_kind?: string; recipe_meal_document_id?: string }>;
      typed_components: MealComponent[];
    };
    expect(payload.typed_components).toHaveLength(2);
    expect(payload.typed_components.some((c) => c.component_kind === 'recipe_document')).toBe(
      true,
    );
    expect(
      payload.items.some(
        (item) =>
          item.component_kind === 'recipe_document' &&
          item.recipe_meal_document_id === 'recipe-smoothie',
      ),
    ).toBe(true);

    const roundTrip = plannedMealToMealDocument({
      id: 'planned-1',
      person_id: 'person-1',
      plan_id: 'plan-1',
      plan_day_id: 'day-1',
      plan_slot_id: null,
      name: 'Breakfast',
      meal_type: 'breakfast',
      payload,
      protein_score_10: null,
      is_main_meal: true,
      psq_multiplier: 1,
      meal_derived_data: {},
      nds_confidence: 'low',
      execution_state: 'pending',
      journal_entry_id: null,
      source_template_id: null,
      source_imported_meal_id: null,
      reusable_provenance: null,
      nds_version: null,
      classifier_version: null,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    });
    expect(roundTrip.components.some((c) => c.component_kind === 'recipe_document')).toBe(true);
    expect(
      roundTrip.components.find((c) => c.component_kind === 'recipe_document')
        ?.recipe_version_token,
    ).toBe('v3');
  });

  it('composer reopen preserves recipe portion after edits by component_id', () => {
    let state = createComposerState('create', mealDoc([foodComponent({ component_id: 'comp-sausage' })]));
    state = composerReducer(state, {
      type: 'ADD_COMPONENT_FROM_RECIPE',
      componentId: 'comp-smoothie',
      selection: { recipe: recipeDoc(), quantity: 1 },
    });
    state = composerReducer(state, {
      type: 'UPDATE_COMPONENT_QUANTITY_UNIT',
      componentId: 'comp-smoothie',
      quantity: 2,
      unit: 'serving',
    });
    expect(state.document.components).toHaveLength(2);
    const smoothie = state.document.components.find((c) => c.component_id === 'comp-smoothie');
    expect(smoothie?.quantity).toBe(2);
    expect(smoothie?.recipe_meal_document_id).toBe('recipe-smoothie');

    const reopened = createComposerState('edit-saved', state.document);
    expect(reopened.document.components.map((c) => c.component_id)).toEqual([
      'comp-sausage',
      'comp-smoothie',
    ]);
  });

  it('recompute scales recipe snapshot by portion quantity', () => {
    const component = buildRecipeReferenceComponent({
      componentId: 'comp-smoothie',
      recipe: recipeDoc(),
      quantity: 2,
    });
    const result = recomputeMealNutrition([component]);
    expect(result.components[0]?.status).toBe('recomputed');
    expect(result.totals.calories).toBe(440);
  });

  it('expansion contract preserves provenance through recipe edges', () => {
    const components = addComponentFromRecipe(
      [foodComponent({ component_id: 'comp-sausage' })],
      'comp-smoothie',
      { recipe: recipeDoc(), quantity: 1 },
    );
    const tree = expandMealComposition(mealDoc(components), {
      resolveRecipe: () => recipeDoc(),
      plan_id: 'plan-1',
    });
    expect(tree.children?.[1]?.kind).toBe('recipe_portion');
    expect(tree.children?.[1]?.provenance.recipe_meal_document_id).toBe('recipe-smoothie');
    expect(tree.children?.[1]?.children?.[0]?.kind).toBe('recipe_ingredient');
    expect(tree.children?.[1]?.children?.[0]?.provenance.plan_id).toBe('plan-1');
  });

  it('legacy document normalization stamps document_version and component_kind', () => {
    const normalized = normalizeMealDocumentComponentContract({
      schema_version: 1,
      id: 'x',
      kind: 'meal',
      review_state: 'confirmed',
      title: 'Legacy',
      description: null,
      intents: [],
      meal_type_hint: null,
      components: [
        {
          component_id: 'c1',
          name: 'Egg',
          quantity: 1,
          unit: 'each',
          food_object_id: 'food-egg',
          calories: 70,
          macros: { protein_g: 6, carbs_g: 0, fat_g: 5 },
          nutrition_basis: 'per_component',
          match_status: 'matched',
          source_kind: 'food_object',
          needs_review: false,
        },
      ],
      yield: null,
      recipe_yield_servings: null,
      serving_label: null,
      prep_notes: null,
      per_serving: null,
      totals: null,
      source: { source_type: 'manual' },
      nds: null,
      nds_version: null,
      classifier_version: null,
      created_at: null,
      updated_at: null,
    }) as MealDocument;
    expect(normalized.document_version).toBe(1);
    expect(normalized.components[0]?.component_kind).toBe('food_concept');
  });

  it('legacy planning items without IDs hydrate, reorder, save, and reopen without index identity', () => {
    const legacyPlanned = {
      id: 'planned-legacy',
      person_id: 'person-1',
      plan_id: 'plan-1',
      plan_day_id: 'day-1',
      plan_slot_id: null,
      name: 'Legacy breakfast',
      meal_type: 'breakfast' as const,
      payload: {
        items: [
          { name: 'Chicken sausage', quantity: 1, unit: 'link', food_object_id: 'food-sausage' },
          { name: 'English muffin', quantity: 1, unit: 'item', food_object_id: 'food-muffin' },
          { name: 'Banana', quantity: 1, unit: 'each', food_object_id: 'food-banana' },
        ],
        totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      },
      protein_score_10: null,
      is_main_meal: true,
      psq_multiplier: 1,
      meal_derived_data: {},
      nds_confidence: 'low' as const,
      execution_state: 'pending' as const,
      journal_entry_id: null,
      source_template_id: null,
      source_imported_meal_id: null,
      reusable_provenance: null,
      nds_version: null,
      classifier_version: null,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    };

    const hydrated = plannedMealToMealDocument(legacyPlanned);
    expect(hydrated.components).toHaveLength(3);
    for (const component of hydrated.components) {
      expect(component.component_id).toBeTruthy();
      expect(component.component_id).not.toMatch(/^component_\d+$/);
      // food_object_id must not be reused as component identity (duplicate foods collide).
      expect(component.component_id).not.toBe(component.food_object_id);
    }
    const idsAtHydrate = hydrated.components.map((c) => c.component_id);
    expect(new Set(idsAtHydrate).size).toBe(3);

    // Reorder: identity must travel with the component, not array position.
    const reordered = {
      ...hydrated,
      components: [hydrated.components[2]!, hydrated.components[0]!, hydrated.components[1]!],
    };
    const saved = mealDocumentToPlannedMealPayload(reordered) as {
      items: Array<{ name?: string; component_id?: string }>;
      typed_components: MealComponent[];
    };
    expect(saved.typed_components.map((c) => c.component_id)).toEqual([
      idsAtHydrate[2],
      idsAtHydrate[0],
      idsAtHydrate[1],
    ]);
    expect(saved.items.map((item) => item.component_id)).toEqual([
      idsAtHydrate[2],
      idsAtHydrate[0],
      idsAtHydrate[1],
    ]);

    const reopened = plannedMealToMealDocument({
      ...legacyPlanned,
      payload: saved,
    });
    expect(reopened.components.map((c) => c.component_id)).toEqual([
      idsAtHydrate[2],
      idsAtHydrate[0],
      idsAtHydrate[1],
    ]);
    expect(reopened.components[0]?.name).toBe('Banana');
    expect(reopened.components[1]?.name).toBe('Chicken sausage');
  });

  it('blank + food selection set explicit component kinds', () => {
    expect(blankComponent('a').component_kind).toBe('user_entered');
    const withFood = addComponentFromSelection([], 'b', {
      food_object_id: 'food-1',
      name: 'Spinach',
      food: {
        id: 'food-1',
        canonicalName: 'Spinach',
        brandName: 'Whole Foods',
        aliases: [],
        sourceType: 'branded',
        sourceProvider: null,
        sourceId: null,
        sourceDataset: null,
        upc: null,
        servingSizeG: 85,
        calories: 20,
        proteinG: 2,
        carbsG: 3,
        fatG: 0,
        fiberG: 2,
        sugarG: null,
        sodiumMg: null,
        measures: [],
        nutrientsExtended: null,
        createdAt: null,
        updatedAt: null,
      } as never,
    });
    expect(withFood[0]?.component_kind).toBe('product_variant');
  });
});
