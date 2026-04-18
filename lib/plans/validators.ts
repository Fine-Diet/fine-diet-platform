/**
 * Plans — Zod Validators (Phase 1: Contract only)
 *
 * All AI payload shapes for the Plans lane are validated here. Rule:
 * every meal-bearing schema REQUIRES the meal-level NDS derived shape
 * (protein_score_10, is_main_meal, psq_multiplier, meal_derived_data,
 * nds_confidence). Missing NDS fails validation — the AI gateway cannot
 * emit a meal without an NDS projection.
 *
 * These schemas intentionally do not import from lib/nds/* beyond type
 * shapes; NDS computation itself is untouched by this packet.
 */

import { z } from 'zod';

// ============================================================================
// Primitives
// ============================================================================

export const NDSConfidenceSchema = z.enum(['high', 'medium', 'low']);

/**
 * MealDerivedData as written to the DB (meal_derived_data JSONB) and as
 * emitted by computeMealDerivedData() in lib/nds/mealDerived.ts.
 */
export const MealDerivedDataSchema = z.object({
  protein_score_10: z.number().nullable(),
  is_main_meal: z.boolean(),
  meal_calories: z.number(),
  meal_protein_g: z.number(),
  psq_multiplier: z.number(),
});

/**
 * The meal-level NDS derived shape. Required on every meal-bearing entity
 * the AI can emit. Missing any field here is a validation failure.
 */
export const MealNDSShapeSchema = z.object({
  protein_score_10: z.number().nullable(),
  is_main_meal: z.boolean(),
  psq_multiplier: z.number(),
  meal_derived_data: MealDerivedDataSchema,
  nds_confidence: NDSConfidenceSchema,
});

/** NDS subscore map (0-10 values, all optional for partial targets/deltas). */
export const NDSSubscoresPartialSchema = z.object({
  wfr_10: z.number().optional(),
  ps_10: z.number().optional(),
  pnd_10: z.number().optional(),
  fp_10: z.number().optional(),
  as_10: z.number().optional(),
  mnc_10: z.number().optional(),
  ob_10: z.number().optional(),
});

/** Full NDS subscore map (all required). */
export const NDSSubscoresFullSchema = z.object({
  wfr_10: z.number(),
  ps_10: z.number(),
  pnd_10: z.number(),
  fp_10: z.number(),
  as_10: z.number(),
  mnc_10: z.number(),
  ob_10: z.number(),
});

/**
 * NDS delta for a substitution. before + after are required (both carry
 * full MealNDSShape). Either delta estimate may be null if the projection
 * can't be resolved.
 */
export const NDSDeltaSchema = z.object({
  before: MealNDSShapeSchema,
  after: MealNDSShapeSchema,
  delta_nds_100_estimate: z.number().nullable(),
  delta_subscores_10: NDSSubscoresPartialSchema,
});

// ============================================================================
// Planned meal payload (structural — items + totals)
// ============================================================================

/**
 * Shape of planned_meals.payload. Items may reference food_objects or be
 * AI-estimated; the Zod contract is permissive on the item field set but
 * strict on totals so meal-derived math always has something to chew on.
 */
export const PlannedMealItemSchema = z.object({
  name: z.string(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  food_object_id: z.string().uuid().optional().nullable(),
  serving_size_g: z.number().optional(),
  calories: z.number().optional(),
  macros: z
    .object({
      protein: z.number().optional(),
      carbs: z.number().optional(),
      fat: z.number().optional(),
    })
    .optional(),
  /** Free-text note when the AI couldn't resolve a food_object. */
  estimate_note: z.string().optional(),
});

export const PlannedMealPayloadSchema = z.object({
  items: z.array(PlannedMealItemSchema),
  totals: z.object({
    calories: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
  }),
  /** Free-form AI notes about the meal (e.g. prep hints). */
  notes_md: z.string().optional(),
});

// ============================================================================
// AI payload: plan generation
// ============================================================================

export const AiPlannedMealSchema = MealNDSShapeSchema.and(
  z.object({
    name: z.string(),
    meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
    payload: PlannedMealPayloadSchema,
    source_imported_meal_id: z.string().uuid().nullable().optional(),
  })
);

export const AiPlanSlotSchema = z.object({
  slot_block: z.enum(['morning', 'midday', 'evening']).nullable(),
  slot_ordinal: z.number().int().nonnegative(),
  slot_label: z.string().nullable().optional(),
  target_time: z.string().nullable().optional(),
  planned_meals: z.array(AiPlannedMealSchema),
});

export const AiProjectedDailyNDSSchema = z.object({
  projected_nds_100: z.number().min(0).max(100).nullable(),
  projected_wfr_10: z.number().min(0).max(10).nullable(),
  projected_ps_10: z.number().min(0).max(10).nullable(),
  projected_pnd_10: z.number().min(0).max(10).nullable(),
  projected_fp_10: z.number().min(0).max(10).nullable(),
  projected_as_10: z.number().min(0).max(10).nullable(),
  projected_mnc_10: z.number().min(0).max(10).nullable(),
  projected_ob_10: z.number().min(0).max(10).nullable(),
  projection_confidence: NDSConfidenceSchema.nullable(),
});

export const AiPlanDaySchema = z.object({
  date_local: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_local must be YYYY-MM-DD'),
  projected_daily_nds: AiProjectedDailyNDSSchema,
  notes: z.string().nullable().optional(),
  slots: z.array(AiPlanSlotSchema),
});

/** Input snapshot carried into the AI gateway. Structural. */
export const PlanInputSnapshotSchema = z.object({
  body: z.object({
    age_years: z.number().nullable(),
    sex: z.enum(['male', 'female', 'unspecified']).nullable(),
    height_cm: z.number().nullable(),
    weight_kg: z.number().nullable(),
    weight_as_of: z.string().nullable(),
    body_fat_percent: z.number().nullable(),
  }),
  preferences: z.object({
    dining_out_frequency: z
      .enum(['never', 'rarely', 'weekly', 'multiple_per_week', 'daily'])
      .nullable(),
    shopping_mode_preference: z.enum(['instacart', 'in_store', 'mixed']).nullable(),
    household_size: z.number().nullable(),
    eating_window: z.string().nullable(),
    eating_window_start: z.string().nullable(),
    eating_window_end: z.string().nullable(),
    dietary_style: z.string().nullable(),
    allergies: z.array(z.string()).nullable(),
  }),
  targets: z.object({
    daily_calorie_goal: z.number().nullable(),
    macro_goals: z
      .object({ protein_g: z.number(), carbs_g: z.number(), fat_g: z.number() })
      .nullable(),
    nds_score_100_target: z.number().nullable(),
    subscore_floors_10: NDSSubscoresPartialSchema.nullable(),
  }),
  program_guidance: z.array(z.unknown()).nullable(),
});

export const AiPlanGenerationRequestSchema = z.object({
  plan_shape: z.enum(['day', 'week', 'multi_day']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  input_snapshot: PlanInputSnapshotSchema,
  /** Optional free-form prompt from the user ("more plant-forward this week"). */
  user_prompt: z.string().nullable().optional(),
});

export const AiPlanGenerationResponseSchema = z.object({
  title: z.string(),
  plan_shape: z.enum(['day', 'week', 'multi_day']),
  plan_days: z.array(AiPlanDaySchema).min(1),
  /** Rationale to surface in the UI. */
  rationale_md: z.string().nullable().optional(),
});

// ============================================================================
// AI payload: substitution
// ============================================================================

export const AiSubstitutionRequestSchema = z.object({
  planned_meal_id: z.string().uuid(),
  current_meal: AiPlannedMealSchema,
  /** Optional user preferences for the swap ("higher protein", "no dairy"). */
  constraints: z
    .object({
      prefer_higher_subscore: z
        .enum(['wfr_10', 'ps_10', 'pnd_10', 'fp_10', 'as_10', 'mnc_10', 'ob_10'])
        .nullable()
        .optional(),
      avoid: z.array(z.string()).optional(),
      max_calories: z.number().optional(),
    })
    .optional(),
  input_snapshot: PlanInputSnapshotSchema,
});

export const AiSubstitutionResponseSchema = z.object({
  replacement_meal: AiPlannedMealSchema,
  rationale_md: z.string().nullable().optional(),
  nds_delta: NDSDeltaSchema,
});

// ============================================================================
// AI payload: restaurant / eat-out recommendation
// ============================================================================

export const EatOutRecommendationItemSchema = z.object({
  item_name: z.string(),
  projected_meal_derived_data: MealDerivedDataSchema,
  nds_confidence: NDSConfidenceSchema,
  rationale_md: z.string().nullable(),
});

export const EatOutRecommendationPayloadSchema = z.object({
  recommended_items: z.array(EatOutRecommendationItemSchema),
  avoid_items: z.array(EatOutRecommendationItemSchema),
  overall_rationale_md: z.string().nullable(),
});

export const AiRestaurantRecRequestSchema = z.object({
  restaurant_name: z.string(),
  menu_source_url: z.string().url().nullable().optional(),
  imported_menu_id: z.string().uuid().nullable().optional(),
  /** When the user plans to eat (affects ordering). */
  scheduled_at: z.string().nullable().optional(),
  input_snapshot: PlanInputSnapshotSchema,
});

export const AiRestaurantRecResponseSchema = z.object({
  recommendation: EatOutRecommendationPayloadSchema,
});

// ============================================================================
// AI payload: menu parse
// ============================================================================

export const AiMenuParseRequestSchema = z.object({
  restaurant_name: z.string(),
  source_type: z.enum(['url', 'manual_paste', 'photo', 'other']),
  source_url: z.string().nullable().optional(),
  raw_text: z.string().nullable().optional(),
});

export const ParsedMenuItemSchema = z.object({
  item_name: z.string(),
  section: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  price_cents: z.number().int().nullable().optional(),
});

export const AiMenuParseResponseSchema = z.object({
  restaurant_name: z.string(),
  items: z.array(ParsedMenuItemSchema),
});

// ============================================================================
// AI payload: recipe / meal import
// ============================================================================

export const AiMealImportRequestSchema = z.object({
  source_type: z.enum(['url', 'video', 'manual', 'photo', 'chat']),
  source_url: z.string().nullable().optional(),
  raw_text: z.string().nullable().optional(),
  user_hint: z.string().nullable().optional(),
});

/**
 * An imported meal MUST include the meal-level NDS shape. This is the
 * enforcement point for the packet rule: "missing NDS fails validation".
 */
export const AiMealImportResponseSchema = MealNDSShapeSchema.and(
  z.object({
    title: z.string(),
    source_type: z.enum(['url', 'video', 'manual', 'photo', 'chat']),
    source_url: z.string().nullable(),
    payload: PlannedMealPayloadSchema,
  })
);

// ============================================================================
// AI payload: grocery list
// ============================================================================

export const AiGroceryItemSchema = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  aisle_category: z.string().nullable(),
  food_object_id: z.string().uuid().nullable().optional(),
  source_planned_meal_ids: z.array(z.string().uuid()).default([]),
  notes: z.string().nullable().optional(),
});

export const AiGroceryListRequestSchema = z.object({
  plan_id: z.string().uuid(),
  date_range_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_range_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(['manual', 'print', 'instacart', 'other']),
  /** Planned meals to consume for the list, with their NDS shape preserved. */
  planned_meals: z.array(AiPlannedMealSchema),
});

export const AiGroceryListResponseSchema = z.object({
  title: z.string().nullable().optional(),
  items: z.array(AiGroceryItemSchema),
});

// ============================================================================
// AI payload: NDS optimize
// ============================================================================

export const AiNDSOptimizeRequestSchema = z.object({
  plan_id: z.string().uuid(),
  target: z.object({
    nds_score_100_min: z.number().nullable(),
    subscore_floors_10: NDSSubscoresPartialSchema.nullable(),
  }),
  /** Current plan days + their planned meals (each with MealNDSShape). */
  plan_days: z.array(AiPlanDaySchema),
  input_snapshot: PlanInputSnapshotSchema,
});

export const AiNDSOptimizeResponseSchema = z.object({
  /** Proposed per-meal swaps. Each carries a full NDS delta. */
  proposed_substitutions: z.array(
    z.object({
      planned_meal_id: z.string().uuid(),
      replacement_meal: AiPlannedMealSchema,
      rationale_md: z.string().nullable(),
      nds_delta: NDSDeltaSchema,
    })
  ),
  /** Expected projected daily NDS after applying all swaps. */
  projected_daily_nds_after: z.array(
    z.object({
      date_local: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      projected_daily_nds: AiProjectedDailyNDSSchema,
    })
  ),
  overall_rationale_md: z.string().nullable(),
});

// ============================================================================
// ProgramPlanGuidance payload
// ============================================================================

export const ProgramPlanGuidancePayloadSchema = z.object({
  emphasize: z.array(z.string()),
  avoid: z.array(z.string()),
  macro_targets: z
    .object({
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    })
    .nullable(),
  nds_targets: z
    .object({
      nds_score_100_min: z.number().nullable(),
      subscore_floors_10: NDSSubscoresPartialSchema.nullable(),
    })
    .nullable(),
  notes_md: z.string().nullable(),
});

// ============================================================================
// BodyMeasurement input
// ============================================================================

export const BodyMeasurementInputSchema = z.object({
  measurement_type: z.enum([
    'weight',
    'height',
    'body_fat_percent',
    'waist_cm',
    'hip_cm',
    'neck_cm',
    'other',
  ]),
  value_numeric: z.number(),
  unit: z.string(),
  display_value_numeric: z.number().nullable().optional(),
  display_unit: z.string().nullable().optional(),
  measured_at: z.string().optional(),
  source: z.enum(['manual', 'device', 'estimate', 'import']).default('manual'),
  notes: z.string().nullable().optional(),
});

// ============================================================================
// Convenience inferred types (for consumers of this module)
// ============================================================================

export type AiPlannedMeal = z.infer<typeof AiPlannedMealSchema>;
export type AiPlanDay = z.infer<typeof AiPlanDaySchema>;
export type AiPlanGenerationRequest = z.infer<typeof AiPlanGenerationRequestSchema>;
export type AiPlanGenerationResponse = z.infer<typeof AiPlanGenerationResponseSchema>;
export type AiSubstitutionRequest = z.infer<typeof AiSubstitutionRequestSchema>;
export type AiSubstitutionResponse = z.infer<typeof AiSubstitutionResponseSchema>;
export type AiRestaurantRecRequest = z.infer<typeof AiRestaurantRecRequestSchema>;
export type AiRestaurantRecResponse = z.infer<typeof AiRestaurantRecResponseSchema>;
export type AiMenuParseRequest = z.infer<typeof AiMenuParseRequestSchema>;
export type AiMenuParseResponse = z.infer<typeof AiMenuParseResponseSchema>;
export type AiMealImportRequest = z.infer<typeof AiMealImportRequestSchema>;
export type AiMealImportResponse = z.infer<typeof AiMealImportResponseSchema>;
export type AiGroceryListRequest = z.infer<typeof AiGroceryListRequestSchema>;
export type AiGroceryListResponse = z.infer<typeof AiGroceryListResponseSchema>;
export type AiNDSOptimizeRequest = z.infer<typeof AiNDSOptimizeRequestSchema>;
export type AiNDSOptimizeResponse = z.infer<typeof AiNDSOptimizeResponseSchema>;
export type BodyMeasurementInput = z.infer<typeof BodyMeasurementInputSchema>;
