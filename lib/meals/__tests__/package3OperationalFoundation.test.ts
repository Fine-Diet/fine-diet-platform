/**
 * Package 3 — Meals/Recipes operational foundation unit tests.
 */

import {
  assertMealDocumentKind,
  classifyMealDocumentKind,
  inferMealDocumentKind,
} from '../classification';
import {
  buildImportDuplicateKey,
  normalizeSourceUrl,
  sourceUrlsMatch,
} from '../provenance';
import {
  getMealLifecycleState,
  isMealDocumentArchived,
  markMealDocumentArchived,
  markMealDocumentRestored,
} from '../lifecycle';
import { deriveMealNutritionStatus } from '../nutritionStatus';
import {
  resolveBaseServings,
  scaleComponentQuantities,
  scaleMealDocumentForServings,
  servingScaleFactor,
} from '../servingScale';
import { macrosToSnakeNullable, probeLegacyMealShape } from '../legacyCompat';
import { MEAL_SCHEMA_VERSION, type MealComponent, type MealDocument } from '../types';
import { scaleTopLevelMealNutrition } from '../recompute';

function baseDoc(overrides: Partial<MealDocument> = {}): MealDocument {
  return {
    schema_version: MEAL_SCHEMA_VERSION,
    id: 'doc-1',
    person_id: 'person-1',
    kind: 'meal',
    review_state: 'confirmed',
    title: 'Test meal',
    description: null,
    intents: ['meal'],
    meal_type_hint: null,
    components: [],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: {
      calories: 100,
      macros: { protein_g: 10, carbs_g: 5, fat_g: 2 },
    },
    totals: {
      calories: 100,
      macros: { protein_g: 10, carbs_g: 5, fat_g: 2 },
    },
    source: { source_type: 'manual' },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function component(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'c1',
    name: 'Rice',
    quantity: 100,
    unit: 'g',
    food_object_id: 'food-rice',
    calories: 130,
    macros: { protein_g: 2.5, carbs_g: 28, fat_g: 0.3 },
    nutrition_basis: 'per_component',
    match_status: 'matched',
    source_kind: 'food_object',
    needs_review: false,
    ...overrides,
  };
}

describe('classification', () => {
  it('infers recipe when steps/yield present', () => {
    const doc = baseDoc({
      kind: 'recipe',
      steps: [{ step_number: 1, instruction: 'Cook' }],
      yield: { servings: 4, confirmed: true },
    });
    expect(inferMealDocumentKind(doc)).toBe('recipe');
    expect(classifyMealDocumentKind(doc).consistent).toBe(true);
  });

  it('surfaces inconsistent kind honestly', () => {
    const doc = baseDoc({
      kind: 'meal',
      steps: [{ step_number: 1, instruction: 'Bake' }],
      yield: { servings: 2, confirmed: true },
    });
    const result = classifyMealDocumentKind(doc);
    expect(result.consistent).toBe(false);
    expect(result.suggested_kind).toBe('recipe');
  });

  it('rejects invalid kind', () => {
    expect(() => assertMealDocumentKind('snack')).toThrow(/Invalid meal document kind/);
  });
});

describe('provenance / URL dedup', () => {
  it('normalizes tracking params and host case', () => {
    const a = normalizeSourceUrl(
      'HTTPS://Example.COM/recipe/soup/?utm_source=x&fbclid=1&b=2&a=1#frag',
    );
    const b = normalizeSourceUrl('https://example.com/recipe/soup?a=1&b=2');
    expect(a).toBe(b);
    expect(sourceUrlsMatch(a, b)).toBe(true);
  });

  it('rejects non-http schemes', () => {
    expect(normalizeSourceUrl('javascript:alert(1)')).toBeNull();
    expect(buildImportDuplicateKey({ source_url: 'ftp://x' }).kind).toBe('none');
  });

  it('builds source_url duplicate key when URL is valid', () => {
    const key = buildImportDuplicateKey({
      source_url: 'https://example.com/r',
    });
    expect(key.kind).toBe('source_url');
    expect(key.value).toBe('https://example.com/r');
  });
});

describe('lifecycle archive/restore', () => {
  it('marks archived without changing review_state', () => {
    const doc = baseDoc({ review_state: 'confirmed' });
    const archived = markMealDocumentArchived(doc, '2026-07-31T12:00:00.000Z');
    expect(isMealDocumentArchived(archived)).toBe(true);
    expect(archived.review_state).toBe('confirmed');
    expect(archived.archived_at).toBe('2026-07-31T12:00:00.000Z');
    expect(doc.lifecycle_state).toBeUndefined();
  });

  it('restores to active', () => {
    const archived = markMealDocumentArchived(baseDoc());
    const restored = markMealDocumentRestored(archived);
    expect(getMealLifecycleState(restored)).toBe('active');
    expect(restored.archived_at).toBeNull();
  });

  it('treats legacy rows without lifecycle as active', () => {
    expect(getMealLifecycleState(baseDoc())).toBe('active');
  });
});

describe('nutrition status', () => {
  it('returns calculated for fully matched food components', () => {
    const doc = baseDoc({
      components: [component()],
      review_state: 'confirmed',
    });
    expect(deriveMealNutritionStatus(doc)).toBe('calculated');
  });

  it('returns stale when needs_review with rolled-up numbers', () => {
    const doc = baseDoc({
      components: [component({ needs_review: true })],
      review_state: 'needs_review',
    });
    expect(deriveMealNutritionStatus(doc)).toBe('stale');
  });

  it('returns user_entered when all components are user_entered', () => {
    const doc = baseDoc({
      components: [component({ source_kind: 'user_entered', match_status: 'none' })],
      source: { source_type: 'manual' },
    });
    expect(deriveMealNutritionStatus(doc)).toBe('user_entered');
  });

  it('returns imported for import estimates with guessed matches', () => {
    const doc = baseDoc({
      components: [
        component({
          source_kind: 'heuristic_guess',
          match_status: 'guessed',
        }),
      ],
      source: {
        source_type: 'imported',
        source_imported_meal_id: 'imp-1',
        source_url: 'https://example.com/r',
      },
    });
    expect(deriveMealNutritionStatus(doc)).toBe('imported');
  });
});

describe('serving / yield scaling', () => {
  it('scales component quantities without mutating source', () => {
    const original = [component({ quantity: 100, quantity_g: 100 })];
    const scaled = scaleComponentQuantities(original, 2);
    expect(scaled[0].quantity).toBe(200);
    expect(scaled[0].quantity_g).toBe(200);
    expect(original[0].quantity).toBe(100);
  });

  it('builds a scaled meal view from yield', () => {
    const doc = baseDoc({
      kind: 'recipe',
      yield: { servings: 4, confirmed: true },
      recipe_yield_servings: 4,
      components: [component({ quantity: 200 })],
      per_serving: {
        calories: 250,
        macros: { protein_g: 20, carbs_g: 10, fat_g: 8 },
      },
    });
    const view = scaleMealDocumentForServings(doc, 2);
    expect(view).not.toBeNull();
    expect(view!.factor).toBe(0.5);
    expect(view!.components[0].quantity).toBe(100);
    expect(view!.nutrition?.calories).toBe(500);
  });

  it('uses shared top-level nutrition scaler for trusted docs', () => {
    const doc = baseDoc({
      components: [component()],
      per_serving: {
        calories: 100,
        macros: { protein_g: 10, carbs_g: 5, fat_g: 2 },
      },
    });
    const nutrition = scaleTopLevelMealNutrition(doc, 2);
    expect(nutrition?.calories).toBe(200);
    expect(servingScaleFactor(resolveBaseServings(doc), 2)).toBe(2);
  });
});

describe('legacy compat honesty', () => {
  it('does not zero-fill null macros', () => {
    expect(
      macrosToSnakeNullable({ protein_g: 10, carbs_g: null, fat_g: null }),
    ).toEqual({ protein_g: 10, carbs_g: null, fat_g: null });
  });

  it('refuses silent coercion of unknown shapes', () => {
    const result = probeLegacyMealShape({ foo: 1, bar: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('incompatible_shape');
    }
  });

  it('recognizes meal_document shape', () => {
    const result = probeLegacyMealShape(baseDoc({ components: [component()] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.shape).toBe('meal_document');
  });
});
