/**
 * Canonical consumed-input contract for ACTUAL Nutrition Density Score.
 *
 * NDS-01 checkpoint A. This module is the single normalization boundary between
 * `journal_entries.payload` (which has three historically divergent quantity
 * bases) and the pure daily calculator.
 *
 * Design rules encoded here:
 *
 *  - A normalized value is either KNOWN (a number) or UNKNOWN (null). Unknown is
 *    never collapsed to a measured zero. `NutrientAvailability` records which.
 *  - Every entry declares its quantity basis explicitly, so nothing downstream
 *    has to guess whether `payload.calories` was per-serving or already-consumed.
 *  - Component (ingredient) evidence is carried alongside the parent total and
 *    marked as a SUBSET of it. Consumers must not add both.
 *  - Provenance is honest: an at-log snapshot, a legacy versioned catalog
 *    lookup, and an unresolvable reference are three different things.
 *
 * Nothing in this module reads the database or the clock; it is pure so the
 * regression matrix in NDS-01 §9 can drive it from real payload factories.
 */

import type { ProcessingClass } from '../types';
import type { ConsumedDayAttribution } from '../dayIdentity';
import type {
  MealComponentKind,
  MealNutritionBasis,
} from '@/lib/meals/types';

/**
 * Identity of this input interpretation. Deliberately SEPARATE from
 * NDS_VERSION (the formula) and CLASSIFIER_VERSION: reading the same source
 * differently invalidates cached outputs even when the formula is untouched.
 */
export const NDS_NORMALIZER_VERSION = 'nds_consumed_normalizer_2026-09-12.v1';

/** Whether a normalized nutrient figure is trustworthy as a measurement. */
export type NutrientAvailability =
  /** Measured/asserted by the source. A known 0 is `known`. */
  | 'known'
  /** No evidence at all. Must not be scored as zero. */
  | 'unknown'
  /**
   * Some contributors reported the nutrient and others did not, so the sum is a
   * lower bound rather than a daily total.
   */
  | 'partial';

/** A nutrient figure plus whether it may be treated as a measurement. */
export interface NormalizedNutrient {
  /** Sum of KNOWN contributions. Null only when nothing was known. */
  value: number | null;
  availability: NutrientAvailability;
  /** Contributors that reported this nutrient. */
  knownContributorCount: number;
  /** Contributors that carried intake but reported nothing for this nutrient. */
  unknownContributorCount: number;
}

/**
 * How the raw payload numbers relate to what was eaten.
 *
 *  - `per_serving_times_quantity`: the legacy flat-food contract. Top-level
 *    calories/macros describe one serving and scale with `quantity`.
 *  - `already_consumed_total`: the grouped-meal contract. Top-level
 *    calories/macros are absolute consumed totals and must be counted once.
 */
export type ConsumedQuantityBasisKind =
  | 'per_serving_times_quantity'
  | 'already_consumed_total';

export interface ConsumedQuantityBasis {
  kind: ConsumedQuantityBasisKind;
  /**
   * Multiplier actually applied to the top-level figures. Always 1 for
   * `already_consumed_total` — that is the fix for the audited double scaling.
   */
  appliedMultiplier: number;
  /** Raw `payload.quantity` as recorded, for evidence and diagnostics. */
  recordedQuantity: number | null;
  /** Raw `payload.unit` as recorded. */
  recordedUnit: string | null;
  /** Grams per one serving when the source could resolve it. */
  servingSizeG: number | null;
  /**
   * Canonical consumed grams when derivable. Null when the source cannot
   * support it — never a grams value reinterpreted as a serving count.
   */
  consumedGrams: number | null;
}

/** What the entry is, structurally. */
export type ConsumedEntryShape =
  /** Legacy flat food (no `meal_group`). */
  | 'flat_food'
  /** Grouped logged meal with a structurally valid `meal_group`. */
  | 'grouped_meal'
  /**
   * Carries a `meal_group` key that is not a usable group. Deliberately NOT
   * downgraded to `flat_food`: a broken group must not silently become a valid
   * flat food with a different quantity basis.
   */
  | 'malformed_group';

/** Where a component's nutrition evidence actually came from. */
export type ConsumedEvidenceProvenance =
  /** Immutable nutrition captured on the logged instance itself. */
  | 'instance_snapshot'
  /**
   * Immutable snapshot captured on a recipe-reference component at attach time
   * (`nutrition_snapshot`), pinned by `recipe_version_token`.
   */
  | 'recipe_reference_snapshot'
  /**
   * Resolved by looking up a mutable catalog row today. This is a VERSIONED
   * DEPENDENCY, not proof of what was eaten, and is labelled as such.
   */
  | 'legacy_catalog_lookup'
  /** A reference exists but no nutrition evidence could be resolved. */
  | 'unresolved';

/** Micronutrient evidence for one contributor, in absolute consumed amounts. */
export interface NormalizedMicronutrients {
  potassium_mg: number | null;
  magnesium_mg: number | null;
  iron_mg: number | null;
  calcium_mg: number | null;
  zinc_mg: number | null;
  folate_ug: number | null;
  vitamin_a_ug_rae: number | null;
  vitamin_c_mg: number | null;
  vitamin_d_ug: number | null;
  vitamin_b12_ug: number | null;
  sodium_mg: number | null;
}

/**
 * Immutable per-serving nutrition evidence for a food reference.
 *
 * The normalizer never fetches this. Callers resolve it (from an instance
 * snapshot or, explicitly labelled, from the legacy catalog) and hand it in, so
 * normalization stays pure and testable.
 */
export interface ConsumedFoodEvidence {
  foodObjectId: string;
  canonicalName: string;
  brandName: string | null;
  category: string | null;
  tags: string[];
  provenance: ConsumedEvidenceProvenance;
  /**
   * Version/identity of the evidence. For a legacy catalog lookup this is the
   * catalog dependency token; for a snapshot it is the captured version.
   */
  evidenceToken: string | null;
  /** Per-serving figures. Null means the source did not report the nutrient. */
  perServing: {
    calories: number | null;
    protein_g: number | null;
    fiber_g: number | null;
    added_sugar_g: number | null;
    omega3_g: number | null;
    omega6_g: number | null;
    micronutrients: NormalizedMicronutrients;
  };
  processingClass: ProcessingClass | null;
  processingClassOverride: ProcessingClass | null;
}

/** An issue found while normalizing. Surfaced, never silently repaired. */
export type NormalizationIssueCode =
  | 'malformed_meal_group'
  | 'grouped_totals_missing'
  | 'parent_component_calorie_mismatch'
  | 'component_quantity_basis_unknown'
  | 'recipe_reference_snapshot_missing'
  | 'food_reference_unresolved'
  | 'added_sugar_unknown'
  | 'grams_not_convertible'
  | 'non_finite_quantity';

export interface NormalizationIssue {
  code: NormalizationIssueCode;
  /** Entry this issue belongs to. */
  entryId: string;
  /** Component this issue belongs to, when component-scoped. */
  componentId?: string;
  detail: string;
}

/**
 * One component (ingredient / item) of a consumed entry, expressed as its
 * absolute consumed contribution.
 */
export interface NormalizedConsumedComponent {
  componentId: string;
  name: string;
  componentKind: MealComponentKind;
  foodObjectId: string | null;
  /** The basis declared by the source component, before scaling. */
  declaredNutritionBasis: MealNutritionBasis;
  /**
   * Multiplier applied to this component's own figures. A `per_component`
   * child keeps 1 even when the parent was eaten twice, because the parent's
   * consumed servings already scaled the group totals.
   */
  appliedMultiplier: number;
  /** Absolute consumed contribution. Null where unknown. */
  calories: number | null;
  protein_g: number | null;
  fiber_g: number | null;
  added_sugar_g: number | null;
  omega3_g: number | null;
  omega6_g: number | null;
  micronutrients: NormalizedMicronutrients;
  processingClass: ProcessingClass | null;
  processingClassOverride: ProcessingClass | null;
  category: string | null;
  tags: string[];
  brandName: string | null;
  provenance: ConsumedEvidenceProvenance;
  evidenceToken: string | null;
}

/** A single journal entry normalized into consumed truth. */
export interface NormalizedConsumedEntry {
  entryId: string;
  personId: string;
  /** UTC instant as stored. */
  occurredAtUtc: string;
  entryType: string;
  displayName: string;
  shape: ConsumedEntryShape;
  quantityBasis: ConsumedQuantityBasis;
  /**
   * Consumed-day attribution for this entry, derived from its own recorded
   * metadata. Carries the timezone the scoring block must be read in.
   */
  dayAttribution: ConsumedDayAttribution;

  /** Absolute consumed parent totals. */
  calories: NormalizedNutrient;
  protein_g: NormalizedNutrient;
  fiber_g: NormalizedNutrient;
  added_sugar_g: NormalizedNutrient;

  components: NormalizedConsumedComponent[];
  /**
   * True when `components` describe the same intake already counted in the
   * parent totals. Consumers must use components for QUALITY evidence
   * (processing, plant colour, micronutrients, omegas) and the parent totals
   * for QUANTITY, never both for the same quantity.
   */
  componentsAreSubsetOfParentTotals: boolean;
  /** Whether declared parent calories agree with the component sum. */
  parentComponentConsistency: 'consistent' | 'mismatch' | 'not_comparable';

  issues: NormalizationIssue[];
  normalizerVersion: string;
}

/** All consumed entries attributed to one person/day. */
export interface NormalizedConsumedDay {
  personId: string;
  /** Canonical local calendar date these entries were attributed to. */
  dateLocal: string;
  entries: NormalizedConsumedEntry[];
  issues: NormalizationIssue[];
  normalizerVersion: string;
}

/** Neutral micronutrient record with every nutrient unknown. */
export function emptyMicronutrients(): NormalizedMicronutrients {
  return {
    potassium_mg: null,
    magnesium_mg: null,
    iron_mg: null,
    calcium_mg: null,
    zinc_mg: null,
    folate_ug: null,
    vitamin_a_ug_rae: null,
    vitamin_c_mg: null,
    vitamin_d_ug: null,
    vitamin_b12_ug: null,
    sodium_mg: null,
  };
}

export const MICRONUTRIENT_KEYS = [
  'potassium_mg',
  'magnesium_mg',
  'iron_mg',
  'calcium_mg',
  'zinc_mg',
  'folate_ug',
  'vitamin_a_ug_rae',
  'vitamin_c_mg',
  'vitamin_d_ug',
  'vitamin_b12_ug',
  'sodium_mg',
] as const satisfies ReadonlyArray<keyof NormalizedMicronutrients>;

/** A nutrient nothing reported. */
export function unknownNutrient(unknownContributorCount = 0): NormalizedNutrient {
  return {
    value: null,
    availability: 'unknown',
    knownContributorCount: 0,
    unknownContributorCount,
  };
}

/**
 * Combine per-contributor nutrient figures into one total, keeping honest
 * availability. A known subtotal alongside an unknown contributor is
 * `partial` — a lower bound, not a daily total.
 */
export function combineNutrient(
  contributions: ReadonlyArray<number | null>,
): NormalizedNutrient {
  let sum = 0;
  let known = 0;
  let unknown = 0;

  for (const contribution of contributions) {
    if (typeof contribution === 'number' && Number.isFinite(contribution)) {
      sum += contribution;
      known += 1;
    } else {
      unknown += 1;
    }
  }

  if (known === 0) {
    return unknownNutrient(unknown);
  }

  return {
    value: roundTo(sum, 4),
    availability: unknown > 0 ? 'partial' : 'known',
    knownContributorCount: known,
    unknownContributorCount: unknown,
  };
}

/** Round without introducing float noise into stored evidence. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Finite-number guard used throughout normalization. */
export function finiteOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/** Multiply a possibly-unknown value, preserving unknown. */
export function scaleOrNull(value: number | null, multiplier: number): number | null {
  if (value === null) return null;
  return roundTo(value * multiplier, 6);
}
