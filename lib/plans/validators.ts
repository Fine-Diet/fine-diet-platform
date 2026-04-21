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

// ============================================================================
// Phase 3: meal schedule ownership
// ============================================================================

export const MealSlotKeySchema = z.enum([
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
  'evening_snack',
]);

/** HH:mm, 24-hour clock. Validated for shape; full clamping is the resolver's job. */
const HHmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm required');

export const MealScheduleSlotSchema = z.object({
  enabled: z.boolean(),
  target_time: HHmmSchema,
  label: z.string().nullable(),
});

export const MealScheduleSchema = z.object({
  version: z.literal(1),
  slots: z.object({
    breakfast: MealScheduleSlotSchema,
    morning_snack: MealScheduleSlotSchema,
    lunch: MealScheduleSlotSchema,
    afternoon_snack: MealScheduleSlotSchema,
    dinner: MealScheduleSlotSchema,
    evening_snack: MealScheduleSlotSchema,
  }),
  updated_at: z.string(),
});

export const ProgramScheduleOverrideSchema = z.object({
  require_slots: z.array(MealSlotKeySchema).default([]),
  disallow_slots: z.array(MealSlotKeySchema).default([]),
  constraints: z
    .object({
      no_earlier_than: HHmmSchema.optional(),
      no_later_than: HHmmSchema.optional(),
      min_gap_minutes: z.number().int().nonnegative().optional(),
      max_eating_window_minutes: z.number().int().positive().optional(),
    })
    .nullable()
    .optional(),
  rationale_md: z.string().nullable().optional(),
});

export const ResolvedScheduleSlotSchema = z.object({
  key: MealSlotKeySchema,
  enabled: z.boolean(),
  target_time: HHmmSchema,
  label: z.string(),
  slot_block: z.enum(['morning', 'midday', 'evening']),
  source: z.enum(['profile', 'program_required', 'program_disallowed']),
});

export const ScheduleConflictSchema = z.object({
  kind: z.enum([
    'earliest',
    'latest',
    'min_gap',
    'max_window',
    'required_vs_disabled',
    'eating_window',
  ]),
  slot_key: MealSlotKeySchema.nullable(),
  message: z.string(),
  suggested_adjustment: z
    .object({
      target_time: HHmmSchema.optional(),
      enabled: z.boolean().optional(),
    })
    .nullable(),
});

export const PlanScheduleSnapshotSchema = z.object({
  profile_schedule: MealScheduleSchema,
  resolved_slots: z.array(ResolvedScheduleSlotSchema),
  conflicts: z.array(ScheduleConflictSchema),
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
  schedule_snapshot: PlanScheduleSnapshotSchema.nullable().optional(),
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
// AI payload: restaurant / eat-out recommendation (Packet 5 contract)
// ----------------------------------------------------------------------------
// Locked shape — see Packet 5 §4c. Recommendation options are framed as
// best / better / fallback. The attachable_payload is the exact shape
// downstream slot attach expects (mirrors PlannedMealPayloadSchema
// loosely — we validate it with its own schema here so we can carry
// nullable calories for weakly-parsed menus without loosening the
// attachable payload validator used elsewhere).
// ============================================================================

const EatOutMealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
const EatOutOptionLabelSchema = z.enum(['best', 'better', 'fallback']);

export const EatOutAttachableItemSchema = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  calories: z.number().nullable(),
  macros: z
    .object({
      protein_g: z.number().nullable().optional(),
      carbs_g: z.number().nullable().optional(),
      fat_g: z.number().nullable().optional(),
    })
    .optional(),
  food_object_id: z.string().uuid().nullable().optional(),
});

export const EatOutAttachablePayloadSchema = z.object({
  meal_type: EatOutMealTypeSchema,
  items: z.array(EatOutAttachableItemSchema),
  totals: z.object({
    calories: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
  }),
});

export const EatOutNDSMealSnapshotSchema = z.object({
  protein_score_10: z.number().nullable(),
  is_main_meal: z.boolean().nullable(),
  psq_multiplier: z.number().nullable(),
  meal_derived_data: MealDerivedDataSchema.nullable(),
  nds_confidence: NDSConfidenceSchema,
  nds_version: z.string(),
  classifier_version: z.string(),
});

export const EatOutRecommendationOptionSchema = z.object({
  label: EatOutOptionLabelSchema,
  option_name: z.string(),
  source_menu_item_name: z.string().nullable(),
  rationale_md: z.string(),
  watchouts: z.array(z.string()),
  modification_suggestions: z.array(z.string()),
  attachable_payload: EatOutAttachablePayloadSchema,
  nds_meal_snapshot: EatOutNDSMealSnapshotSchema,
});

export const EatOutRecommendationSlotContextSchema = z.object({
  slot_id: z.string().uuid(),
  plan_date: z.string(),
  target_time: z.string().nullable(),
  meal_type_hint: EatOutMealTypeSchema,
});

export const EatOutRecommendationPayloadSchema = z.object({
  restaurant_name: z.string(),
  slot_context: EatOutRecommendationSlotContextSchema,
  best: EatOutRecommendationOptionSchema.nullable(),
  better: EatOutRecommendationOptionSchema.nullable(),
  fallback: EatOutRecommendationOptionSchema.nullable(),
  global_watchouts: z.array(z.string()),
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
// Phase 4: Imported recipe / meal DRAFT shapes
// ----------------------------------------------------------------------------
// The draft layer is distinct from the attachable planned-meal shape.
// `parsed_payload_json` holds the user-reviewable recipe structure;
// `nutrition_estimate_json` holds the per-serving estimate with provenance;
// `ingredient_match_json` holds ingredient→food_object match confidence.
// These schemas are validated before any insert/update — parse failure
// lands in `manual_review` with raw input preserved, never as untyped prose.
// ============================================================================

export const ImportedMealImportTypeSchema = z.enum(['pasted_text', 'url', 'video']);

export const ImportedMealParseStatusSchema = z.enum([
  'pending',
  'parsed',
  'failed',
  'manual_review',
]);

export const ImportedMealTypeHintSchema = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'unknown',
]);

export const ImportedMealDraftIngredientSchema = z.object({
  raw_text: z.string(),
  normalized_name: z.string().nullable(),
  quantity_value: z.number().nullable(),
  quantity_unit: z.string().nullable(),
  preparation_note: z.string().nullable(),
  /** Packet 24: see ImportedMealDraftIngredient.parse_confidence. */
  parse_confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
  /** Packet 24: see ImportedMealDraftIngredient.quantity_source. */
  quantity_source: z
    .enum(['explicit', 'count_inferred', 'range_midpoint', 'approximated'])
    .nullable()
    .optional(),
});

export const ImportedMealDraftStepSchema = z.object({
  step_number: z.number().int().positive(),
  instruction: z.string().min(1),
});

export const ImportedMealDraftPayloadSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  servings: z.number().nullable(),
  ingredients: z.array(ImportedMealDraftIngredientSchema),
  steps: z.array(ImportedMealDraftStepSchema),
  meal_type_hint: ImportedMealTypeHintSchema,
  /** Packet 21: see ImportedMealDraftPayload.acquisition_mode. */
  acquisition_mode: z
    .enum(['automatic', 'user_assisted', 'none'])
    .nullable()
    .optional(),
  /** Packet 22: see ImportedMealDraftPayload.onscreen_assist. */
  onscreen_assist: z
    .object({
      used: z.boolean(),
      source: z.enum(['user_supplied', 'extractor']).nullable(),
      chars: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  /** Packet 26: see ImportedMealDraftPayload.translated_from_language. */
  translated_from_language: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional(),
  /** Packet 27: see ImportedMealDraftPayload.transcript_source. */
  transcript_source: z
    .enum([
      'youtube_timedtext',
      'youtube_timedtext_asr',
      'youtube_description',
      'youtube_title_only',
      'external_provider',
      'vimeo_text_track',
      'vimeo_oembed_description',
      'user_assisted_caption',
      'unknown',
    ])
    .nullable()
    .optional(),
});

export const NutritionEstimateConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const NutritionEstimatePerServingSchema = z.object({
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number().nullable(),
  added_sugar_g: z.number().nullable(),
});

export const NutritionEstimateSchema = z.object({
  per_serving: NutritionEstimatePerServingSchema,
  servings: z.number().nullable(),
  confidence: NutritionEstimateConfidenceSchema,
  source: z.enum(['parsed_from_recipe', 'ai_estimated', 'user_entered', 'unknown']),
  notes: z.string().nullable(),
});

/**
 * Packet 6 — IngredientMatchRecord schema (locked shape).
 *
 * Zod schema for `imported_meals.ingredient_match_json` rows. We accept
 * legacy Packet 4 fields (`food_object_id`, `match_confidence`,
 * `match_source`, `notes`) as optional so pre-Packet-6 rows deserialize
 * cleanly; new writes populate the Packet 6 fields.
 */
export const IngredientMatchEntrySchema = z.object({
  ingredient_index: z.number().int().nonnegative(),
  raw_text: z.string(),
  normalized_name: z.string().nullable(),
  quantity_value: z.number().nullable(),
  quantity_unit: z.string().nullable(),
  preparation_note: z.string().nullable(),

  match_status: z.enum(['matched', 'partial', 'guessed', 'none']),
  confidence: z.enum(['high', 'medium', 'low']),

  source_kind: z.enum(['food_object', 'heuristic_guess', 'default_guess']),
  source_id: z.string().nullable(),
  source_label: z.string().nullable(),

  per_serving_estimate: z.object({
    calories: z.number().nullable(),
    protein_g: z.number().nullable(),
    carbs_g: z.number().nullable(),
    fat_g: z.number().nullable(),
  }),

  explanation: z.string().nullable(),

  /**
   * Packet 28 — explicit user choice for this row's source. Null /
   * omitted = pure matcher state (no user action). See
   * `IngredientMatchEntry.user_choice` for contract details.
   */
  user_choice: z.enum(['applied', 'rejected']).nullable().optional(),
  applied_at: z.string().datetime({ offset: true }).nullable().optional(),

  food_object_id: z.string().nullable().optional(),
  match_confidence: z.enum(['high', 'medium', 'low', 'none']).optional(),
  match_source: z.enum(['exact_name', 'fuzzy_name', 'manual', 'none']).optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Public POST /api/journal/plans/ai/import-recipe request. At least one of
 * `text` or `url` is required; the endpoint returns 400 otherwise.
 */
export const ImportRecipeRequestSchema = z.object({
  text: z.string().min(1).nullable().optional(),
  url: z.string().url().nullable().optional(),
  source_platform: z.string().nullable().optional(),
  user_hint: z.string().nullable().optional(),
  /**
   * Packet 21 — Short-form social recipe ingestion assist.
   *
   * Optional caption / recipe text supplied by the user alongside a
   * video/social URL when automatic transcript acquisition is not
   * available (e.g. TikTok, Instagram) or returned no captions. The
   * server routes this text through the same normalization and
   * import pipeline as an automatic transcript, but audits it under
   * a distinct `user_assisted` acquisition mode so automatic vs
   * user-supplied paths stay distinguishable.
   *
   * Bounded to 40 000 characters to match the transcript cap used by
   * the acquisition adapters; anything longer is truncated server-side.
   */
  assisted_text: z.string().min(1).max(40_000).nullable().optional(),
  /**
   * Packet 22 — Optional on-screen visible text supplied by the
   * user for a video/social import. Used as the V1 production
   * source for the secondary on-screen acquisition layer; merged
   * into the base text (transcript + assisted caption) before
   * normalization. Bounded to 20 000 chars; anything longer is
   * truncated server-side.
   */
  onscreen_text: z.string().min(1).max(20_000).nullable().optional(),
});

/**
 * PATCH /api/journal/plans/imports/meals/[id] body. All fields optional.
 * `payload` edits propagate into the attachable planned-meal shape;
 * `parsed_payload_json` edits propagate into the draft recipe view.
 */
export const ImportRecipePatchSchema = z.object({
  title: z.string().min(1).optional(),
  source_url: z.string().url().nullable().optional(),
  payload: PlannedMealPayloadSchema.optional(),
  parsed_payload_json: ImportedMealDraftPayloadSchema.nullable().optional(),
  nutrition_estimate_json: NutritionEstimateSchema.nullable().optional(),
  ingredient_match_json: z.array(IngredientMatchEntrySchema).nullable().optional(),
  parse_status: ImportedMealParseStatusSchema.optional(),
});

/**
 * POST /api/journal/plans/imports/meals/[id]/save body. All optional —
 * defaults derive from the imported draft.
 */
export const ImportPromoteRequestSchema = z.object({
  name: z.string().min(1).optional(),
});

// ============================================================================
// Phase 5: Imported menu + Eat-out event request shapes
// ----------------------------------------------------------------------------
// These are the wire shapes for the Packet 5 endpoints. They are kept
// deliberately small: menu parsing quality varies widely so the client
// only owns a restaurant_name + source (text or URL); the server owns
// all section/item parsing + recommendation generation.
// ============================================================================

export const ImportedMenuParseStatusSchema = z.enum([
  'pending',
  'parsed',
  'failed',
  'manual_review',
]);

export const ImportedMenuSectionItemSchema = z.object({
  item_name: z.string(),
  description: z.string().nullable(),
  price_text: z.string().nullable(),
  nutrition_text: z.string().nullable(),
});

export const ImportedMenuSectionSchema = z.object({
  section_name: z.string().nullable(),
  items: z.array(ImportedMenuSectionItemSchema),
});

/** Locked for Packet 5 — §4b. */
export const ImportedMenuPayloadSchema = z.object({
  sections: z.array(ImportedMenuSectionSchema),
});

/**
 * POST /api/journal/plans/ai/import-menu body. At least one of
 * `text` or `url` must be provided.
 */
export const ImportMenuRequestSchema = z
  .object({
    restaurant_name: z.string().min(1).optional(),
    text: z.string().min(1).nullable().optional(),
    url: z.string().url().nullable().optional(),
  })
  .refine(
    (v) =>
      (typeof v.text === 'string' && v.text.trim().length > 0) ||
      (typeof v.url === 'string' && v.url.trim().length > 0),
    {
      message: 'Provide menu text or a menu URL.',
      path: ['text'],
    },
  );

/**
 * PATCH /api/journal/plans/imports/menus/[id] body. Edits to restaurant
 * name, source_url, parse_status, raw_input_text, or the parsed
 * payload. Recommendation regeneration is a separate endpoint.
 */
export const ImportMenuPatchSchema = z.object({
  restaurant_name: z.string().min(1).optional(),
  source_url: z.string().url().nullable().optional(),
  parse_status: ImportedMenuParseStatusSchema.optional(),
  raw_input_text: z.string().nullable().optional(),
  parsed_payload_json: ImportedMenuPayloadSchema.nullable().optional(),
});

/** POST /api/journal/plans/ai/recommend-menu-picks body. */
export const RecommendMenuPicksRequestSchema = z.object({
  imported_menu_id: z.string().uuid(),
  slot_id: z.string().uuid(),
  scheduled_at: z.string().nullable().optional(),
});

/** PATCH /api/journal/plans/eat-out/[id] body. */
export const EatOutEventPatchSchema = z.object({
  venue_name: z.string().min(1).optional(),
  venue_type: z
    .enum(['restaurant', 'friends', 'work', 'travel', 'other'])
    .optional(),
  scheduled_at: z.string().nullable().optional(),
  menu_url: z.string().url().nullable().optional(),
  recommendation_payload_json: EatOutRecommendationPayloadSchema.nullable().optional(),
});

/**
 * POST /api/journal/plans/eat-out/[id]/select body. The user picks one
 * of the recommended options and we attach it into the bound plan slot
 * as a `planned_meal`.
 */
export const EatOutSelectRequestSchema = z.object({
  option_label: z.enum(['best', 'better', 'fallback']),
  meal_name_override: z.string().min(1).nullable().optional(),
});

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
  // Phase 3: optional schedule override. Programs may require / disallow
  // slots and impose time constraints, but never set concrete clock times.
  schedule_override: ProgramScheduleOverrideSchema.nullable().optional(),
});

// ============================================================================
// Packet 7: admin authoring request shapes
//
// Authoring inputs are intentionally lax where the DB accepts lax values
// (e.g. `effective_from` as either null or an ISO date). Payload validation
// itself is strict — the `guidance_payload_json` must always pass
// ProgramPlanGuidancePayloadSchema before save/publish.
// ============================================================================

export const ProgramGuidanceTypeSchema = z.enum([
  'program_template',
  'assignment',
  'person_override',
  'temporary',
  'other',
]);

/** A permissive ISO date (YYYY-MM-DD) or a full ISO timestamp. */
const ISODateOrTimestamp = z.string().refine(
  (s) => {
    if (!s) return false;
    return !Number.isNaN(new Date(s).getTime());
  },
  { message: 'Invalid ISO date/timestamp.' },
);

export const ProgramGuidanceAdminCreateSchema = z.object({
  person_id: z.string().uuid(),
  program_slug: z.string().min(1).max(120),
  program_run_id: z.string().uuid().nullable().optional(),
  guidance_payload_json: ProgramPlanGuidancePayloadSchema,
  active: z.boolean().optional(),
  effective_from: ISODateOrTimestamp.nullable().optional(),
  effective_until: ISODateOrTimestamp.nullable().optional(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  guidance_type: ProgramGuidanceTypeSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const ProgramGuidanceAdminUpdateSchema = z
  .object({
    program_slug: z.string().min(1).max(120).optional(),
    program_run_id: z.string().uuid().nullable().optional(),
    guidance_payload_json: ProgramPlanGuidancePayloadSchema.optional(),
    active: z.boolean().optional(),
    effective_from: ISODateOrTimestamp.nullable().optional(),
    effective_until: ISODateOrTimestamp.nullable().optional(),
    priority: z.number().int().min(-1000).max(1000).optional(),
    guidance_type: ProgramGuidanceTypeSchema.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (patch) => Object.keys(patch).length > 0,
    { message: 'Update must include at least one field.' },
  );

export type ProgramGuidanceAdminCreateInput = z.infer<
  typeof ProgramGuidanceAdminCreateSchema
>;
export type ProgramGuidanceAdminUpdateInput = z.infer<
  typeof ProgramGuidanceAdminUpdateSchema
>;
export type ProgramPlanGuidancePayloadInput = z.infer<
  typeof ProgramPlanGuidancePayloadSchema
>;

// ============================================================================
// Packet 8: program assignment admin authoring shapes
// ============================================================================

export const ProgramAcquisitionSourceSchema = z.enum([
  'offer',
  'purchase',
  'admin_grant',
  'bundle',
  'other',
]);

export const ProgramAssignmentStatusSchema = z.enum([
  'active',
  'inactive',
  'scheduled',
  'completed',
  'cancelled',
]);

const ISODateOrTimestampAssignment = z.string().refine(
  (s) => {
    if (!s) return false;
    return !Number.isNaN(new Date(s).getTime());
  },
  { message: 'Invalid ISO date/timestamp.' },
);

export const ProgramAssignmentCreateSchema = z
  .object({
    person_id: z.string().uuid(),
    program_slug: z.string().min(1).max(120),
    acquisition_source: ProgramAcquisitionSourceSchema.default('admin_grant'),
    status: ProgramAssignmentStatusSchema.default('active'),
    active_from: ISODateOrTimestampAssignment.nullable().optional(),
    active_to: ISODateOrTimestampAssignment.nullable().optional(),
    priority: z.number().int().min(-1000).max(1000).default(0),
    source_ref: z.string().max(200).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (v) => {
      if (!v.active_from || !v.active_to) return true;
      return new Date(v.active_to).getTime() > new Date(v.active_from).getTime();
    },
    { message: 'active_to must be after active_from.' },
  );

export const ProgramAssignmentUpdateSchema = z
  .object({
    program_slug: z.string().min(1).max(120).optional(),
    acquisition_source: ProgramAcquisitionSourceSchema.optional(),
    status: ProgramAssignmentStatusSchema.optional(),
    active_from: ISODateOrTimestampAssignment.nullable().optional(),
    active_to: ISODateOrTimestampAssignment.nullable().optional(),
    priority: z.number().int().min(-1000).max(1000).optional(),
    source_ref: z.string().max(200).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (patch) => Object.keys(patch).length > 0,
    { message: 'Update must include at least one field.' },
  );

export const ProgramAssignmentStatusPatchSchema = z.object({
  status: ProgramAssignmentStatusSchema,
});

export type ProgramAssignmentCreateInput = z.infer<
  typeof ProgramAssignmentCreateSchema
>;
export type ProgramAssignmentUpdateInput = z.infer<
  typeof ProgramAssignmentUpdateSchema
>;
export type ProgramAssignmentStatusPatch = z.infer<
  typeof ProgramAssignmentStatusPatchSchema
>;

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
export type MealScheduleInput = z.infer<typeof MealScheduleSchema>;
export type ProgramScheduleOverrideInput = z.infer<typeof ProgramScheduleOverrideSchema>;
export type PlanScheduleSnapshotInput = z.infer<typeof PlanScheduleSnapshotSchema>;
export type ImportedMealDraftPayloadInput = z.infer<typeof ImportedMealDraftPayloadSchema>;
export type NutritionEstimateInput = z.infer<typeof NutritionEstimateSchema>;
export type IngredientMatchEntryInput = z.infer<typeof IngredientMatchEntrySchema>;
export type ImportRecipeRequest = z.infer<typeof ImportRecipeRequestSchema>;
export type ImportRecipePatch = z.infer<typeof ImportRecipePatchSchema>;
export type ImportPromoteRequest = z.infer<typeof ImportPromoteRequestSchema>;

// Phase 5 inferred types
export type ImportMenuRequest = z.infer<typeof ImportMenuRequestSchema>;
export type ImportMenuPatch = z.infer<typeof ImportMenuPatchSchema>;
export type RecommendMenuPicksRequest = z.infer<
  typeof RecommendMenuPicksRequestSchema
>;
export type EatOutEventPatch = z.infer<typeof EatOutEventPatchSchema>;
export type EatOutSelectRequest = z.infer<typeof EatOutSelectRequestSchema>;
export type ImportedMenuPayloadInput = z.infer<typeof ImportedMenuPayloadSchema>;
