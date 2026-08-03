/**
 * Meal Object Foundation — Packet 1: Zod Validators (contract only)
 *
 * Runtime-validatable schemas for the canonical meal contract in ./types.
 * Mirrors the established Plans validator pattern (lib/plans/validators.ts).
 *
 * SCOPE / SAFETY: these schemas are NOT wired into any API or write path in
 * P1. They exist so future packets (and tests) can validate canonical objects
 * at trust boundaries. Keeping schema and types in lockstep is enforced by the
 * `satisfies` checks at the bottom of this file.
 */

import { z } from 'zod';

import type {
  CanonicalMacros,
  GroupedMealEntryPayload,
  LoggedMealGroup,
  MealComponent,
} from './types';

// ============================================================================
// Primitives
// ============================================================================

export const CanonicalMacrosSchema = z.object({
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  fiber_g: z.number().nullable().optional(),
  added_sugar_g: z.number().nullable().optional(),
});

export const MealNutritionSchema = z.object({
  calories: z.number().nullable(),
  macros: CanonicalMacrosSchema,
});

export const MealNutritionBasisSchema = z.enum(['per_component', 'per_serving']);

export const HouseholdMeasureSchema = z.object({
  unit: z.string(),
  grams: z.number(),
  label: z.string().optional(),
});

export const MealMatchStatusSchema = z.enum(['matched', 'partial', 'guessed', 'none']);

export const MealComponentSourceKindSchema = z.enum([
  'food_object',
  'heuristic_guess',
  'default_guess',
  'user_entered',
]);

export const MealComponentKindSchema = z.enum([
  'food_concept',
  'product_variant',
  'recipe_document',
  'user_entered',
  'prepared_batch',
]);

export const MealTypeHintSchema = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'unknown',
]);

export const MealComponentDisplaySnapshotSchema = z.object({
  title: z.string(),
  serving_label: z.string().nullable().optional(),
  yield_servings: z.number().nullable().optional(),
  kind: z.enum(['recipe', 'meal']).optional(),
});

export const MealComponentNutritionSnapshotSchema = z.object({
  per_serving: MealNutritionSchema.nullable(),
  nutrition_status: z
    .enum(['calculated', 'imported', 'user_entered', 'unavailable', 'stale', 'unknown'])
    .nullable()
    .optional(),
  status: z.enum(['available', 'estimated', 'unavailable']),
});

// ============================================================================
// MealComponent
// ============================================================================

/**
 * Package 5A: `.passthrough()` preserves unknown compatibility-safe fields on
 * round-trip. Strict enum sets remain unchanged — legacy invalid enums are
 * normalized before this schema runs.
 */
export const MealComponentSchema = z
  .object({
    component_id: z.string(),
    name: z.string(),
    component_kind: MealComponentKindSchema.optional(),
    raw_text: z.string().nullable().optional(),
    normalized_name: z.string().nullable().optional(),
    preparation_note: z.string().nullable().optional(),

    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    quantity_g: z.number().nullable().optional(),

    food_object_id: z.string().nullable(),
    serving_size_g: z.number().nullable().optional(),
    measures: z.array(HouseholdMeasureSchema).optional(),

    recipe_meal_document_id: z.string().nullable().optional(),
    recipe_version_token: z.string().nullable().optional(),
    display_snapshot: MealComponentDisplaySnapshotSchema.nullable().optional(),
    nutrition_snapshot: MealComponentNutritionSnapshotSchema.nullable().optional(),

    calories: z.number().nullable(),
    macros: CanonicalMacrosSchema,
    nutrition_basis: MealNutritionBasisSchema,

    match_status: MealMatchStatusSchema,
    source_kind: MealComponentSourceKindSchema,

    needs_review: z.boolean(),
  })
  .passthrough()
  .superRefine((component, ctx) => {
    if (component.component_kind === 'recipe_document') {
      const recipeId = component.recipe_meal_document_id;
      if (typeof recipeId !== 'string' || recipeId.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recipe_meal_document_id'],
          message: 'recipe_document components require recipe_meal_document_id',
        });
      }
      const version = component.recipe_version_token;
      if (typeof version !== 'string' || version.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recipe_version_token'],
          message: 'recipe_document components require recipe_version_token',
        });
      }
    }
  });

// ============================================================================
// MealDocument
// ============================================================================

export const MealDocumentKindSchema = z.enum(['recipe', 'meal']);
export const MealReviewStateSchema = z.enum(['draft', 'needs_review', 'confirmed']);
export const MealLifecycleStateSchema = z.enum(['active', 'archived']);
export const MealNutritionStatusSchema = z.enum([
  'calculated',
  'imported',
  'user_entered',
  'unavailable',
  'stale',
  'unknown',
]);

export const MealDocumentIntentSchema = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'dessert',
  'drink',
  'side',
  'sauce',
  'condiment',
  'recipe',
  'meal',
  'other',
]);

export const MealSourceTypeSchema = z.enum([
  'manual',
  'url',
  'video',
  'photo',
  'label',
  'menu',
  'barcode',
  'chat',
  'saved_meal',
  'planned_meal',
  'imported',
  'eat_out',
]);

export const MealSourceSchema = z.object({
  source_type: MealSourceTypeSchema,
  source_url: z.string().nullable().optional(),
  source_imported_meal_id: z.string().nullable().optional(),
  source_template_id: z.string().nullable().optional(),
  source_planned_meal_id: z.string().nullable().optional(),
  // P4 — imported provenance preserved verbatim from the source draft.
  import_type: z.string().nullable().optional(),
  source_platform: z.string().nullable().optional(),
  raw_input_text: z.string().nullable().optional(),
});

export const MealStepSchema = z.object({
  step_number: z.number(),
  instruction: z.string(),
});

export const MealYieldSchema = z.object({
  servings: z.number().nullable(),
  yield_label: z.string().nullable().optional(),
  confirmed: z.boolean(),
});

export const MealPortionSchema = z.object({
  servings: z.number().nullable(),
  label: z.string().nullable().optional(),
  grams: z.number().nullable().optional(),
});

/**
 * NDS shape passthrough. Permissive: NDS is owned by lib/nds and validated
 * there; here we only assert presence of the meal-level fields when an NDS
 * block is supplied. `meal_derived_data` is left as a loose record so this
 * validator never duplicates NDS's source of truth.
 */
export const MealNDSPassthroughSchema = z.object({
  protein_score_10: z.number().nullable(),
  is_main_meal: z.boolean(),
  psq_multiplier: z.number(),
  meal_derived_data: z.record(z.string(), z.unknown()),
  nds_confidence: z.enum(['high', 'medium', 'low']),
});

export const MealDocumentSchema = z
  .object({
    schema_version: z.number(),
    document_version: z.number().int().positive().optional(),
    id: z.string().nullable(),
    person_id: z.string().nullable().optional(),

    kind: MealDocumentKindSchema,
    review_state: MealReviewStateSchema,

    // Package 3 — optional; absent on legacy rows ⇒ active / derive status.
    lifecycle_state: MealLifecycleStateSchema.optional(),
    archived_at: z.string().nullable().optional(),
    nutrition_status: MealNutritionStatusSchema.nullable().optional(),

    title: z.string(),
    description: z.string().nullable(),

    intents: z.array(MealDocumentIntentSchema),
    meal_type_hint: MealTypeHintSchema.nullable(),

    components: z.array(MealComponentSchema),
    steps: z.array(MealStepSchema).optional(),

    yield: MealYieldSchema.nullable(),
    recipe_yield_servings: z.number().nullable(),
    serving_label: z.string().nullable(),
    prep_notes: z.string().nullable(),

    per_serving: MealNutritionSchema.nullable(),
    totals: MealNutritionSchema.nullable(),

    source: MealSourceSchema,

    nds: MealNDSPassthroughSchema.nullable(),
    nds_version: z.string().nullable(),
    classifier_version: z.string().nullable(),

    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
  })
  .passthrough();

// ============================================================================
// LoggedMealGroup + grouped intake payload
// ============================================================================

export const MealInstanceEditModeSchema = z.enum(['instance_only', 'update_source']);

export const LoggedMealGroupSchema = z.object({
  schema_version: z.number(),
  name: z.string(),

  source_meal_document_id: z.string().nullable(),
  source_imported_meal_id: z.string().nullable(),
  source_planned_meal_id: z.string().nullable(),
  source_template_id: z.string().nullable(),

  components: z.array(MealComponentSchema),
  steps: z.array(MealStepSchema).optional(),

  totals: MealNutritionSchema,

  planned_servings: z.number().nullable(),
  consumed_servings: z.number(),
  prepared_servings: z.number().nullable().optional(),

  detached_from_source: z.boolean(),
  edit_mode: MealInstanceEditModeSchema.optional(),

  instance_notes: z.string().nullable().optional(),
  needs_review: z.boolean(),
  logged_as_planned: z.boolean().optional(),
});

export const GroupedMealEntryPayloadSchema = z.object({
  name: z.string(),
  calories: z.number().optional(),
  macros: z
    .object({
      protein: z.number().optional(),
      carbs: z.number().optional(),
      fat: z.number().optional(),
    })
    .optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  source_planned_meal_id: z.string().optional(),
  logged_as_planned: z.boolean().optional(),
  meal_group: LoggedMealGroupSchema.optional(),
});

// ============================================================================
// Type lockstep guards — fail to compile if a core schema drifts from the type.
//
// Limited to the structurally-simple types. MealDocument is intentionally not
// guarded here because its `nds.meal_derived_data` field is owned and typed by
// lib/nds (MealDerivedData); this validator keeps it as a loose record on
// purpose so it never duplicates the NDS source of truth.
// ============================================================================

const _macrosCheck = (v: z.infer<typeof CanonicalMacrosSchema>): CanonicalMacros => v;
const _componentCheck = (v: z.infer<typeof MealComponentSchema>): MealComponent => v;
const _loggedGroupCheck = (v: z.infer<typeof LoggedMealGroupSchema>): LoggedMealGroup => v;
const _groupedPayloadCheck = (
  v: z.infer<typeof GroupedMealEntryPayloadSchema>
): GroupedMealEntryPayload => v;

void _macrosCheck;
void _componentCheck;
void _loggedGroupCheck;
void _groupedPayloadCheck;
