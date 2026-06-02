import type { IntakePayload, MealTemplate, MealTemplateItem } from '@/lib/journal/types';
import type {
  EatOutAttachablePayload,
  ImportedMeal,
  IngredientMatchEntry,
  PlannedMeal,
} from '@/lib/plans/types';
import type { MealDerivedData } from '@/lib/nds/types';

import {
  componentToEatOutAttachableItem,
  componentToIntakePayload,
  componentToMealTemplateItem,
  eatOutAttachableItemToComponent,
  eatOutPayloadToMealDocument,
  importedDraftIngredientToComponent,
  importedMealToMealDocumentDraft,
  intakePayloadToComponent,
  loggedMealGroupToIntakePayload,
  macrosFromJournal,
  macrosFromSnake,
  macrosToJournal,
  mealDocumentToLoggedMealGroup,
  mealTemplateItemToComponent,
  mealTemplateToMealDocument,
  plannedMealToMealDocument,
} from '../adapters';
import {
  LoggedMealGroupSchema,
  MealComponentSchema,
  MealDocumentSchema,
} from '../validators';

// ============================================================================
// Fixtures
// ============================================================================

const MEAL_DERIVED: MealDerivedData = {
  protein_score_10: 7,
  is_main_meal: true,
  meal_calories: 500,
  meal_protein_g: 30,
  psq_multiplier: 1.0,
};

// ============================================================================
// Macro key drift reconciliation
// ============================================================================

describe('macro normalization', () => {
  it('maps journal camelCase macros to canonical _g keys', () => {
    expect(macrosFromJournal({ protein: 10, carbs: 20, fat: 5 })).toEqual({
      protein_g: 10,
      carbs_g: 20,
      fat_g: 5,
    });
  });

  it('maps snake _g macros to canonical and back to journal', () => {
    const canonical = macrosFromSnake({ protein_g: 12, carbs_g: 8, fat_g: 3 });
    expect(canonical).toEqual({ protein_g: 12, carbs_g: 8, fat_g: 3 });
    expect(macrosToJournal(canonical)).toEqual({ protein: 12, carbs: 8, fat: 3 });
  });

  it('treats missing macro fields as null, not zero', () => {
    expect(macrosFromJournal(undefined)).toEqual({
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    });
    expect(macrosFromSnake({ protein_g: 5 })).toEqual({
      protein_g: 5,
      carbs_g: null,
      fat_g: null,
    });
  });

  it('drops null macro fields when converting back to journal spelling', () => {
    expect(macrosToJournal({ protein_g: 9, carbs_g: null, fat_g: null })).toEqual({
      protein: 9,
    });
  });
});

// ============================================================================
// Component round-trips
// ============================================================================

describe('intake payload ⇄ component', () => {
  it('round-trips name, quantity, unit, calories, macros, food link', () => {
    const payload: IntakePayload = {
      name: 'Greek Yogurt',
      quantity: 1.5,
      unit: 'cup',
      calories: 220,
      macros: { protein: 20, carbs: 12, fat: 5 },
      foodObjectId: 'food-123',
      servingSizeG: 170,
      measures: [{ unit: 'cup', grams: 245, label: '1 cup' }],
    };

    const component = intakePayloadToComponent(payload, 0);
    expect(component.nutrition_basis).toBe('per_serving');
    expect(component.match_status).toBe('matched');
    expect(component.source_kind).toBe('food_object');
    expect(MealComponentSchema.safeParse(component).success).toBe(true);

    const back = componentToIntakePayload(component);
    expect(back.name).toBe(payload.name);
    expect(back.quantity).toBe(payload.quantity);
    expect(back.unit).toBe(payload.unit);
    expect(back.calories).toBe(payload.calories);
    expect(back.macros).toEqual(payload.macros);
    expect(back.foodObjectId).toBe(payload.foodObjectId);
    expect(back.servingSizeG).toBe(payload.servingSizeG);
  });

  it('defaults legacy user-entered food (no food link) to none/user_entered, no review', () => {
    const component = intakePayloadToComponent({ name: 'Homemade soup', calories: 150 });
    expect(component.match_status).toBe('none');
    expect(component.source_kind).toBe('user_entered');
    expect(component.needs_review).toBe(false);
    expect(component.food_object_id).toBeNull();
  });
});

describe('meal template item ⇄ component', () => {
  it('round-trips and uses per_component basis', () => {
    const item: MealTemplateItem = {
      id: 'item-1',
      name: 'Chicken Breast',
      quantity: 2,
      unit: 'serving',
      calories: 330,
      macros: { protein: 62, carbs: 0, fat: 7 },
      foodObjectId: 'food-chicken',
      servingSizeG: 120,
    };

    const component = mealTemplateItemToComponent(item, 0);
    expect(component.component_id).toBe('item-1');
    expect(component.nutrition_basis).toBe('per_component');

    const back = componentToMealTemplateItem(component);
    expect(back.id).toBe(item.id);
    expect(back.name).toBe(item.name);
    expect(back.quantity).toBe(item.quantity);
    expect(back.unit).toBe(item.unit);
    expect(back.calories).toBe(item.calories);
    expect(back.macros).toEqual(item.macros);
    expect(back.foodObjectId).toBe(item.foodObjectId);
  });
});

describe('eat-out attachable item ⇄ component', () => {
  it('reconciles snake _g macros + snake food link both directions', () => {
    const item = {
      name: 'Burrito Bowl',
      quantity: 1,
      unit: 'serving',
      calories: 640,
      macros: { protein_g: 40, carbs_g: 70, fat_g: 18 },
      food_object_id: 'food-bowl',
    };

    const component = eatOutAttachableItemToComponent(item, 0);
    expect(component.macros).toEqual({ protein_g: 40, carbs_g: 70, fat_g: 18 });
    expect(component.food_object_id).toBe('food-bowl');
    expect(component.nutrition_basis).toBe('per_component');

    const back = componentToEatOutAttachableItem(component);
    expect(back).toEqual(item);
  });
});

// ============================================================================
// Imported draft ingredient (partial) → component
// ============================================================================

describe('imported draft ingredient → component', () => {
  it('is partial without a match: null nutrition, none status, needs review', () => {
    const component = importedDraftIngredientToComponent(
      {
        raw_text: '2 cups spinach',
        normalized_name: 'spinach',
        quantity_value: 2,
        quantity_unit: 'cup',
        preparation_note: null,
      },
      null,
      0
    );
    expect(component.name).toBe('spinach');
    expect(component.raw_text).toBe('2 cups spinach');
    expect(component.calories).toBeNull();
    expect(component.macros).toEqual({ protein_g: null, carbs_g: null, fat_g: null });
    expect(component.match_status).toBe('none');
    expect(component.needs_review).toBe(true);
  });

  it('merges a matched grounding entry: food link, nutrition, no review', () => {
    const match: IngredientMatchEntry = {
      ingredient_index: 0,
      raw_text: '1 cup oats',
      normalized_name: 'oats',
      quantity_value: 1,
      quantity_unit: 'cup',
      preparation_note: null,
      match_status: 'matched',
      confidence: 'high',
      source_kind: 'food_object',
      source_id: 'food-oats',
      source_label: 'Rolled oats',
      per_serving_estimate: { calories: 150, protein_g: 5, carbs_g: 27, fat_g: 3 },
      explanation: null,
    };

    const component = importedDraftIngredientToComponent(
      {
        raw_text: '1 cup oats',
        normalized_name: 'oats',
        quantity_value: 1,
        quantity_unit: 'cup',
        preparation_note: null,
      },
      match,
      0
    );
    expect(component.food_object_id).toBe('food-oats');
    expect(component.calories).toBe(150);
    expect(component.macros).toEqual({ protein_g: 5, carbs_g: 27, fat_g: 3 });
    expect(component.match_status).toBe('matched');
    expect(component.needs_review).toBe(false);
    expect(component.nutrition_basis).toBe('per_serving');
  });
});

// ============================================================================
// Document-level adapters
// ============================================================================

describe('mealTemplateToMealDocument', () => {
  it('produces a confirmed meal document with summed totals and null NDS', () => {
    const template: MealTemplate = {
      id: 'tpl-1',
      name: 'Protein Breakfast',
      items: [
        { id: 'a', name: 'Eggs', calories: 140, macros: { protein: 12, carbs: 1, fat: 10 } },
        { id: 'b', name: 'Toast', calories: 80, macros: { protein: 3, carbs: 15, fat: 1 } },
      ],
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-02T00:00:00Z'),
    };

    const doc = mealTemplateToMealDocument(template);
    expect(doc.kind).toBe('meal');
    expect(doc.review_state).toBe('confirmed');
    expect(doc.components).toHaveLength(2);
    expect(doc.nds).toBeNull();
    expect(doc.totals).toEqual({
      calories: 220,
      macros: { protein_g: 15, carbs_g: 16, fat_g: 11 },
    });
    expect(doc.source.source_type).toBe('saved_meal');
    expect(doc.source.source_template_id).toBe('tpl-1');
    expect(MealDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe('plannedMealToMealDocument', () => {
  it('passes NDS through verbatim and reads totals from payload', () => {
    const planned: PlannedMeal = {
      id: 'pm-1',
      plan_id: 'plan-1',
      plan_day_id: 'day-1',
      plan_slot_id: 'slot-1',
      person_id: 'person-1',
      name: 'Lunch',
      meal_type: 'lunch',
      payload: {
        items: [
          {
            name: 'Salmon',
            quantity: 1,
            unit: 'serving',
            food_object_id: 'food-salmon',
            calories: 300,
            macros: { protein: 34, carbs: 0, fat: 18 },
          },
        ],
        totals: { calories: 300, protein_g: 34, carbs_g: 0, fat_g: 18 },
        notes_md: 'Grill it.',
      },
      source_template_id: null,
      source_imported_meal_id: null,
      reusable_provenance: null,
      execution_state: 'pending',
      journal_entry_id: null,
      protein_score_10: 8,
      is_main_meal: true,
      psq_multiplier: 1,
      meal_derived_data: MEAL_DERIVED,
      nds_confidence: 'high',
      nds_version: 'v1',
      classifier_version: 'c1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const doc = plannedMealToMealDocument(planned);
    expect(doc.kind).toBe('meal');
    expect(doc.source.source_type).toBe('planned_meal');
    expect(doc.source.source_planned_meal_id).toBe('pm-1');
    expect(doc.totals).toEqual({
      calories: 300,
      macros: { protein_g: 34, carbs_g: 0, fat_g: 18 },
    });
    expect(doc.nds?.nds_confidence).toBe('high');
    expect(doc.prep_notes).toBe('Grill it.');
    expect(doc.components[0].food_object_id).toBe('food-salmon');
    expect(MealDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe('eatOutPayloadToMealDocument', () => {
  it('builds a needs_review meal document with caller-supplied title', () => {
    const payload: EatOutAttachablePayload = {
      meal_type: 'dinner',
      items: [
        {
          name: 'Pad Thai',
          quantity: 1,
          unit: 'serving',
          calories: 700,
          macros: { protein_g: 25, carbs_g: 90, fat_g: 25 },
          food_object_id: null,
        },
      ],
      totals: { calories: 700, protein_g: 25, carbs_g: 90, fat_g: 25 },
    };

    const doc = eatOutPayloadToMealDocument(payload, { title: 'Thai Place' });
    expect(doc.title).toBe('Thai Place');
    expect(doc.review_state).toBe('needs_review');
    expect(doc.meal_type_hint).toBe('dinner');
    expect(doc.totals?.calories).toBe(700);
    expect(doc.source.source_type).toBe('eat_out');
    expect(MealDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe('importedMealToMealDocumentDraft', () => {
  it('produces a draft (never confirmed) and merges grounding by index', () => {
    const imported: ImportedMeal = {
      id: 'im-1',
      person_id: 'person-1',
      title: 'Imported Bowl',
      source_type: 'url',
      source_url: 'https://example.com/recipe',
      payload: {},
      import_type: 'url',
      source_platform: null,
      raw_input_text: null,
      parse_status: 'parsed',
      parsed_payload_json: {
        title: 'Quinoa Bowl',
        description: 'Hearty bowl',
        servings: 2,
        ingredients: [
          {
            raw_text: '1 cup quinoa',
            normalized_name: 'quinoa',
            quantity_value: 1,
            quantity_unit: 'cup',
            preparation_note: null,
          },
        ],
        steps: [{ step_number: 1, instruction: 'Cook quinoa.' }],
        meal_type_hint: 'lunch',
      },
      nutrition_estimate_json: {
        per_serving: {
          calories: 320,
          protein_g: 12,
          carbs_g: 50,
          fat_g: 6,
          fiber_g: 8,
          added_sugar_g: 0,
        },
        servings: 2,
        confidence: 'medium',
        source: 'parsed_from_recipe',
        notes: null,
      },
      ingredient_match_json: [
        {
          ingredient_index: 0,
          raw_text: '1 cup quinoa',
          normalized_name: 'quinoa',
          quantity_value: 1,
          quantity_unit: 'cup',
          preparation_note: null,
          match_status: 'matched',
          confidence: 'high',
          source_kind: 'food_object',
          source_id: 'food-quinoa',
          source_label: 'Quinoa',
          per_serving_estimate: { calories: 160, protein_g: 6, carbs_g: 27, fat_g: 3 },
          explanation: null,
        },
      ],
      protein_score_10: 5,
      is_main_meal: true,
      psq_multiplier: 1,
      meal_derived_data: MEAL_DERIVED,
      nds_confidence: 'medium',
      nds_version: 'v1',
      classifier_version: 'c1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const doc = importedMealToMealDocumentDraft(imported);
    expect(doc.kind).toBe('recipe'); // has steps
    expect(doc.review_state).toBe('needs_review'); // parsed, not confirmed
    expect(doc.review_state).not.toBe('confirmed');
    expect(doc.title).toBe('Quinoa Bowl');
    expect(doc.yield).toEqual({ servings: 2, confirmed: false });
    expect(doc.recipe_yield_servings).toBe(2);
    expect(doc.components[0].food_object_id).toBe('food-quinoa');
    expect(doc.per_serving?.calories).toBe(320);
    expect(doc.source.source_type).toBe('imported');
    expect(doc.source.source_imported_meal_id).toBe('im-1');
    expect(MealDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

// ============================================================================
// Logged meal group + intake payload
// ============================================================================

describe('mealDocumentToLoggedMealGroup → intake payload', () => {
  it('snapshots components/totals and builds a back-compatible intake payload', () => {
    const template: MealTemplate = {
      id: 'tpl-9',
      name: 'Snack Plate',
      items: [
        { id: 'x', name: 'Apple', calories: 95, macros: { protein: 0, carbs: 25, fat: 0 } },
        { id: 'y', name: 'Peanut Butter', calories: 190, macros: { protein: 8, carbs: 6, fat: 16 } },
      ],
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    };

    const doc = mealTemplateToMealDocument(template);
    const group = mealDocumentToLoggedMealGroup(doc, { consumed_servings: 1 });

    expect(group.name).toBe('Snack Plate');
    expect(group.components).toHaveLength(2);
    expect(group.detached_from_source).toBe(false);
    expect(group.source_template_id).toBe('tpl-9');
    expect(group.totals.calories).toBe(285);
    expect(LoggedMealGroupSchema.safeParse(group).success).toBe(true);

    const payload = loggedMealGroupToIntakePayload(group);
    expect(payload.name).toBe('Snack Plate');
    expect(payload.quantity).toBe(1);
    expect(payload.unit).toBe('serving');
    expect(payload.calories).toBe(285);
    expect(payload.macros).toEqual({ protein: 8, carbs: 31, fat: 16 });
    // The full canonical group rides along for future grouped rendering.
    expect(payload.meal_group).toBe(group);
  });

  it('flags needs_review when any component needs review', () => {
    const draftComponent = importedDraftIngredientToComponent(
      { raw_text: 'a pinch of salt', normalized_name: 'salt', quantity_value: null, quantity_unit: null, preparation_note: null },
      null,
      0
    );
    const group = mealDocumentToLoggedMealGroup({
      schema_version: 1,
      id: 'd1',
      kind: 'meal',
      review_state: 'needs_review',
      title: 'Draft Meal',
      description: null,
      intents: [],
      meal_type_hint: null,
      components: [draftComponent],
      yield: null,
      recipe_yield_servings: null,
      serving_label: null,
      prep_notes: null,
      per_serving: null,
      totals: { calories: null, macros: { protein_g: null, carbs_g: null, fat_g: null } },
      source: { source_type: 'imported' },
      nds: null,
      nds_version: null,
      classifier_version: null,
      created_at: null,
      updated_at: null,
    });
    expect(group.needs_review).toBe(true);
  });
});
