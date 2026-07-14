/**
 * Meal Object Foundation — Packet 1: Canonical Types (contract only)
 *
 * This module defines the single canonical meal object contract that future
 * packets will use to unify the currently-divergent meal/recipe/ingredient
 * shapes across the codebase:
 *
 *   - journal_meal_templates.items[]        (Saved Meals)   — lib/journal/types.ts
 *   - planned_meals.payload                 (Plans)         — lib/plans/types.ts
 *   - imported_meals.parsed_payload_json    (Imports)       — lib/plans/types.ts
 *   - EatOutAttachablePayload               (Eat-out)       — lib/plans/types.ts
 *   - journal_entries.payload               (the log)       — lib/journal/types.ts
 *
 * Source of truth: docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md (§2 conflicts,
 * §3 canonical types).
 *
 * SCOPE / SAFETY RULES (P1 is contract-only):
 *   - These types are NOT yet wired into runtime behavior. They exist so the
 *     adapter layer (./adapters) and future packets have one shape to target.
 *   - No DB table is created or implied by these types. Persistence and the
 *     versioned-JSONB `meal_group` extension are deferred to P2.
 *   - NDS fields are OPTIONAL/NULLABLE here (see MealDocument.nds). This is a
 *     deliberate reconciliation: PlannedMeal/ImportedMeal carry a REQUIRED
 *     MealNDSShape, but journal_meal_templates (Saved Meals) carries only a
 *     scalar nutritionDensity. Forcing a required NDS shape would make the
 *     saved-meal adapter fabricate NDS data — which would violate the rule
 *     "no AI / no invented nutrition math". So NDS passes through when the
 *     source has it and is null otherwise.
 *
 * Naming reconciliation: the audit §3 prototype used `NutritionBasis` and
 * `MealDocumentStatus`. The packet brief is authoritative and names these
 * `MealNutritionBasis` and `MealReviewState`; those names are canonical here.
 */

import type { MealNDSShape } from '@/lib/plans/types';

// ============================================================================
// Shared primitives
// ============================================================================

/**
 * Canonical macros. Single key spelling everywhere (`_g`), removing the
 * `protein` vs `protein_g` drift between journal (camel, no suffix) and
 * plans/eat-out (snake, `_g`). Null means "not available" (distinct from 0).
 */
export interface CanonicalMacros {
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g?: number | null;
  added_sugar_g?: number | null;
}

/** Rolled-up nutrition block (per-serving, per-component contribution, or totals). */
export interface MealNutrition {
  calories: number | null;
  macros: CanonicalMacros;
}

/**
 * Canonical nutrition basis flag — removes the per-serving vs absolute
 * ambiguity that exists today (journal = per-serving + quantity multiplier;
 * plans/eat-out totals = absolute; imports = per-serving estimate).
 *
 *   - 'per_component': the component's `calories`/`macros` describe the amount
 *     stored on the component itself (its own contribution).
 *   - 'per_serving':   the component's `calories`/`macros` describe one serving
 *     of the parent document/food and scale with `quantity`.
 */
export type MealNutritionBasis = 'per_component' | 'per_serving';

/** USDA-style household portion measure (mirrors the existing `measures[]`). */
export interface HouseholdMeasure {
  unit: string;
  grams: number;
  label?: string;
}

/** How a component's nutrition was grounded. Mirrors IngredientMatchEntry. */
export type MealMatchStatus = 'matched' | 'partial' | 'guessed' | 'none';

/**
 * Where a component's nutrition came from. Extends IngredientMatchEntry's
 * `source_kind` with `user_entered` (the journal/saved-meal case where the
 * user supplied explicit macros and there is no trusted-match lineage).
 */
export type MealComponentSourceKind =
  | 'food_object'
  | 'heuristic_guess'
  | 'default_guess'
  | 'user_entered';

/** Meal-type hint, aligned with ImportedMealTypeHint / EatOut meal_type. */
export type MealTypeHint =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'unknown';

// ============================================================================
// MealComponent — the single canonical ingredient / item
// ============================================================================

/**
 * One component (ingredient or item) used by recipes, saved meals, planned
 * meals, imports, eat-out options, and logged meal groups. Every legacy
 * component shape maps onto this via thin adapters with no data loss.
 */
export interface MealComponent {
  /** Stable id within the document/instance (NOT a DB row id). */
  component_id: string;
  /** Display name. */
  name: string;

  /** Parse provenance, when the component came from import/extraction. */
  raw_text?: string | null;
  normalized_name?: string | null;
  /** Preparation note (e.g. "diced", "drained"). */
  preparation_note?: string | null;

  /** Amount the user is consuming/preparing, expressed in `unit`. */
  quantity: number | null;
  unit: string | null;
  /** Canonical grams when resolvable via food_objects.measures / serving_size_g. */
  quantity_g?: number | null;

  /** Grounding: link to canonical food. Single snake_case spelling. */
  food_object_id: string | null;
  /** Serving size in grams for the linked food. */
  serving_size_g?: number | null;
  /** Household portion measures for the linked food. */
  measures?: HouseholdMeasure[];

  /** Nutrition contributed by THIS component (basis below disambiguates). */
  calories: number | null;
  macros: CanonicalMacros;
  nutrition_basis: MealNutritionBasis;

  /** Grounding/match status. */
  match_status: MealMatchStatus;
  source_kind: MealComponentSourceKind;

  /** Review flag — drives the recompute policy (audit §5), deferred to P3. */
  needs_review: boolean;
}

// ============================================================================
// MealDocument — the reusable recipe / meal in Meal Library
// ============================================================================

/** 'recipe' = has prep steps / yield; 'meal' = assembled set of components. */
export type MealDocumentKind = 'recipe' | 'meal';

/**
 * Review state of a document. `draft` until import review + yield confirm,
 * `needs_review` when grounding/nutrition is incomplete, `confirmed` once the
 * user has accepted it into the Meal Library.
 */
export type MealReviewState = 'draft' | 'needs_review' | 'confirmed';

/**
 * Intent / category tags for a meal document. Drives Meal Library filtering
 * (recipes are a filter, not a separate silo). Extensible; treat unknown
 * strings as 'other' at read time.
 */
export type MealDocumentIntent =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'dessert'
  | 'drink'
  | 'side'
  | 'sauce'
  | 'condiment'
  | 'recipe'
  | 'meal'
  | 'other';

/** Origin modality of a meal document / logged instance. */
export type MealSourceType =
  | 'manual'
  | 'url'
  | 'video'
  | 'photo'
  | 'label'
  | 'menu'
  | 'barcode'
  | 'chat'
  | 'saved_meal'
  | 'planned_meal'
  | 'imported'
  | 'eat_out';

/** Source / provenance pointer block. All ids null for hand-built docs. */
export interface MealSource {
  source_type: MealSourceType;
  source_url?: string | null;
  source_imported_meal_id?: string | null;
  source_template_id?: string | null;
  source_planned_meal_id?: string | null;

  /**
   * Imported-meal provenance preserved verbatim from the source draft so a
   * confirmed/draft document can always be traced back to (and re-derived
   * from) the import it came from. Null for hand-built docs. (P4)
   */
  import_type?: string | null;
  source_platform?: string | null;
  raw_input_text?: string | null;
}

/** A single prep instruction step (recipes only; never enters nutrition math). */
export interface MealStep {
  step_number: number;
  instruction: string;
}

/** Yield definition — total servings a prepared batch produces. */
export interface MealYield {
  /** Number of servings the prepared batch produces. */
  servings: number | null;
  /** Optional human label of the batch unit (e.g. "2 loaves", "1 pot"). */
  yield_label?: string | null;
  /** True once the user has explicitly confirmed yield (gates 'confirmed'). */
  confirmed: boolean;
}

/**
 * A portion descriptor — one unit of consumption derived from yield. Used by
 * planned/logged instances to describe "how much of the document" without
 * mutating the document itself.
 */
export interface MealPortion {
  /** Servings this portion represents. */
  servings: number | null;
  /** Optional household label for this portion (e.g. "1 bowl"). */
  label?: string | null;
  /** Canonical grams for this portion when resolvable. */
  grams?: number | null;
}

/**
 * Canonical meal document: a single type for BOTH recipes and reusable meals.
 * A "recipe" has prep `steps` and a `yield`; a "meal" is an assembled set with
 * neither. Meal Library is the home for both — recipes are a filter, not a
 * separate silo (decision #2).
 */
export interface MealDocument {
  /** Versioned-JSONB stamp (P2 persists this). */
  schema_version: number;

  /** Null for drafts not yet persisted. */
  id: string | null;
  person_id?: string | null;

  kind: MealDocumentKind;
  review_state: MealReviewState;

  title: string;
  description: string | null;

  /** Intent/category tags (Meal Library filtering). */
  intents: MealDocumentIntent[];
  /** Meal-type hint, when known. */
  meal_type_hint: MealTypeHint | null;

  /** The component list (ingredients for recipes, items for assembled meals). */
  components: MealComponent[];
  /** Prep steps — recipes only; never enter the nutrition path. */
  steps?: MealStep[];

  /** Yield/serving definition. null for single-serving assembled meals. */
  yield: MealYield | null;
  /** Convenience mirror of yield.servings; null when no yield is defined. */
  recipe_yield_servings: number | null;
  /** Optional serving label (e.g. "per bowl"). */
  serving_label: string | null;
  /** Free-form prep notes (distinct from structured steps). */
  prep_notes: string | null;

  /** Rolled-up nutrition for ONE serving, when known. */
  per_serving: MealNutrition | null;
  /** Rolled-up nutrition for the whole document/batch, when known. */
  totals: MealNutrition | null;

  /** Source / provenance. */
  source: MealSource;

  /**
   * Optional NDS projection. Null when the source carried none (e.g. Saved
   * Meals). Passed through verbatim from sources that do (Plans / Imports).
   */
  nds: MealNDSShape | null;
  nds_version: string | null;
  classifier_version: string | null;

  /** ISO timestamps; null for unpersisted drafts. */
  created_at: string | null;
  updated_at: string | null;
}

// ============================================================================
// MealInstance support — logged & planned instances of a document
// ============================================================================

/**
 * Whether an edit to a logged/planned instance applies to just this instance
 * or is meant to update the source document (decision #6 / detach semantics).
 */
export type MealInstanceEditMode = 'instance_only' | 'update_source';

/**
 * The grouped logged-meal payload. A logged meal is ONE journal_entries row
 * (entry_type='intake') whose payload carries this `meal_group` so the meal
 * stays a grouped first-level entry that still knows its components — without
 * exploding into per-ingredient rows. (P5 wires the write path; P1 only
 * defines the shape.)
 */
export interface LoggedMealGroup {
  schema_version: number;

  /** Display name of the meal as logged (snapshot). */
  name: string;

  /** Provenance pointers (any/all may be null). */
  source_meal_document_id: string | null;
  source_imported_meal_id: string | null;
  source_planned_meal_id: string | null;
  source_template_id: string | null;

  /** Components actually eaten (snapshot). */
  components: MealComponent[];
  /** Instructions snapshot — recipes only; informational. */
  steps?: MealStep[];

  /** Rolled-up totals for the logged amount (what NDS/day math consumes). */
  totals: MealNutrition;

  /** Servings of the source planned for this instance, when applicable. */
  planned_servings: number | null;
  /** Servings actually eaten and recorded. */
  consumed_servings: number;
  /** Servings prepared in the batch this came from, when applicable (deferred). */
  prepared_servings?: number | null;

  /** True once the user edited THIS instance away from the source. */
  detached_from_source: boolean;
  /** Edit scope for the next mutation, when surfaced by the UI (deferred). */
  edit_mode?: MealInstanceEditMode;

  /** Per-instance notes (not the source document's notes). */
  instance_notes?: string | null;
  /** Review flag for the logged instance. */
  needs_review: boolean;

  /**
   * Packet 2 — whether consumption matched the plan exactly.
   * Additive; absent on legacy entries (treat as unknown / infer from payload shape).
   */
  logged_as_planned?: boolean;
}

/**
 * journal_entries.payload shape for a grouped meal entry. The first-level
 * fields mirror today's flat intake payload (so day view / LoggedItemCard /
 * day NDS keep reading `name`/`calories`/`macros` unchanged). `meal_group`
 * is the additive, versioned-JSONB extension; its absence ⇒ legacy flat
 * single-food entry.
 *
 * NOTE: `macros` here intentionally uses the journal's camelCase
 * {protein,carbs,fat} spelling for back-compat with existing entries. The
 * canonical `_g` spelling lives inside `meal_group.totals.macros`.
 */
export interface GroupedMealEntryPayload {
  name: string;
  calories?: number;
  macros?: { protein?: number; carbs?: number; fat?: number };
  quantity?: number;
  unit?: string;
  source_planned_meal_id?: string;
  /** Packet 2 — true when logged exactly as planned; false when adjusted. */
  logged_as_planned?: boolean;
  /** NEW (P2/P5): grouped meal payload. Absence ⇒ legacy flat entry. */
  meal_group?: LoggedMealGroup;
}

// ============================================================================
// Forward-looking — NOT runtime-used in P1 (deferred to the leftovers packet)
// ============================================================================

/**
 * A prepared batch of a meal document, tracked so leftovers can be re-logged
 * without re-import. Defined here for contract completeness only; no P1 code
 * path reads or writes this. Deferred to the Pantry/leftovers packet.
 */
export interface PreparedMealBatch {
  schema_version: number;
  /** Document this batch was prepared from. */
  source_meal_document_id: string | null;
  /** Total servings prepared in this batch. */
  prepared_servings: number;
  /** Servings already consumed/logged from the batch. */
  consumed_servings: number;
  /** When the batch was prepared. */
  prepared_at?: string | null;
  notes?: string | null;
}

// ============================================================================
// Schema version constant
// ============================================================================

/** Current canonical meal object schema version (versioned-JSONB stamp). */
export const MEAL_SCHEMA_VERSION = 1;
