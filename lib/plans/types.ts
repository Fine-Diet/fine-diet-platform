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
// PlannedEatOutEvent
// ============================================================================

export type EatOutVenueType = 'restaurant' | 'friends' | 'work' | 'travel' | 'other';

export interface EatOutRecommendationItem {
  item_name: string;
  /** Projected meal-derived data if the user orders this item. */
  projected_meal_derived_data: MealDerivedData;
  nds_confidence: NDSConfidence;
  rationale_md: string | null;
}

export interface EatOutRecommendationPayload {
  recommended_items: EatOutRecommendationItem[];
  avoid_items: EatOutRecommendationItem[];
  overall_rationale_md: string | null;
}

export interface PlannedEatOutEvent extends NDSVersionStamp {
  id: string;
  plan_day_id: string;
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

// ============================================================================
// ImportedMeal + ImportedMenu
// ============================================================================

export type ImportedMealSourceType = 'url' | 'video' | 'manual' | 'photo' | 'chat';

export interface ImportedMeal extends NDSVersionStamp, MealNDSShape {
  id: string;
  person_id: string;

  title: string;
  source_type: ImportedMealSourceType;
  source_url: string | null;

  payload: PlannedMealPayload;

  created_at: string;
  updated_at: string;
}

export type ImportedMenuSourceType = 'url' | 'manual_paste' | 'photo' | 'other';

export interface ImportedMenu {
  id: string;
  person_id: string;

  restaurant_name: string;
  source_type: ImportedMenuSourceType;
  source_url: string | null;

  raw_payload_json: Record<string, unknown> | null;
  parsed_payload_json: Record<string, unknown> | null;

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
  | 'nds_optimize';

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
] as const;

export type PlansProfileMetadataKey = (typeof PLANS_PROFILE_METADATA_KEYS)[number];
