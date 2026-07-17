/**
 * Plans — Shared Types (Phase 1: Contract only)
 *
 * Domain types for the forward-looking Plans lane. Schema and storage details
 * live in scripts/createPlansTables.sql and scripts/sql/createBodyMeasurementsTable.sql.
 *
 * Design rules enforced by this file:
 *   - NDS is a first-class signal. Meal-bearing types carry the meal-derived
 *     NDS shape as REQUIRED fields, not optional.
 *   - NDSConfidence is a Plans-only concept, deliberately distinct from the
 *     food trust signal (FoodResultSource in lib/food/types.ts).
 *   - people vs profile boundary: body state (height, weight) and planning
 *     preferences live in people.metadata (guarded by METADATA_FIELDS in
 *     pages/api/journal/profile.ts). Historical measurements live in
 *     body_measurements.
 *   - Age is derived from date_of_birth, never stored directly.
 *   - This file imports NDS types from lib/nds — it never redefines them.
 */

import type { MealDerivedData, NDSSubscores } from '@/lib/nds/types';

// ============================================================================
// NDS Confidence — Plans-only
// ============================================================================

/**
 * Plans-only confidence in an NDS projection for a single meal or day.
 *
 * Distinct from food trust (FoodResultSource) and from any per-food
 * classifier confidence. High when all inputs resolve to food_objects and
 * the meal-derived computation ran against real nutrient data. Low when
 * many inputs are AI-estimated or free-text.
 */
export type NDSConfidence = 'high' | 'medium' | 'low';

/**
 * The meal-level NDS derived shape. This is the single contract that all
 * meal-bearing Plans entities MUST satisfy:
 *   - PlannedMeal
 *   - ImportedMeal
 *   - PlannedSubstitution (twice: before + after)
 *   - Restaurant recommendation items (per-item projection)
 *
 * Mirrors the meal-derived columns on journal_entries so projected and
 * journaled reality share a single shape.
 */
export interface MealNDSShape {
  /** Meal protein score (0-10). Nullable when inputs can't support a score. */
  protein_score_10: number | null;
  /** True if the meal clears the main-meal kcal threshold (>= 250 kcal). */
  is_main_meal: boolean;
  /** Protein source quality multiplier (0.7-1.0). */
  psq_multiplier: number;
  /** Full derived data block (totals, PSQ breakdown, etc.). */
  meal_derived_data: MealDerivedData;
  /** Plans-only confidence in the projection. */
  nds_confidence: NDSConfidence;
}

// ============================================================================
// NDS Version Stamp
// ============================================================================

/**
 * Every NDS-bearing row in the Plans lane stamps these two values at write
 * time so future version bumps don't silently invalidate historical scores.
 */
export interface NDSVersionStamp {
  nds_version: string;
  classifier_version: string;
}

// ============================================================================
// Plan
// ============================================================================

export type PlanShape = 'day' | 'week' | 'multi_day';
export type PlanSource = 'ai_generated' | 'user_manual' | 'program_template' | 'hybrid';
export type PlanStatus = 'draft' | 'active' | 'archived';

/**
 * Snapshot of the planning inputs captured at plan generation time. Stored
 * as JSONB on plans.input_snapshot_json. Referenced by the AI gateway and
 * by the UI when explaining rationale after the fact.
 */
export interface PlanInputSnapshot {
  // Body state at generation time.
  body: {
    /** Derived from date_of_birth at snapshot time; never persisted raw. */
    age_years: number | null;
    /** Biological sex used for DRIs / MNC calculations. */
    sex: 'male' | 'female' | 'unspecified' | null;
    height_cm: number | null;
    weight_kg: number | null;
    /** ISO timestamp of the most recent body_measurements row for weight. */
    weight_as_of: string | null;
    body_fat_percent: number | null;
  };
  // Planning preferences pulled from people.metadata.
  preferences: {
    dining_out_frequency: 'never' | 'rarely' | 'weekly' | 'multiple_per_week' | 'daily' | null;
    shopping_mode_preference: 'instacart' | 'in_store' | 'mixed' | null;
    household_size: number | null;
    eating_window: string | null;
    eating_window_start: string | null;
    eating_window_end: string | null;
    dietary_style: string | null;
    allergies: string[] | null;
  };
  // Goals the plan was asked to hit.
  targets: {
    daily_calorie_goal: number | null;
    macro_goals: { protein_g: number; carbs_g: number; fat_g: number } | null;
    nds_score_100_target: number | null;
    subscore_floors_10: Partial<NDSSubscores> | null;
  };
  // Program guidance in effect at snapshot time, if any.
  program_guidance: ProgramPlanGuidance[] | null;
  // Phase 3: meal schedule resolved into slot layout.
  // Optional because historical plans generated before Phase 3 don't
  // carry it. New plans always include it.
  schedule_snapshot?: PlanScheduleSnapshot | null;
}

export interface Plan extends NDSVersionStamp {
  id: string;
  person_id: string;

  title: string | null;
  plan_shape: PlanShape;
  source: PlanSource;
  status: PlanStatus;

  start_date: string; // YYYY-MM-DD
  end_date: string | null;

  program_slug: string | null;
  program_run_id: string | null;

  input_snapshot_json: PlanInputSnapshot;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// PlanDay — projected daily NDS
// ============================================================================

/**
 * Projected daily NDS for a plan day. Mirrors the flat-column shape of
 * daily_nds so projection and reality can be compared directly.
 */
export interface ProjectedDailyNDS {
  projected_nds_100: number | null;
  projected_wfr_10: number | null;
  projected_ps_10: number | null;
  projected_pnd_10: number | null;
  projected_fp_10: number | null;
  projected_as_10: number | null;
  projected_mnc_10: number | null;
  projected_ob_10: number | null;
  projection_confidence: NDSConfidence | null;
  projection_debug_json: Record<string, unknown> | null;
}

export interface PlanDay extends NDSVersionStamp, ProjectedDailyNDS {
  id: string;
  plan_id: string;
  person_id: string;

  date_local: string; // YYYY-MM-DD

  notes: string | null;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// PlanSlot — structural
// ============================================================================

export type PlanSlotBlock = 'morning' | 'midday' | 'evening';

export interface PlanSlot {
  id: string;
  plan_day_id: string;
  person_id: string;

  slot_block: PlanSlotBlock | null;
  slot_ordinal: number;
  slot_label: string | null;
  /** HH:mm local time, optional. */
  target_time: string | null;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// PlannedMeal
// ============================================================================

export type PlannedMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';

/**
 * Items + totals in the same shape as journal_entries.payload for intake
 * entries. Using an open-ended record here because the full intake payload
 * schema is enforced by Zod in lib/plans/validators.ts.
 */
export type PlannedMealPayload = Record<string, unknown>;

/** Packet 39 — execution state for a planned meal. */
export type PlannedMealExecutionState = 'pending' | 'eaten' | 'skipped';

export type ReusableInstantiationKind = 'day_template' | 'week_pattern';

export interface ReusablePlanInstantiationProvenance {
  kind: ReusableInstantiationKind;
  id: string;
  name: string | null;
  instantiated_at: string;
  source_plan_id: string;
  source_plan_day_id: string;
  source_date_local: string;
  source_planned_meal_id: string;
  pattern_day_offset?: number | null;
}

export interface PlannedMeal extends NDSVersionStamp, MealNDSShape {
  id: string;
  plan_id: string;
  plan_day_id: string;
  plan_slot_id: string | null;
  person_id: string;

  name: string | null;
  meal_type: PlannedMealType;

  payload: PlannedMealPayload;

  source_template_id: string | null;
  source_imported_meal_id: string | null;
  reusable_provenance: ReusablePlanInstantiationProvenance | null;

  /**
   * Packet 39 — execution state. Defaults to 'pending' for all rows created
   * before the migration (via DEFAULT 'pending' on the column). Populated on
   * new rows via the execute endpoint.
   *   pending — not yet acted on (default)
   *   eaten   — logged to Journal; journal_entry_id is set
   *   skipped — intentionally not eaten; no journal entry
   */
  execution_state: PlannedMealExecutionState;

  /**
   * FK to journal_entries. Set when execution_state='eaten'. Null for
   * pending/skipped. Cleared automatically if the journal entry is deleted
   * (ON DELETE SET NULL on the DB column).
   */
  journal_entry_id: string | null;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// Packet 42 — reusable day plan templates
// ============================================================================

export interface PlanDayTemplateMeal extends NDSVersionStamp, MealNDSShape {
  source_planned_meal_id: string;
  name: string | null;
  meal_type: PlannedMealType;
  payload: PlannedMealPayload;
  source_template_id: string | null;
  source_imported_meal_id: string | null;
}

export interface PlanDayTemplateSlot {
  source_plan_slot_id: string;
  slot_ordinal: number;
  slot_block: PlanSlotBlock | null;
  slot_label: string | null;
  target_time: string | null;
  meals: PlanDayTemplateMeal[];
}

export type PlanDayTemplateApplyPolicy = 'append';

export interface PlanDayTemplate {
  id: string;
  person_id: string;
  name: string;
  scope: 'day';
  source_plan_id: string;
  source_plan_day_id: string;
  source_date_local: string;
  slots: PlanDayTemplateSlot[];
  unassigned_meals?: PlanDayTemplateMeal[];
  apply_policy?: PlanDayTemplateApplyPolicy;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Packet 43 — reusable multi-day / week-pattern templates
// ============================================================================

export interface PlanWeekPatternDay {
  /** Zero-based offset from the pattern start. */
  day_offset: number;
  source_plan_day_id: string;
  source_date_local: string;
  slots: PlanDayTemplateSlot[];
  unassigned_meals?: PlanDayTemplateMeal[];
}

export type PlanWeekPatternApplyPolicy = 'append';

export interface PlanWeekPattern {
  id: string;
  person_id: string;
  name: string;
  scope: 'week_pattern';
  source_plan_id: string;
  source_date_start: string;
  source_date_end: string;
  days: PlanWeekPatternDay[];
  apply_policy?: PlanWeekPatternApplyPolicy;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// PlannedSubstitution — NDS delta is required
// ============================================================================

export type SubstitutionProposedBy = 'ai' | 'user';
export type SubstitutionStatus = 'proposed' | 'accepted' | 'rejected' | 'superseded';

/**
 * Explicit before/after NDS impact for a proposed substitution. Required on
 * every PlannedSubstitution — the UI must be able to show rationale without
 * recomputing anything client-side.
 */
export interface NDSDelta {
  before: MealNDSShape;
  after: MealNDSShape;
  /** Estimated change in projected daily NDS (0-100 scale), if computable. */
  delta_nds_100_estimate: number | null;
  /** Estimated change in each subscore (0-10 scale), if computable. */
  delta_subscores_10: Partial<Record<keyof NDSSubscores, number>>;
}

export interface PlannedSubstitution extends NDSVersionStamp {
  id: string;
  planned_meal_id: string;
  person_id: string;

  proposed_by: SubstitutionProposedBy;
  status: SubstitutionStatus;

  replacement_payload_json: PlannedMealPayload;
  rationale_md: string | null;

  nds_delta_json: NDSDelta;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// PlannedEatOutEvent (Packet 5 contract)
//
// Eat-out planning is a Plans execution flow. An event is bound to a
// specific plan_slot, carries the AI-produced best/better/fallback
// recommendation set, and is the source-of-origin for the slot's
// planned_meal after the user selects an option. The recommendation
// payload keeps food trust distinct from NDS confidence.
// ============================================================================

export type EatOutVenueType = 'restaurant' | 'friends' | 'work' | 'travel' | 'other';

/** Tradeoff framing for a single recommended option within a menu. */
export type EatOutOptionLabel = 'best' | 'better' | 'fallback';

export interface EatOutAttachableItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  calories: number | null;
  macros?: {
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
  };
  food_object_id?: string | null;
}

export interface EatOutAttachablePayload {
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  items: EatOutAttachableItem[];
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
}

export interface EatOutNDSMealSnapshot {
  protein_score_10: number | null;
  is_main_meal: boolean | null;
  psq_multiplier: number | null;
  meal_derived_data: MealDerivedData | null;
  nds_confidence: NDSConfidence;
  nds_version: string;
  classifier_version: string;
}

export interface EatOutRecommendationOption {
  label: EatOutOptionLabel;
  option_name: string;
  source_menu_item_name: string | null;
  rationale_md: string;
  watchouts: string[];
  modification_suggestions: string[];
  attachable_payload: EatOutAttachablePayload;
  nds_meal_snapshot: EatOutNDSMealSnapshot;
}

export interface EatOutRecommendationSlotContext {
  slot_id: string;
  plan_date: string;
  target_time: string | null;
  meal_type_hint: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export interface EatOutRecommendationPayload {
  restaurant_name: string;
  slot_context: EatOutRecommendationSlotContext;
  best: EatOutRecommendationOption | null;
  better: EatOutRecommendationOption | null;
  fallback: EatOutRecommendationOption | null;
  global_watchouts: string[];
}

export interface PlannedEatOutEvent extends NDSVersionStamp {
  id: string;
  plan_day_id: string;
  plan_slot_id: string | null;
  person_id: string;

  venue_name: string;
  venue_type: EatOutVenueType;

  scheduled_at: string | null;
  menu_url: string | null;
  imported_menu_id: string | null;

  recommendation_payload_json: EatOutRecommendationPayload | null;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// GeneratedGroceryList + GroceryItem
// ============================================================================

export type GroceryListMode = 'manual' | 'print' | 'instacart' | 'other';
export type GroceryListStatus = 'draft' | 'finalized' | 'exported';
export type GroceryItemStatus = 'pending' | 'have' | 'bought' | 'skipped';

export interface PantryOnHandItem {
  key: string;
  food_object_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  updated_at: string;
}

export interface GeneratedGroceryList {
  id: string;
  plan_id: string | null;
  person_id: string;

  title: string | null;
  date_range_start: string | null;
  date_range_end: string | null;

  mode: GroceryListMode;
  status: GroceryListStatus;

  export_payload_json: Record<string, unknown> | null;

  created_at: string;
  updated_at: string;
}

export type GroceryActiveListSelectionKind =
  | 'exact_day'
  | 'exact_range'
  | 'containing_range'
  | 'generated_exact_day'
  | 'generated_exact_range';

export interface GroceryActiveListContext {
  selection_kind: GroceryActiveListSelectionKind;
  requested_date_start: string;
  requested_date_end: string;
  active_date_start: string;
  active_date_end: string;
  /** True when a broader existing list is being used for the requested scope. */
  is_fallback: boolean;
  /** Human-readable explanation for UI/API consumers. */
  explanation: string;
}

export interface GroceryItem {
  id: string;
  grocery_list_id: string;
  person_id: string;

  name: string;
  quantity: number | null;
  unit: string | null;
  aisle_category: string | null;

  food_object_id: string | null;
  source_planned_meal_ids: string[];

  status: GroceryItemStatus;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

export type GroceryShoppingOverrideMatchStatus = 'active' | 'unmatched' | 'retired';

/** Person-scoped shopping preference layered on required grocery truth. */
export interface GroceryShoppingOverride {
  id: string;
  person_id: string;
  plan_id: string;
  date_range_start: string;
  date_range_end: string;
  match_key: string;
  food_object_id: string | null;
  unresolved_name: string | null;
  unresolved_unit: string | null;
  shopping_display_name: string | null;
  purchase_quantity: number | null;
  purchase_unit: string | null;
  preferred_product: string | null;
  aisle_category: string | null;
  note: string | null;
  match_status: GroceryShoppingOverrideMatchStatus;
  created_at: string;
  updated_at: string;
}

export interface GroceryShoppingOverrideBundle {
  by_match_key: Record<string, GroceryShoppingOverride>;
  unmatched: GroceryShoppingOverride[];
}

export interface GroceryItemResolutionChangeResult {
  item: GroceryItem;
  previous_match_key: string;
  shopping_override: GroceryShoppingOverride | null;
  retired_override: GroceryShoppingOverride | null;
}

// ============================================================================
// Packet C — Pantry Readiness Summary (derived planning context).
//
// Readiness is NEVER stored. It is composed read-only from existing truth
// (active plan + active grocery list + pantry_on_hand_items). Row-level
// pantry deduction semantics stay in groceryReadModel.ts; these shapes only
// carry the derived aggregate counts and the links/context for the UI.
// ============================================================================

export type PantryReadinessState =
  | 'no_plan'
  | 'no_grocery_list'
  | 'no_pantry'
  | 'has_grocery';

export interface PantryReadinessCoverage {
  /** Total grocery rows in the active list. */
  rows_total: number;
  /** Rows with a safe canonical-identity + unit pantry match (covered + partial). */
  rows_safe_match: number;
  /** Rows fully covered by pantry on hand (nothing left to buy). */
  rows_covered_full: number;
  /** Rows reduced by pantry but still needing some purchase. */
  rows_partial: number;
  /** Rows still to buy with no pantry coverage. */
  rows_to_buy: number;
  /** Rows that cannot use pantry until ingredient identity is resolved. */
  rows_unresolved_identity: number;
  /** Rows that cannot deduct because units/amounts do not match safely. */
  rows_unit_or_amount_review: number;
}

export interface PantryReadinessSummary {
  state: PantryReadinessState;
  pantry_items_saved: number;
  active_plan: { id: string; title: string | null } | null;
  /** Date scope used to locate/link the active grocery list. */
  grocery_scope: { date_start: string; date_end: string } | null;
  /** Selection context for the active grocery list, when one exists. */
  list_context: GroceryActiveListContext | null;
  /** Derived coverage counts, present only when an active grocery list exists. */
  coverage: PantryReadinessCoverage | null;
}

// ============================================================================
// ImportedMeal + ImportedMenu
// ============================================================================

export type ImportedMealSourceType = 'url' | 'video' | 'manual' | 'photo' | 'chat';

/**
 * Phase 4: user-facing import modality. Complements source_type (which is
 * the NDS-ingest canonical). The two are kept distinct because "manual"
 * in source_type was the pre-Phase-4 catch-all, while import_type pins
 * down the actual input shape the user submitted.
 */
export type ImportedMealImportType = 'pasted_text' | 'url' | 'video';

/**
 * Phase 4: parse lifecycle for a recipe/meal import. `manual_review` is
 * the intentional landing state when we could capture the input but not
 * extract enough structure to auto-parse — the raw input is preserved
 * for the user to finish the work.
 */
export type ImportedMealParseStatus = 'pending' | 'parsed' | 'failed' | 'manual_review';

/**
 * Phase 4: structured shape for `imported_meals.parsed_payload_json`.
 * This is the REVIEWABLE draft — not the attachable planned-meal shape.
 * The attachable shape continues to live in `ImportedMeal.payload`
 * (`PlannedMealPayload`) so imports can be dropped into plan_slots
 * without re-computation drift.
 */
export interface ImportedMealDraftIngredient {
  raw_text: string;
  normalized_name: string | null;
  quantity_value: number | null;
  quantity_unit: string | null;
  preparation_note: string | null;
  /**
   * Packet 24 — Parse confidence carried from
   * `parseIngredientPhrase`. `low` when we had to approximate
   * (range midpoint, clearly under-specified phrase); `medium`
   * when the amount is count-inferred (`1 red pepper`); `high`
   * when amount + explicit unit were both parsed. Optional /
   * backwards-compatible with pre-Packet-24 drafts.
   */
  parse_confidence?: 'high' | 'medium' | 'low' | null;
  /**
   * Packet 24 — How the amount was obtained. `explicit` = a real
   * quantity token was present; `count_inferred` = amount present
   * but no unit, treated as count-of-whole-item;
   * `range_midpoint` = parsed from `N-M` range as the midpoint;
   * `approximated` = other fuzzy shortcuts. Null when no quantity
   * was parsed at all. Optional / backwards-compatible.
   */
  quantity_source?:
    | 'explicit'
    | 'count_inferred'
    | 'range_midpoint'
    | 'approximated'
    | null;
}

export interface ImportedMealDraftStep {
  step_number: number;
  instruction: string;
}

export type ImportedMealTypeHint =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'unknown';

export interface ImportedMealDraftPayload {
  title: string | null;
  description: string | null;
  servings: number | null;
  ingredients: ImportedMealDraftIngredient[];
  steps: ImportedMealDraftStep[];
  meal_type_hint: ImportedMealTypeHint;
  /**
   * Packet 21 — Preserves on the draft how the source text was
   * acquired. `automatic` = adapter transcript fetch succeeded,
   * `user_assisted` = user pasted caption/recipe text alongside a
   * video/social URL, `none` = no video path was involved.
   * Optional / backwards-compatible with pre-Packet-21 drafts.
   */
  acquisition_mode?: 'automatic' | 'user_assisted' | 'none' | null;
  /**
   * Packet 22 — Preserves on the draft whether the secondary
   * on-screen visible text acquisition layer contributed to the
   * text that went into normalization. `used=false` (or absent)
   * means the draft's text came from transcript/caption/user-
   * assisted paths only. `source` identifies how the on-screen
   * text was obtained. Admin tooling can use `chars` to spot
   * suspiciously-long assists.
   */
  onscreen_assist?: {
    used: boolean;
    source: 'user_supplied' | 'extractor' | null;
    chars: number;
  } | null;
  /**
   * Packet 26 §3d — Language-aware Shorts fallback. When the adapter
   * acquired a non-English caption track and the AI runtime
   * translated it to English before normalization, this field
   * preserves the original source language code (e.g. "es", "fr",
   * "it"). Absent / null for English-native acquisitions and
   * user-assisted paths.
   */
  translated_from_language?: string | null;
  /**
   * Packet 27 — Distinguishes the acquisition route that produced
   * the draft text so the UI can tailor its messaging. In
   * particular, `youtube_title_only` means the only signal we
   * could pull from YouTube was the video title, and the user must
   * paste the full recipe body for the draft to be useful.
   * Mirrors `TranscriptAcquisitionOutcome.source`. Null for
   * non-video imports and older drafts.
   */
  transcript_source?:
    | 'youtube_timedtext'
    | 'youtube_timedtext_asr'
    | 'youtube_description'
    | 'youtube_title_only'
    | 'external_provider'
    | 'vimeo_text_track'
    | 'vimeo_oembed_description'
    | 'user_assisted_caption'
    | 'unknown'
    | null;
}

/**
 * Phase 4: nutrition estimate with explicit provenance. Separate from
 * `ImportedMeal.payload.totals` so the *estimate* and its uncertainty
 * can be reviewed before being accepted into the attachable payload.
 * The packet rule "food trust and NDS confidence remain distinct" is
 * enforced here by surfacing a per-field confidence band, NOT by
 * overwriting NDS confidence.
 */
export interface NutritionEstimatePerServing {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  added_sugar_g: number | null;
}

export type NutritionEstimateConfidence = 'high' | 'medium' | 'low';

export interface NutritionEstimate {
  per_serving: NutritionEstimatePerServing;
  servings: number | null;
  confidence: NutritionEstimateConfidence;
  source: 'parsed_from_recipe' | 'ai_estimated' | 'user_entered' | 'unknown';
  notes: string | null;
}

/**
 * Packet 6 — Trusted ingredient lookup and nutrition grounding.
 *
 * One record per imported ingredient describing which source grounded
 * its nutrition estimate. This is the primary per-item provenance
 * surface (`imported_meals.ingredient_match_json`).
 *
 * Match hierarchy (locked by Packet 6 §3a):
 *   1. `matched`  — strong trusted food-object match (source_kind='food_object')
 *   2. `partial`  — plausible trusted match, lower certainty (source_kind='food_object')
 *   3. `guessed`  — heuristic guess-table fallback (source_kind='heuristic_guess')
 *   4. `none`     — conservative default fallback   (source_kind='default_guess')
 *
 * Food trust and NDS confidence remain distinct; nutrition-estimate
 * confidence rises as more ingredients ground in trusted matches.
 *
 * `per_serving_estimate` is the per-serving nutrition contribution this
 * ingredient adds to the meal (already divided by servings). `nulls`
 * indicate "not available" rather than "zero".
 *
 * Legacy Packet 4 fields (`match_confidence`, `match_source`,
 * `food_object_id`, `notes`) are retained as optional for wire-compat
 * with older rows; new writes use the Packet 6 fields.
 */
export interface IngredientMatchEntry {
  ingredient_index: number;
  raw_text: string;
  normalized_name: string | null;
  quantity_value: number | null;
  quantity_unit: string | null;
  preparation_note: string | null;

  match_status: 'matched' | 'partial' | 'guessed' | 'none';
  confidence: 'high' | 'medium' | 'low';

  source_kind: 'food_object' | 'heuristic_guess' | 'default_guess';
  source_id: string | null;
  source_label: string | null;

  per_serving_estimate: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };

  explanation: string | null;

  /**
   * Packet 28 — row-level user choice state for suggested-source
   * adoption. The existing `source_id` / `source_kind` always
   * describe the *currently in-effect* source for the row, whether
   * that came from the matcher or from an explicit user apply.
   * `user_choice` distinguishes between the two so the UI can label
   * unconfirmed suggestions as "Suggested source" and committed
   * adoptions as "Trusted source applied".
   *
   *   - `null` / `undefined`: pure matcher state (no user action yet).
   *   - `'applied'`: user committed this row's food-object source via
   *       the ingredient-source API. The matcher will not re-score
   *       this row on future rebuilds; the chosen `source_id` stays
   *       locked in until the user undoes it.
   *   - `'rejected'`: user explicitly dismissed the suggestion via
   *       "Not this source". The matcher will skip the trusted path
   *       for this row and route it through the heuristic/default
   *       fallback until the user undoes the rejection.
   *
   * Undoing (Packet §4b) clears both `user_choice` and `applied_at`
   * so the row returns to suggestion/review mode cleanly.
   */
  user_choice?: 'applied' | 'rejected' | null;
  applied_at?: string | null;

  /** @deprecated Packet 4 field; use `source_id` + `source_kind`. */
  food_object_id?: string | null;
  /** @deprecated Packet 4 field; use `confidence` + `match_status`. */
  match_confidence?: 'high' | 'medium' | 'low' | 'none';
  /** @deprecated Packet 4 field; use `source_kind` + `source_label`. */
  match_source?: 'exact_name' | 'fuzzy_name' | 'manual' | 'none';
  /** @deprecated Packet 4 field; use `explanation`. */
  notes?: string | null;
}

export interface ImportedMeal extends NDSVersionStamp, MealNDSShape {
  id: string;
  person_id: string;

  title: string;
  source_type: ImportedMealSourceType;
  source_url: string | null;

  payload: PlannedMealPayload;

  /** Phase 4 draft fields — nullable for pre-Phase-4 rows. */
  import_type: ImportedMealImportType | null;
  source_platform: string | null;
  raw_input_text: string | null;
  parse_status: ImportedMealParseStatus;
  parsed_payload_json: ImportedMealDraftPayload | null;
  nutrition_estimate_json: NutritionEstimate | null;
  ingredient_match_json: IngredientMatchEntry[] | null;

  created_at: string;
  updated_at: string;
}

export type ImportedMenuSourceType = 'url' | 'manual_paste' | 'photo' | 'other';

/** Mirrors imported_meals.parse_status for a consistent review UX. */
export type ImportedMenuParseStatus =
  | 'pending'
  | 'parsed'
  | 'failed'
  | 'manual_review';

export interface ImportedMenuSectionItem {
  item_name: string;
  description: string | null;
  price_text: string | null;
  nutrition_text: string | null;
}

export interface ImportedMenuSection {
  section_name: string | null;
  items: ImportedMenuSectionItem[];
}

/** Locked for Packet 5 — see §4b of the packet contract. */
export interface ImportedMenuPayload {
  sections: ImportedMenuSection[];
}

export interface ImportedMenu {
  id: string;
  person_id: string;

  restaurant_name: string;
  source_type: ImportedMenuSourceType;
  source_url: string | null;

  parse_status: ImportedMenuParseStatus;
  raw_input_text: string | null;
  raw_payload_json: Record<string, unknown> | null;
  parsed_payload_json: ImportedMenuPayload | null;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// AiRun
// ============================================================================

export type AiRunType =
  | 'plan_generate'
  | 'plan_regenerate'
  | 'substitution'
  | 'restaurant_rec'
  | 'menu_parse'
  | 'recipe_parse'
  | 'grocery_list'
  | 'nds_optimize'
  | 'recipe_normalize'
  | 'menu_normalize'
  | 'structure_extract'
  | 'video_transcript_fetch'
  | 'onscreen_text_extract'
  | 'caption_translate'
  | 'video_transcript_external'
  | 'social_video_recipe_extract';

export type AiRunStatus = 'pending' | 'succeeded' | 'failed';

export interface AiRun extends NDSVersionStamp {
  id: string;
  person_id: string;
  plan_id: string | null;

  run_type: AiRunType;
  provider: string;
  model: string | null;

  request_payload_json: Record<string, unknown>;
  response_payload_json: Record<string, unknown> | null;

  status: AiRunStatus;
  error_text: string | null;
  latency_ms: number | null;
  cost_cents: number | null;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// ProgramPlanGuidance
// ============================================================================

export interface ProgramPlanGuidancePayload {
  emphasize: string[];
  avoid: string[];
  macro_targets: { protein_g: number; carbs_g: number; fat_g: number } | null;
  nds_targets: {
    nds_score_100_min: number | null;
    subscore_floors_10: Partial<NDSSubscores> | null;
  } | null;
  notes_md: string | null;
  /**
   * Phase 3: optional structural override on the user's meal schedule.
   * Programs may widen / narrow the enabled-slot set and impose time
   * constraints, but they never write concrete clock times. Times
   * remain owned by Profile.
   */
  schedule_override?: ProgramScheduleOverride | null;
}

// ============================================================================
// Phase 3: Meal schedule ownership
// ============================================================================

/** Closed V1 enum. Ad-hoc custom slot keys are deferred to a later packet. */
export type MealSlotKey =
  | 'breakfast'
  | 'morning_snack'
  | 'lunch'
  | 'afternoon_snack'
  | 'dinner'
  | 'evening_snack';

export const MEAL_SLOT_KEYS: readonly MealSlotKey[] = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
  'evening_snack',
] as const;

/** Default label shown when the user doesn't override. */
export const MEAL_SLOT_DEFAULT_LABELS: Record<MealSlotKey, string> = {
  breakfast: 'Breakfast',
  morning_snack: 'Morning snack',
  lunch: 'Lunch',
  afternoon_snack: 'Afternoon snack',
  dinner: 'Dinner',
  evening_snack: 'Evening snack',
};

/** Default target times seeded on first render when key is absent. */
export const MEAL_SLOT_DEFAULT_TIMES: Record<MealSlotKey, string> = {
  breakfast: '08:00',
  morning_snack: '10:30',
  lunch: '12:30',
  afternoon_snack: '15:30',
  dinner: '19:00',
  evening_snack: '21:00',
};

/** Slots enabled by default when the user has no schedule yet. */
export const MEAL_SLOT_DEFAULT_ENABLED: Record<MealSlotKey, boolean> = {
  breakfast: true,
  morning_snack: false,
  lunch: true,
  afternoon_snack: false,
  dinner: true,
  evening_snack: false,
};

export interface MealScheduleSlot {
  enabled: boolean;
  /** HH:mm, 24-hour, profile local time. */
  target_time: string;
  /** User label override; null → key default. */
  label: string | null;
}

export interface MealSchedule {
  slots: Record<MealSlotKey, MealScheduleSlot>;
  version: 1;
  /** ISO timestamp of the last user edit. */
  updated_at: string;
}

/** Program structural override on the user's meal schedule. */
export interface ProgramScheduleOverride {
  require_slots: MealSlotKey[];
  disallow_slots: MealSlotKey[];
  constraints?: {
    /** HH:mm — earliest allowed time for any enabled slot. */
    no_earlier_than?: string;
    /** HH:mm — latest allowed time for any enabled slot. */
    no_later_than?: string;
    min_gap_minutes?: number;
    max_eating_window_minutes?: number;
  } | null;
  rationale_md?: string | null;
}

/** A single resolved slot in the day template produced by the resolver. */
export interface ResolvedScheduleSlot {
  key: MealSlotKey;
  enabled: boolean;
  target_time: string;
  label: string;
  slot_block: PlanSlotBlock;
  source: 'profile' | 'program_required' | 'program_disallowed';
}

/** Kinds of conflict the resolver surfaces to the user. */
export type ScheduleConflictKind =
  | 'earliest'
  | 'latest'
  | 'min_gap'
  | 'max_window'
  | 'required_vs_disabled'
  | 'eating_window';

export interface ScheduleConflict {
  kind: ScheduleConflictKind;
  slot_key: MealSlotKey | null;
  message: string;
  /**
   * What Plans suggests the user change. Applying the suggestion PATCHes
   * people.metadata.meal_schedule — it is never auto-applied.
   */
  suggested_adjustment: {
    target_time?: string;
    enabled?: boolean;
  } | null;
}

/**
 * Frozen schedule block written into plans.input_snapshot_json at
 * generation time, alongside body/preferences/targets/program_guidance.
 */
export interface PlanScheduleSnapshot {
  profile_schedule: MealSchedule;
  resolved_slots: ResolvedScheduleSlot[];
  conflicts: ScheduleConflict[];
}

/**
 * Admin-authored classifier for a program guidance row. Free-form for V1
 * but a small set of well-known values powers the admin list filter.
 */
export type ProgramGuidanceType =
  | 'program_template'
  | 'assignment'
  | 'person_override'
  | 'temporary'
  | 'other';

export const PROGRAM_GUIDANCE_TYPES: readonly ProgramGuidanceType[] = [
  'program_template',
  'assignment',
  'person_override',
  'temporary',
  'other',
] as const;

// ============================================================================
// Phase 8: Program assignment (runtime inheritance)
// ============================================================================

export type ProgramAcquisitionSource =
  | 'offer'
  | 'purchase'
  | 'admin_grant'
  | 'bundle'
  | 'other';

export const PROGRAM_ACQUISITION_SOURCES: readonly ProgramAcquisitionSource[] = [
  'offer',
  'purchase',
  'admin_grant',
  'bundle',
  'other',
] as const;

export type ProgramAssignmentStatus =
  | 'active'
  | 'inactive'
  | 'scheduled'
  | 'completed'
  | 'cancelled';

export const PROGRAM_ASSIGNMENT_STATUSES: readonly ProgramAssignmentStatus[] = [
  'active',
  'inactive',
  'scheduled',
  'completed',
  'cancelled',
] as const;

export interface ProgramAssignment {
  id: string;
  person_id: string;
  program_slug: string;

  acquisition_source: ProgramAcquisitionSource;
  status: ProgramAssignmentStatus;

  active_from: string | null;
  active_to: string | null;

  /** Merge priority hint — higher wins when assignments overlap. */
  priority: number;

  source_ref: string | null;
  notes: string | null;
  created_by_user_id: string | null;

  /**
   * Packet 9: true if this row was produced by the offer/purchase
   * automation layer (Stripe webhook, admin grant, or backfill). Admin-
   * entered rows stay false so the inspection UI can label them.
   */
  auto_created: boolean;

  created_at: string;
  updated_at: string;
}

/**
 * A single guidance row resolved through the Phase 8 inheritance layer,
 * annotated with WHY it was included and (if applicable) which
 * assignment contributed it. Used by admin inspection surfaces.
 */
export interface ResolvedGuidanceEntry {
  guidance: ProgramPlanGuidance;
  resolution_reason:
    | 'direct_person_scope'
    | 'inherited_from_assignment';
  inherited_from_assignment_id: string | null;
  effective_priority: number;
}

/**
 * Complete inheritance resolution result for a single person. Powers
 * both the Plans consumer path (which projects to `ProgramPlanGuidance[]`)
 * and the admin inspection UI (which shows the full explanation).
 */
export interface GuidanceResolutionResult {
  person_id: string;
  /** Active assignments currently contributing inheritance. */
  active_assignments: ProgramAssignment[];
  /** All guidance rows active on the producer side for this person. */
  candidate_guidance: ProgramPlanGuidance[];
  /** Final resolved set, merge-ordered. */
  resolved: ResolvedGuidanceEntry[];
  resolved_at: string;
}

export interface ProgramPlanGuidance extends NDSVersionStamp {
  id: string;
  person_id: string;

  program_slug: string;
  program_run_id: string | null;

  guidance_payload_json: ProgramPlanGuidancePayload;

  active: boolean;
  effective_from: string | null;
  effective_until: string | null;

  /**
   * Packet 7: admin-authored merge priority. Higher = stronger preference
   * when multiple active rows overlap. The Plans consumer may defer
   * consuming this today; the producer side must still persist it.
   */
  priority: number;
  /** Packet 7: admin classifier — not required for Plans resolution. */
  guidance_type: ProgramGuidanceType | null;
  /** Packet 7: internal staff note — distinct from user-facing notes_md. */
  notes: string | null;
  /** Packet 7: auth.users.id of the staff user who authored the row. */
  created_by_user_id: string | null;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// BodyMeasurement
// ============================================================================

export type BodyMeasurementType =
  | 'weight'
  | 'height'
  | 'body_fat_percent'
  | 'waist_cm'
  | 'hip_cm'
  | 'neck_cm'
  | 'other';

export type BodyMeasurementSource = 'manual' | 'device' | 'estimate' | 'import';

export interface BodyMeasurement {
  id: string;
  person_id: string;

  measurement_type: BodyMeasurementType;
  /** Canonical value in the canonical unit for this type (kg for weight, cm for height, etc). */
  value_numeric: number;
  unit: string;

  /** What the user entered in their preferred display unit. Canonical wins. */
  display_value_numeric: number | null;
  display_unit: string | null;

  measured_at: string;
  source: BodyMeasurementSource;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// Metadata key aliases (for use by server code reading people.metadata)
// ============================================================================

/**
 * Metadata keys added to METADATA_FIELDS in pages/api/journal/profile.ts as
 * part of Plans Phase 1. Exported here so downstream Plans code has a single
 * import rather than hard-coding strings.
 */
export const PLANS_PROFILE_METADATA_KEYS = [
  'height_cm',
  'height_display_unit',
  'weight_kg',
  'weight_display_unit',
  'weight_as_of',
  'dining_out_frequency',
  'shopping_mode_preference',
  'household_size',
  // Phase 3: baseline meal schedule template lives in people.metadata.
  'meal_schedule',
] as const;

export type PlansProfileMetadataKey = (typeof PLANS_PROFILE_METADATA_KEYS)[number];
