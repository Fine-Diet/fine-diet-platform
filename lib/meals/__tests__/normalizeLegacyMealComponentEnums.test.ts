import {
  normalizeLegacyMealComponentEnums,
  normalizeMealDocumentLegacyComponentEnums,
} from '../normalizeLegacyMealComponentEnums';
import { validateMealDocumentForStorage } from '../storage';
import { MealDocumentSchema } from '../validators';
import type { MealComponent, MealDocument } from '../types';
import { MEAL_SCHEMA_VERSION } from '../types';

function component(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'c1',
    name: 'Banana',
    raw_text: '1 banana',
    normalized_name: 'banana',
    preparation_note: null,
    quantity: 1,
    unit: 'each',
    quantity_g: 118,
    food_object_id: null,
    serving_size_g: null,
    calories: 105,
    macros: {
      protein_g: 1.3,
      carbs_g: 27,
      fat_g: 0.3,
    },
    nutrition_basis: 'per_component',
    match_status: 'none',
    source_kind: 'user_entered',
    needs_review: false,
    ...overrides,
  };
}

function document(components: MealComponent[]): MealDocument {
  return {
    schema_version: MEAL_SCHEMA_VERSION,
    id: '738ced73-b79c-4e65-983b-2b8a9b3e4df5',
    person_id: 'person-1',
    kind: 'recipe',
    review_state: 'needs_review',
    lifecycle_state: 'active',
    archived_at: null,
    nutrition_status: 'imported',
    title: 'Morning Smoothie',
    description: null,
    intents: ['recipe'],
    meal_type_hint: 'breakfast',
    components,
    steps: [],
    yield: { servings: 1, yield_label: null, confirmed: false },
    recipe_yield_servings: 1,
    serving_label: null,
    prep_notes: null,
    per_serving: {
      calories: 105,
      macros: { protein_g: 1.3, carbs_g: 27, fat_g: 0.3 },
    },
    totals: {
      calories: 105,
      macros: { protein_g: 1.3, carbs_g: 27, fat_g: 0.3 },
    },
    source: {
      source_type: 'imported',
      source_imported_meal_id: 'imp-1',
      source_url: null,
    },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

describe('normalizeLegacyMealComponentEnums', () => {
  it('normalizes legacy source_kind unmatched to user_entered', () => {
    const input = {
      ...component(),
      source_kind: 'unmatched',
    };
    const out = normalizeLegacyMealComponentEnums(input);
    expect(out.source_kind).toBe('user_entered');
    expect(out.name).toBe(input.name);
    expect(out.calories).toBe(input.calories);
    expect(out.macros).toEqual(input.macros);
    expect(out.food_object_id).toBe(input.food_object_id);
    expect(out.quantity).toBe(input.quantity);
    expect(out.unit).toBe(input.unit);
    expect(out.match_status).toBe(input.match_status);
    expect(out.needs_review).toBe(input.needs_review);
  });

  it('normalizes null/undefined nutrition_basis to per_component', () => {
    expect(
      normalizeLegacyMealComponentEnums({
        ...component(),
        nutrition_basis: null,
      }).nutrition_basis,
    ).toBe('per_component');
    expect(
      normalizeLegacyMealComponentEnums({
        ...component(),
        nutrition_basis: undefined,
      }).nutrition_basis,
    ).toBe('per_component');
  });

  it('preserves already valid canonical enum values unchanged', () => {
    const input = component({
      source_kind: 'food_object',
      nutrition_basis: 'per_serving',
      food_object_id: 'food-1',
    });
    const out = normalizeLegacyMealComponentEnums(input);
    expect(out).toBe(input);
    expect(out.source_kind).toBe('food_object');
    expect(out.nutrition_basis).toBe('per_serving');
  });

  it('keeps unrelated component fields byte-for-byte equivalent when normalizing', () => {
    const input = {
      ...component({
        component_id: 'c-legacy',
        name: 'Spinach',
        raw_text: '1 cup spinach',
        quantity: 1,
        unit: 'cup',
        calories: 7,
      }),
      source_kind: 'unmatched',
      nutrition_basis: null,
    };
    const before = JSON.stringify({
      ...input,
      source_kind: undefined,
      nutrition_basis: undefined,
    });
    const out = normalizeLegacyMealComponentEnums(input);
    const after = JSON.stringify({
      ...out,
      source_kind: undefined,
      nutrition_basis: undefined,
    });
    expect(after).toBe(before);
    expect(out.source_kind).toBe('user_entered');
    expect(out.nutrition_basis).toBe('per_component');
  });

  it('lets a mixed five-component legacy document open and save', () => {
    const legacyComponents = [
      component({
        component_id: 'c1',
        name: 'Banana',
        source_kind: 'unmatched' as MealComponent['source_kind'],
        nutrition_basis: null as unknown as MealComponent['nutrition_basis'],
      }),
      component({
        component_id: 'c2',
        name: 'Oats',
        source_kind: 'food_object',
        nutrition_basis: 'per_serving',
        food_object_id: 'food-oats',
      }),
      component({
        component_id: 'c3',
        name: 'Milk',
        source_kind: 'heuristic_guess',
        nutrition_basis: 'per_component',
      }),
      component({
        component_id: 'c4',
        name: 'Honey',
        source_kind: 'unmatched' as MealComponent['source_kind'],
        nutrition_basis: undefined as unknown as MealComponent['nutrition_basis'],
      }),
      component({
        component_id: 'c5',
        name: 'Peanut butter',
        source_kind: 'default_guess',
        nutrition_basis: 'per_component',
      }),
    ];

    // Schema rejects pre-normalization.
    expect(MealDocumentSchema.safeParse(document(legacyComponents)).success).toBe(
      false,
    );

    const normalized = normalizeMealDocumentLegacyComponentEnums(
      document(legacyComponents),
    ) as MealDocument;
    expect(MealDocumentSchema.safeParse(normalized).success).toBe(true);
    expect(normalized.components[0]!.source_kind).toBe('user_entered');
    expect(normalized.components[0]!.nutrition_basis).toBe('per_component');
    expect(normalized.components[1]!.source_kind).toBe('food_object');
    expect(normalized.components[1]!.nutrition_basis).toBe('per_serving');
    expect(normalized.components[3]!.source_kind).toBe('user_entered');
    expect(normalized.components[3]!.nutrition_basis).toBe('per_component');

    const saved = validateMealDocumentForStorage(document(legacyComponents), {
      personId: 'person-1',
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.value.document_json.components[0]!.source_kind).toBe(
        'user_entered',
      );
      expect(saved.value.document_json.components[0]!.nutrition_basis).toBe(
        'per_component',
      );
    }
  });

  it('still fails validation for invalid non-enum document structure', () => {
    const broken = {
      ...document([component()]),
      title: '',
      kind: 'not-a-kind',
    };
    const result = validateMealDocumentForStorage(broken, { personId: 'person-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(';')).toMatch(/kind|title/i);
    }
  });
});
