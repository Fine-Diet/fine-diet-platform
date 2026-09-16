/**
 * Meal Object Foundation — Packet 3: Deterministic Recompute Service tests.
 *
 * Covers the recompute policy (audit §5) end to end:
 *   1. empty component list
 *   2. fully grounded components with absolute nutrition
 *   3. per-serving scaling
 *   4. per-100g scaling with quantity_g
 *   5. household measure conversion where grams are known
 *   6. missing unit / conversion basis
 *   7. ungrounded component
 *   8. mixed safe and unsafe components
 *   9. review flags aggregate to document-level needs-review
 *  10. inputs are not mutated
 *  11. no NDS required / NDS untouched
 *  12. floating-point rounding is stable and documented
 */

import {
  MEAL_SCHEMA_VERSION,
  type MealComponent,
  type MealDocument,
} from '../types';
import {
  ROUNDING_DECIMALS,
  canRecomputeComponent,
  deriveComponentScaleFactor,
  markComponentNeedsNutritionReview,
  recomputeMealDocumentNutrition,
  recomputeMealNutrition,
  scaleMealNutrition,
} from '../recompute';

// ============================================================================
// Fixtures
// ============================================================================

/** A grounded, trusted, fully-specified per_component component (factor 1). */
function absoluteComponent(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'c-abs',
    name: 'Chicken Breast',
    quantity: 1,
    unit: 'serving',
    food_object_id: 'food-chicken',
    calories: 200,
    macros: { protein_g: 40, carbs_g: 0, fat_g: 4 },
    nutrition_basis: 'per_component',
    match_status: 'matched',
    source_kind: 'food_object',
    needs_review: false,
    ...overrides,
  };
}

/** A per_serving component whose nutrition scales with quantity. */
function perServingComponent(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'c-ps',
    name: 'Oatmeal',
    quantity: 2,
    unit: 'serving',
    food_object_id: 'food-oat',
    serving_size_g: 50,
    calories: 100,
    macros: { protein_g: 5, carbs_g: 18, fat_g: 2 },
    nutrition_basis: 'per_serving',
    match_status: 'matched',
    source_kind: 'food_object',
    needs_review: false,
    ...overrides,
  };
}

function buildDoc(components: MealComponent[], overrides: Partial<MealDocument> = {}): MealDocument {
  return {
    schema_version: MEAL_SCHEMA_VERSION,
    id: 'doc-1',
    person_id: 'person-1',
    kind: 'meal',
    review_state: 'confirmed',
    title: 'Test Meal',
    description: null,
    intents: [],
    meal_type_hint: null,
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
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

// ============================================================================
// 1. Empty component list
// ============================================================================

describe('recomputeMealNutrition — empty list', () => {
  it('returns empty totals and no review for an empty component list', () => {
    const result = recomputeMealNutrition([]);
    expect(result.totals).toEqual({
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
    });
    expect(result.components).toEqual([]);
    expect(result.needs_review).toBe(false);
    expect(result.recomputed_count).toBe(0);
    expect(result.review_count).toBe(0);
    expect(result.issues).toEqual([]);
  });
});

// ============================================================================
// 2. Fully grounded components with absolute nutrition
// ============================================================================

describe('recomputeMealNutrition — absolute (per_component) nutrition', () => {
  it('sums absolute nutrition directly with factor 1', () => {
    const result = recomputeMealNutrition([
      absoluteComponent(),
      absoluteComponent({
        component_id: 'c-rice',
        name: 'Brown Rice',
        food_object_id: 'food-rice',
        calories: 220,
        macros: { protein_g: 5, carbs_g: 45, fat_g: 2 },
      }),
    ]);

    expect(result.needs_review).toBe(false);
    expect(result.recomputed_count).toBe(2);
    expect(result.totals.calories).toBe(420);
    expect(result.totals.macros).toEqual({ protein_g: 45, carbs_g: 45, fat_g: 6 });
    expect(result.components[0].scale_factor).toBe(1);
    expect(result.components[0].scale_basis).toBe('absolute');
  });
});

// ============================================================================
// 3. Per-serving scaling
// ============================================================================

describe('recomputeMealNutrition — per-serving scaling', () => {
  it('scales per-serving nutrition by the serving count', () => {
    const result = recomputeMealNutrition([perServingComponent({ quantity: 2 })]);
    expect(result.needs_review).toBe(false);
    expect(result.components[0].scale_factor).toBe(2);
    expect(result.components[0].scale_basis).toBe('servings');
    expect(result.totals.calories).toBe(200);
    expect(result.totals.macros).toEqual({ protein_g: 10, carbs_g: 36, fat_g: 4 });
  });
});

// ============================================================================
// 4. Per-100g scaling with quantity_g
// ============================================================================

describe('recomputeMealNutrition — per-100g scaling with quantity_g', () => {
  it('scales per-100g nutrition (serving_size_g=100) by quantity_g', () => {
    const component = perServingComponent({
      component_id: 'c-100g',
      name: 'Greek Yogurt',
      unit: null,
      quantity: null,
      quantity_g: 250,
      serving_size_g: 100,
      calories: 60,
      macros: { protein_g: 10, carbs_g: 4, fat_g: 0.5 },
    });
    const result = recomputeMealNutrition([component]);

    expect(result.components[0].scale_basis).toBe('grams');
    expect(result.components[0].scale_factor).toBe(2.5);
    expect(result.totals.calories).toBe(150);
    expect(result.totals.macros).toEqual({ protein_g: 25, carbs_g: 10, fat_g: 1.25 });
  });

  it('scales per-100g nutrition when grams are given via unit "g"', () => {
    const component = perServingComponent({
      unit: 'g',
      quantity: 200,
      serving_size_g: 100,
      calories: 80,
      macros: { protein_g: 8, carbs_g: 2, fat_g: 1 },
    });
    const result = recomputeMealNutrition([component]);
    expect(result.components[0].scale_basis).toBe('grams');
    expect(result.components[0].scale_factor).toBe(2);
    expect(result.totals.calories).toBe(160);
  });
});

// ============================================================================
// 5. Household measure conversion where grams are known
// ============================================================================

describe('recomputeMealNutrition — household measure conversion', () => {
  it('converts a measure unit to grams then to servings', () => {
    const component = perServingComponent({
      component_id: 'c-cup',
      name: 'Milk',
      unit: 'cup',
      quantity: 1,
      serving_size_g: 120,
      measures: [{ unit: 'cup', grams: 240 }],
      calories: 50,
      macros: { protein_g: 4, carbs_g: 6, fat_g: 2 },
    });
    const result = recomputeMealNutrition([component]);

    // 1 cup = 240g, serving = 120g ⇒ 2 servings.
    expect(result.components[0].scale_basis).toBe('household_measure');
    expect(result.components[0].scale_factor).toBe(2);
    expect(result.totals.calories).toBe(100);
    expect(result.totals.macros).toEqual({ protein_g: 8, carbs_g: 12, fat_g: 4 });
  });

  it('flags a measure unit not present in measures as unit_not_comparable', () => {
    const component = perServingComponent({
      unit: 'tablespoon',
      quantity: 3,
      measures: [{ unit: 'cup', grams: 240 }],
    });
    const result = recomputeMealNutrition([component]);
    expect(result.needs_review).toBe(true);
    expect(result.issues[0].code).toBe('unit_not_comparable');
  });
});

// ============================================================================
// 6. Missing unit / conversion basis
// ============================================================================

describe('recomputeMealNutrition — missing conversion basis', () => {
  it('flags a per-serving component that has a quantity but no unit/grams', () => {
    const component = perServingComponent({
      unit: null,
      quantity: 3,
      quantity_g: null,
      serving_size_g: null,
    });
    const result = recomputeMealNutrition([component]);
    expect(result.needs_review).toBe(true);
    expect(result.recomputed_count).toBe(0);
    expect(result.issues[0].code).toBe('missing_conversion_basis');
    expect(result.totals.calories).toBeNull();
  });

  it('flags a grams unit with no serving_size_g as missing_conversion_basis', () => {
    const component = perServingComponent({
      unit: 'g',
      quantity: 150,
      serving_size_g: null,
    });
    const result = recomputeMealNutrition([component]);
    expect(result.issues[0].code).toBe('missing_conversion_basis');
  });

  it('flags conflicting unit grams vs quantity_g as conflicting_nutrition_basis', () => {
    const component = perServingComponent({
      unit: 'g',
      quantity: 200,
      quantity_g: 500, // contradicts the 200g unit amount
      serving_size_g: 100,
    });
    const result = recomputeMealNutrition([component]);
    expect(result.issues[0].code).toBe('conflicting_nutrition_basis');
  });
});

// ============================================================================
// 7. Ungrounded component
// ============================================================================

describe('recomputeMealNutrition — ungrounded component', () => {
  it('flags a component with no nutrition and no food object as ungrounded', () => {
    const component: MealComponent = {
      component_id: 'c-bare',
      name: 'Mystery Side',
      quantity: 1,
      unit: 'serving',
      food_object_id: null,
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
      nutrition_basis: 'per_component',
      match_status: 'none',
      source_kind: 'default_guess',
      needs_review: false,
    };
    const result = recomputeMealNutrition([component]);
    expect(result.needs_review).toBe(true);
    expect(result.issues[0].code).toBe('ungrounded_component');
    expect(result.totals.calories).toBeNull();
  });

  it('does not invent numbers for an ungrounded component (totals stay null)', () => {
    const component: MealComponent = {
      component_id: 'c-bare2',
      name: 'Unknown',
      quantity: 2,
      unit: 'cup',
      food_object_id: null,
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
      nutrition_basis: 'per_serving',
      match_status: 'none',
      source_kind: 'heuristic_guess',
      needs_review: false,
    };
    const result = recomputeMealNutrition([component]);
    expect(result.totals).toEqual({
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
    });
  });

  it('flags a guessed component (untrusted grounding) without recomputing', () => {
    const component = perServingComponent({
      match_status: 'guessed',
      source_kind: 'heuristic_guess',
    });
    const result = recomputeMealNutrition([component]);
    expect(result.needs_review).toBe(true);
    expect(result.issues[0].code).toBe('untrusted_grounding');
    expect(result.recomputed_count).toBe(0);
  });

  it('flags a grounded component with no nutrition fields as missing_component_nutrition', () => {
    // Grounded (food_object_id + matched) but carries no calories/macros. P3
    // does not fetch nutrients from the DB, so it cannot be recomputed here.
    const component: MealComponent = {
      component_id: 'c-grounded-empty',
      name: 'Spinach',
      quantity: 1,
      unit: 'serving',
      food_object_id: 'food-spinach',
      serving_size_g: 30,
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
      nutrition_basis: 'per_serving',
      match_status: 'matched',
      source_kind: 'food_object',
      needs_review: false,
    };
    const result = recomputeMealNutrition([component]);
    expect(result.needs_review).toBe(true);
    expect(result.recomputed_count).toBe(0);
    expect(result.issues[0].code).toBe('missing_component_nutrition');
    // No nutrition is invented for a grounded-but-empty component.
    expect(result.totals.calories).toBeNull();
  });

  it('flags an already needs_review component as flagged_for_review without recomputing', () => {
    // Otherwise fully recomputable (matched, has nutrition, resolvable unit),
    // but arrives flagged ⇒ recompute prefers review over silent math.
    const component = perServingComponent({
      component_id: 'c-prereviewed',
      needs_review: true,
    });
    const result = recomputeMealNutrition([component]);
    expect(result.needs_review).toBe(true);
    expect(result.recomputed_count).toBe(0);
    expect(result.issues[0].code).toBe('flagged_for_review');
    expect(result.components[0].status).toBe('needs_review');
    // The clone stays flagged (not silently cleared).
    expect(result.components[0].component.needs_review).toBe(true);
  });
});

// ============================================================================
// 8. Mixed safe and unsafe components
// ============================================================================

describe('recomputeMealNutrition — mixed safe and unsafe', () => {
  it('recomputes the safe subset and flags the unsafe ones', () => {
    const safe = absoluteComponent({ component_id: 'safe', calories: 200, macros: { protein_g: 40, carbs_g: 0, fat_g: 4 } });
    const unsafeUnit = perServingComponent({
      component_id: 'unsafe-unit',
      unit: 'pinch',
      quantity: 2,
      measures: [],
    });
    const ungrounded: MealComponent = {
      component_id: 'unsafe-ungrounded',
      name: 'Mystery',
      quantity: 1,
      unit: 'serving',
      food_object_id: null,
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
      nutrition_basis: 'per_component',
      match_status: 'none',
      source_kind: 'default_guess',
      needs_review: false,
    };

    const result = recomputeMealNutrition([safe, unsafeUnit, ungrounded]);

    expect(result.recomputed_count).toBe(1);
    expect(result.review_count).toBe(2);
    expect(result.needs_review).toBe(true);
    // Totals reflect ONLY the safe subset.
    expect(result.totals.calories).toBe(200);
    expect(result.totals.macros).toEqual({ protein_g: 40, carbs_g: 0, fat_g: 4 });

    const byId = Object.fromEntries(result.components.map((c) => [c.component_id, c]));
    expect(byId.safe.status).toBe('recomputed');
    expect(byId['unsafe-unit'].status).toBe('needs_review');
    expect(byId['unsafe-unit'].issues[0].code).toBe('unit_not_comparable');
    expect(byId['unsafe-ungrounded'].issues[0].code).toBe('ungrounded_component');

    // Issues carry the right indices.
    expect(result.issues.map((i) => i.component_index).sort()).toEqual([1, 2]);
  });
});

// ============================================================================
// 9. Review flags aggregate to document-level needs-review
// ============================================================================

describe('recomputeMealDocumentNutrition — aggregate review state', () => {
  it('upgrades review_state to needs_review when any component is unsafe', () => {
    const doc = buildDoc([
      absoluteComponent(),
      perServingComponent({ component_id: 'bad', match_status: 'guessed', source_kind: 'heuristic_guess' }),
    ]);
    const { document, recompute } = recomputeMealDocumentNutrition(doc);

    expect(recompute.needs_review).toBe(true);
    expect(document.review_state).toBe('needs_review');
    // The unsafe component's clone is flagged; the safe one is cleared.
    const bad = document.components.find((c) => c.component_id === 'bad');
    expect(bad?.needs_review).toBe(true);
    const good = document.components.find((c) => c.component_id === 'c-abs');
    expect(good?.needs_review).toBe(false);
    // Totals reflect the safe subset only.
    expect(document.totals?.calories).toBe(200);
  });

  it('leaves review_state unchanged when every component is recomputable', () => {
    const doc = buildDoc([absoluteComponent(), perServingComponent()], {
      review_state: 'confirmed',
    });
    const { document, recompute } = recomputeMealDocumentNutrition(doc);
    expect(recompute.needs_review).toBe(false);
    expect(document.review_state).toBe('confirmed');
    expect(document.totals?.calories).toBe(400); // 200 + 100*2
  });
});

// ============================================================================
// 10. Inputs are not mutated
// ============================================================================

describe('recompute — does not mutate inputs', () => {
  it('does not mutate the component array or its objects', () => {
    const component = perServingComponent({ needs_review: false });
    const snapshot = JSON.stringify(component);
    const arr = [component];
    const arrSnapshot = JSON.stringify(arr);

    recomputeMealNutrition(arr);

    expect(JSON.stringify(component)).toBe(snapshot);
    expect(JSON.stringify(arr)).toBe(arrSnapshot);
  });

  it('does not mutate the document (returns a new clone)', () => {
    const doc = buildDoc([
      perServingComponent({ match_status: 'guessed', source_kind: 'heuristic_guess' }),
    ]);
    const snapshot = JSON.stringify(doc);

    const { document } = recomputeMealDocumentNutrition(doc);

    expect(JSON.stringify(doc)).toBe(snapshot);
    expect(document).not.toBe(doc);
    expect(document.components).not.toBe(doc.components);
  });

  it('markComponentNeedsNutritionReview returns a flagged clone without mutating input', () => {
    const component = absoluteComponent({ needs_review: false });
    const flagged = markComponentNeedsNutritionReview(component, 'because');
    expect(flagged).not.toBe(component);
    expect(flagged.needs_review).toBe(true);
    expect(component.needs_review).toBe(false);
  });
});

// ============================================================================
// 11. No NDS required / NDS untouched
// ============================================================================

describe('recomputeMealDocumentNutrition — NDS is preserved, not computed', () => {
  it('passes through a null nds without computing it', () => {
    const doc = buildDoc([absoluteComponent()], { nds: null });
    const { document } = recomputeMealDocumentNutrition(doc);
    expect(document.nds).toBeNull();
    expect(document.nds_version).toBeNull();
    expect(document.classifier_version).toBeNull();
  });

  it('passes through an existing nds block verbatim', () => {
    const nds = {
      protein_score_10: 7,
      is_main_meal: true,
      psq_multiplier: 1.1,
      meal_derived_data: { foo: 'bar' },
      nds_confidence: 'high',
    } as unknown as MealDocument['nds'];
    const doc = buildDoc([absoluteComponent()], {
      nds,
      nds_version: 'nds-v1',
      classifier_version: 'clf-v1',
    });
    const { document } = recomputeMealDocumentNutrition(doc);
    expect(document.nds).toBe(nds);
    expect(document.nds_version).toBe('nds-v1');
    expect(document.classifier_version).toBe('clf-v1');
  });
});

// ============================================================================
// 12. Floating-point rounding is stable and documented
// ============================================================================

describe('scaleMealNutrition + totals — stable rounding', () => {
  it('rounds scaled values to ROUNDING_DECIMALS places', () => {
    expect(ROUNDING_DECIMALS).toBe(2);
    const scaled = scaleMealNutrition(
      { calories: 10, macros: { protein_g: 0.1, carbs_g: 1, fat_g: 0.005 } },
      0.3,
    );
    expect(scaled.calories).toBe(3);
    expect(scaled.macros.protein_g).toBe(0.03);
    expect(scaled.macros.carbs_g).toBe(0.3);
    // 0.005 * 0.3 = 0.0015 → rounds to 0.
    expect(scaled.macros.fat_g).toBe(0);
  });

  it('keeps null fields null when scaling (never invents)', () => {
    const scaled = scaleMealNutrition(
      { calories: null, macros: { protein_g: null, carbs_g: 5, fat_g: null } },
      2,
    );
    expect(scaled.calories).toBeNull();
    expect(scaled.macros.protein_g).toBeNull();
    expect(scaled.macros.carbs_g).toBe(10);
    expect(scaled.macros.fat_g).toBeNull();
  });

  it('produces stable sums free of binary-float artifacts (0.1 + 0.2 = 0.3)', () => {
    const a = absoluteComponent({
      component_id: 'a',
      calories: 0.1,
      macros: { protein_g: 0.1, carbs_g: 0, fat_g: 0 },
    });
    const b = absoluteComponent({
      component_id: 'b',
      calories: 0.2,
      macros: { protein_g: 0.2, carbs_g: 0, fat_g: 0 },
    });
    const result = recomputeMealNutrition([a, b]);
    expect(result.totals.calories).toBe(0.3);
    expect(result.totals.macros.protein_g).toBe(0.3);
  });

  it('preserves optional macro keys (fiber_g / added_sugar_g) through scaling and summing', () => {
    const component = perServingComponent({
      quantity: 2,
      macros: { protein_g: 5, carbs_g: 18, fat_g: 2, fiber_g: 3, added_sugar_g: 1 },
    });
    const result = recomputeMealNutrition([component]);
    expect(result.totals.macros.fiber_g).toBe(6);
    expect(result.totals.macros.added_sugar_g).toBe(2);
  });
});

// ============================================================================
// deriveComponentScaleFactor / canRecomputeComponent (unit-level)
// ============================================================================

describe('deriveComponentScaleFactor', () => {
  it('returns factor 1 / absolute for per_component basis', () => {
    const r = deriveComponentScaleFactor(absoluteComponent());
    expect(r).toEqual({ ok: true, factor: 1, basis: 'absolute' });
  });

  it('returns servings basis for per_serving with serving unit', () => {
    const r = deriveComponentScaleFactor(perServingComponent({ quantity: 3 }));
    expect(r).toEqual({ ok: true, factor: 3, basis: 'servings' });
  });

  it('fails with missing_conversion_basis when nothing is usable', () => {
    const r = deriveComponentScaleFactor(
      perServingComponent({ unit: null, quantity: 1, quantity_g: null, serving_size_g: null }),
    );
    expect(r).toEqual({ ok: false, code: 'missing_conversion_basis' });
  });
});

describe('canRecomputeComponent', () => {
  it('is true for a trusted, resolvable component', () => {
    expect(canRecomputeComponent(absoluteComponent())).toBe(true);
    expect(canRecomputeComponent(perServingComponent())).toBe(true);
  });

  it('is false for guessed / ungrounded / unresolvable components', () => {
    expect(canRecomputeComponent(perServingComponent({ match_status: 'guessed', source_kind: 'heuristic_guess' }))).toBe(false);
    expect(canRecomputeComponent(perServingComponent({ unit: 'pinch', measures: [] }))).toBe(false);
  });
});
