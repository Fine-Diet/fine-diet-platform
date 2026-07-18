import type { IntakePayload, MealTemplate, MealTemplateItem } from '@/lib/journal/types';
import type {
  EatOutAttachablePayload,
  ImportedMeal,
  IngredientMatchEntry,
  PlannedMeal,
} from '@/lib/plans/types';
import type { MealDerivedData } from '@/lib/nds/types';

import type { MealComponent, MealDocument } from '../types';
import {
  componentToEatOutAttachableItem,
  componentToIntakePayload,
  componentToMealTemplateItem,
  componentToPlannedMealItem,
  eatOutAttachableItemToComponent,
  eatOutPayloadToMealDocument,
  importedDraftIngredientToComponent,
  importedMealToMealDocumentDraft,
  intakePayloadToComponent,
  loggedMealGroupToIntakePayload,
  macrosFromCompat,
  macrosFromJournal,
  macrosFromSnake,
  macrosToJournal,
  mealDocumentToLoggedMealGroup,
  mealDocumentToPlannedMealPayload,
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

// ============================================================================
// Phase 3 corrective packet — planned-meal item macro compatibility
//
// SlotEditor.templateToPayload historically wrote item-level macros as
// snake `_g` keys ({protein_g, carbs_g, fat_g}); the canonical shape (which
// componentToPlannedMealItem writes and which PlannedMealItemSchema/most
// readers expect) is camelCase ({protein, carbs, fat}). These tests prove
// the read side accepts both without ever double-scaling or dropping data,
// and that the write side now emits canonical camelCase for new rows.
// ============================================================================

describe('macrosFromCompat', () => {
  it('prefers canonical camelCase per-field when both shapes are present', () => {
    expect(
      macrosFromCompat({ protein: 10, protein_g: 999, carbs: 20, carbs_g: 999, fat: 5, fat_g: 999 })
    ).toEqual({ protein: 10, carbs: 20, fat: 5 });
  });

  it('falls back to legacy snake `_g` keys when camelCase is absent', () => {
    expect(macrosFromCompat({ protein_g: 34, carbs_g: 0, fat_g: 18 })).toEqual({
      protein: 34,
      carbs: 0,
      fat: 18,
    });
  });

  it('mixes shapes per-field (no all-or-nothing requirement)', () => {
    expect(macrosFromCompat({ protein: 10, carbs_g: 20, fat: undefined, fat_g: 5 })).toEqual({
      protein: 10,
      carbs: 20,
      fat: 5,
    });
  });

  it('returns all-null for a missing macros object', () => {
    expect(macrosFromCompat(null)).toEqual({ protein: null, carbs: null, fat: null });
    expect(macrosFromCompat(undefined)).toEqual({ protein: null, carbs: null, fat: null });
  });
});

describe('plannedMealItemToComponent macro compatibility (via plannedMealToMealDocument)', () => {
  function plannedMealWithItem(itemOverrides: Record<string, unknown>): PlannedMeal {
    return {
      id: 'pm-compat',
      plan_id: 'plan-1',
      plan_day_id: 'day-1',
      plan_slot_id: 'slot-1',
      person_id: 'person-1',
      name: 'Lunch',
      meal_type: 'lunch',
      payload: {
        items: [
          {
            name: 'Chicken breast',
            quantity: 1,
            unit: 'serving',
            calories: 165,
            ...itemOverrides,
          },
        ],
        totals: { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 },
      },
      source_template_id: 'template-legacy',
      source_imported_meal_id: null,
      reusable_provenance: null,
      execution_state: 'pending',
      journal_entry_id: null,
      protein_score_10: 7,
      is_main_meal: true,
      psq_multiplier: 1,
      meal_derived_data: MEAL_DERIVED,
      nds_confidence: 'high',
      nds_version: null,
      classifier_version: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
  }

  // plannedMealToMealDocument is the ONE function both the Edit Ingredients
  // composer (PlanMealComposerPanel) and Adjust & Log
  // (PlannedMealAdjustComposer, plannedMealExecutionPayload) call to build
  // the MealComponent[] they operate on — so proving it here proves both
  // consumers receive the same, correct macros.
  it('Edit Ingredients / Adjust & Log: reads existing legacy snake-case item macros correctly', () => {
    const doc = plannedMealToMealDocument(
      plannedMealWithItem({ macros: { protein_g: 31, carbs_g: 0, fat_g: 4 } })
    );
    expect(doc.components[0].macros).toEqual({ protein_g: 31, carbs_g: 0, fat_g: 4 });
  });

  it('Edit Ingredients / Adjust & Log: reads new canonical camelCase item macros correctly', () => {
    const doc = plannedMealToMealDocument(
      plannedMealWithItem({ macros: { protein: 31, carbs: 0, fat: 4 } })
    );
    expect(doc.components[0].macros).toEqual({ protein_g: 31, carbs_g: 0, fat_g: 4 });
  });

  it('NDS component coverage (coverageForMealItems) recognizes both macro shapes', () => {
    const camelItem = { food_object_id: null, calories: 0, macros: { protein: 31, carbs: 0, fat: 4 } };
    const snakeItem = { food_object_id: null, calories: 0, macros: { protein_g: 31, carbs_g: 0, fat_g: 4 } };
    // Both shapes must classify as "estimate" (has macros, no food_object_id)
    // rather than "ai_or_text" (no usable nutrition at all) — verified via
    // the shared macrosFromCompat normalization directly, since importing
    // lib/plans/ndsConfidence here would need its own test file for the
    // full coverage/confidence mapping (see lib/plans/__tests__/ndsConfidence.test.ts).
    expect(macrosFromCompat(camelItem.macros)).toEqual(macrosFromCompat(snakeItem.macros));
  });

  it('canonical round trip (camelCase write → read → write) does not double-scale nutrition', () => {
    // Simulates: new template-originated item (canonical camelCase) is
    // opened in the composer, edited, and saved back. The contribution
    // written on the second pass must equal the first pass, never doubled.
    const first = plannedMealToMealDocument(
      plannedMealWithItem({
        food_object_id: 'food-chicken',
        macros: { protein: 31, carbs: 0, fat: 4 },
      })
    );
    const payload = mealDocumentToPlannedMealPayload(first) as {
      items: Array<{ calories?: number; macros?: { protein?: number; carbs?: number; fat?: number } }>;
    };
    expect(payload.items[0].calories).toBe(165);
    expect(payload.items[0].macros).toEqual({ protein: 31, carbs: 0, fat: 4 });

    const second = plannedMealToMealDocument(plannedMealWithItem(payload.items[0] as Record<string, unknown>));
    const payloadAgain = mealDocumentToPlannedMealPayload(second) as {
      items: Array<{ calories?: number; macros?: { protein?: number; carbs?: number; fat?: number } }>;
    };
    expect(payloadAgain.items[0]).toEqual(payload.items[0]);
  });
});

// ============================================================================
// Phase 3 (Plans integration) — composer → planned_meals.payload
// ============================================================================

function groundedComponent(overrides?: Partial<MealComponent>): MealComponent {
  return {
    component_id: 'c1',
    name: 'Salmon',
    quantity: 2,
    unit: 'serving',
    food_object_id: 'food-salmon',
    calories: 150,
    macros: { protein_g: 17, carbs_g: 0, fat_g: 9 },
    nutrition_basis: 'per_serving',
    match_status: 'matched',
    source_kind: 'food_object',
    needs_review: false,
    ...overrides,
  };
}

describe('componentToPlannedMealItem', () => {
  it('writes the scaled contribution, not the stored per-serving base', () => {
    // 2 servings of a 150 cal/serving food → the ITEM should carry 300, the
    // component's own per_serving base (150) must never leak into the item.
    const item = componentToPlannedMealItem(groundedComponent(), {
      calories: 300,
      macros: { protein_g: 34, carbs_g: 0, fat_g: 18 },
    });
    expect(item).toEqual({
      name: 'Salmon',
      quantity: 2,
      unit: 'serving',
      food_object_id: 'food-salmon',
      calories: 300,
      macros: { protein: 34, carbs: 0, fat: 18 },
      match_status: 'matched',
      source_kind: 'food_object',
    });
  });

  it('writes no calories/macros for a null (needs-review) contribution — never invents nutrition', () => {
    const item = componentToPlannedMealItem(
      groundedComponent({ match_status: 'guessed', needs_review: true }),
      null,
    );
    expect(item.calories).toBeUndefined();
    expect(item.macros).toBeUndefined();
    expect(item.needs_review).toBe(true);
    expect(item.match_status).toBe('guessed');
  });

  it('round-trips preparation_note through estimate_note (existing convention)', () => {
    const item = componentToPlannedMealItem(
      groundedComponent({ preparation_note: 'diced' }),
      null,
    );
    expect(item.estimate_note).toBe('diced');
  });

  it('omits needs_review when false (matches the pre-Phase-3 default on read)', () => {
    const item = componentToPlannedMealItem(groundedComponent({ needs_review: false }), null);
    expect(item.needs_review).toBeUndefined();
  });
});

describe('mealDocumentToPlannedMealPayload', () => {
  function blankDoc(overrides?: Partial<MealDocument>): MealDocument {
    return {
      schema_version: 1,
      id: null,
      kind: 'meal',
      review_state: 'confirmed',
      title: 'Lunch',
      description: null,
      intents: [],
      meal_type_hint: null,
      components: [],
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

  it('sums a grounded component into totals using the SAME deterministic recompute the composer already ran', () => {
    const doc = blankDoc({ components: [groundedComponent()] });
    const payload = mealDocumentToPlannedMealPayload(doc) as {
      items: Array<{ calories?: number }>;
      totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
    };
    // 2 servings × 150 cal/serving = 300.
    expect(payload.totals).toEqual({ calories: 300, protein_g: 34, carbs_g: 0, fat_g: 18 });
    expect(payload.items[0].calories).toBe(300);
  });

  /**
   * Corrective fix (Phase 3 authenticated QA — defect plans-vs-log-nutrition-read):
   * this reproduces the exact reported click-path end-to-end — a component
   * built straight from a food-search selection (as addComponentFromSelection
   * / applyGroundingToComponent produce it, with NO quantity/unit typed by
   * the user) must still write real calories/macros and needs_review:false
   * into the planned_meals.payload, not 0/0/0/0 with needs_review:true.
   */
  it('persists nutrition and review-clean state for a resolved food selection with no explicit quantity/unit', () => {
    const freshlyGrounded: MealComponent = {
      component_id: 'c1',
      name: 'Rice',
      // A fresh match now defaults to 1 serving — see componentGrounding.ts.
      quantity: 1,
      unit: 'serving',
      food_object_id: 'food-rice',
      calories: 200,
      macros: { protein_g: 4, carbs_g: 44, fat_g: 0.5 },
      nutrition_basis: 'per_serving',
      match_status: 'matched',
      source_kind: 'food_object',
      needs_review: false,
    };
    const doc = blankDoc({ components: [freshlyGrounded] });
    const payload = mealDocumentToPlannedMealPayload(doc) as {
      items: Array<{ calories?: number; needs_review?: boolean; food_object_id?: string }>;
      totals: { calories: number };
    };
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].food_object_id).toBe('food-rice');
    expect(payload.items[0].calories).toBe(200);
    expect(payload.items[0].needs_review).toBeUndefined();
    expect(payload.totals.calories).toBe(200);
  });

  it('allows an ungrounded (needs-review) component through without blocking or inventing nutrition — progressive grounding', () => {
    const blank: MealComponent = {
      component_id: 'c2',
      name: 'Mystery side',
      quantity: null,
      unit: null,
      food_object_id: null,
      calories: null,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
      nutrition_basis: 'per_component',
      match_status: 'none',
      source_kind: 'user_entered',
      needs_review: true,
    };
    const doc = blankDoc({ components: [groundedComponent(), blank] });
    const payload = mealDocumentToPlannedMealPayload(doc) as {
      items: Array<{ name: string; calories?: number; needs_review?: boolean }>;
      totals: { calories: number };
    };
    expect(payload.items).toHaveLength(2);
    const mystery = payload.items.find((i) => i.name === 'Mystery side');
    expect(mystery?.calories).toBeUndefined();
    expect(mystery?.needs_review).toBe(true);
    // Totals reflect only the safely-recomputed subset (300), never inventing
    // a number for the ungrounded item.
    expect(payload.totals.calories).toBe(300);
  });

  it('maps prep_notes to notes_md only when non-blank', () => {
    expect(mealDocumentToPlannedMealPayload(blankDoc({ prep_notes: '  Grill it.  ' }))).toMatchObject({
      notes_md: 'Grill it.',
    });
    expect(mealDocumentToPlannedMealPayload(blankDoc({ prep_notes: '   ' }))).not.toHaveProperty(
      'notes_md',
    );
  });

  it('round-trips through plannedMealToMealDocument preserving grounding, match_status, needs_review, and notes', () => {
    const doc = blankDoc({
      title: 'Dinner',
      prep_notes: 'Serve warm.',
      components: [
        groundedComponent(),
        {
          component_id: 'c3',
          name: 'Guessed side',
          quantity: 1,
          unit: 'cup',
          food_object_id: 'food-guess',
          calories: 80,
          macros: { protein_g: 2, carbs_g: 10, fat_g: 3 },
          nutrition_basis: 'per_component',
          match_status: 'guessed',
          source_kind: 'heuristic_guess',
          needs_review: true,
        },
      ],
    });

    const payload = mealDocumentToPlannedMealPayload(doc);
    const roundTripped = plannedMealToMealDocument({
      id: 'pm-9',
      plan_id: 'plan-1',
      plan_day_id: 'day-1',
      plan_slot_id: 'slot-1',
      person_id: 'person-1',
      name: doc.title,
      meal_type: 'dinner',
      payload,
      source_template_id: null,
      source_imported_meal_id: null,
      reusable_provenance: null,
      execution_state: 'pending',
      journal_entry_id: null,
      protein_score_10: null,
      is_main_meal: false,
      psq_multiplier: 1,
      meal_derived_data: MEAL_DERIVED,
      nds_confidence: 'low',
      nds_version: null,
      classifier_version: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    const salmon = roundTrippedComponent(roundTripped, 'Salmon');
    expect(salmon.match_status).toBe('matched');
    expect(salmon.food_object_id).toBe('food-salmon');
    expect(salmon.needs_review).toBe(false);

    // The 'guessed' component's contribution is null (untrusted grounding is
    // never silently recomputed — lib/meals/recompute.ts policy), so its
    // nutrition is intentionally NOT preserved numerically, but its
    // match_status/needs_review/food_object_id fidelity IS.
    const guessedSide = roundTrippedComponent(roundTripped, 'Guessed side');
    expect(guessedSide.match_status).toBe('guessed');
    expect(guessedSide.needs_review).toBe(true);
    expect(guessedSide.food_object_id).toBe('food-guess');

    expect(roundTripped.prep_notes).toBe('Serve warm.');
  });

  function roundTrippedComponent(doc: MealDocument, name: string): MealComponent {
    const found = doc.components.find((c) => c.name === name);
    if (!found) throw new Error(`Expected a component named "${name}"`);
    return found;
  }
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
