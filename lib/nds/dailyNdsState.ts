/**
 * The daily NDS response contract.
 *
 * NDS Integrity v1. Pure module — safe to import from browser and server code.
 *
 * The whole point of this file is that "no score" and "a score of zero" become
 * DIFFERENT VALUES that the type system will not let a consumer confuse. The
 * previous shape had one channel — a number — so an empty day, a day whose inputs
 * could not be interpreted, a failed computation, and a genuinely terrible day of
 * eating all arrived as `0`, and every consumer printed the same confident zero.
 *
 * States:
 *   fresh             the score matches the day's current source revision
 *   updating          a real score is shown, but newer intake is not in it yet
 *   empty             the day is verified to contain no consumption
 *   insufficient_data inputs exist but cannot be scored honestly
 *   unavailable       the score could not be determined at all
 *
 * `empty` and `insufficient_data` are deliberately separate. Nothing logged is a
 * fact about the day. Logged food that cannot be interpreted is a fact about our
 * data, and presenting it as a low score would blame the person for our gap.
 */

import type { DayProvenanceSummary } from './dayIdentity';
import type { NutrientAvailability } from './consumedInputs/types';

export type DailyNdsStateKind =
  | 'fresh'
  | 'updating'
  | 'empty'
  | 'insufficient_data'
  | 'unavailable';

export interface DailyNdsSubscores {
  wfr: number;
  ps: number;
  pnd: number;
  fp: number;
  as: number;
  mnc: number;
  ob: number;
}

export interface DailyNdsReadings {
  wfr_percent: number | null;
  protein_score_10: number | null;
  fiber_g: number | null;
  added_sugar_g: number | null;
  plant_variety_score_10: number | null;
  omega_balance_score_10: number | null;
  micronutrient_coverage_score_10: number | null;
}

/**
 * How the day this score covers was determined.
 *
 * This reuses the vocabulary of DayProvenanceSummary in lib/nds/dayIdentity.ts
 * rather than introducing a parallel set of labels for the same fact:
 * `explicit` = every entry carried validated server-authored metadata,
 * `legacy_unverified` = the labelled UTC compatibility bucket was used,
 * `mixed` = both, reported as such rather than rounded to the better label.
 */
export type DailyNdsDayProvenance = DayProvenanceSummary;

export interface DailyNdsVersions {
  nds_version: string;
  classifier_version: string;
  normalizer_version: string;
  day_policy_version: string;
}

/** Why a day could not be scored, or could only be scored partially. */
export type DailyNdsLimitation =
  | 'added_sugar_unknown'
  | 'malformed_meal_group'
  | 'grouped_totals_missing'
  | 'recipe_reference_snapshot_missing'
  | 'food_reference_unresolved'
  | 'parent_component_calorie_mismatch'
  | 'quantity_basis_unknown'
  | 'no_scorable_entries';

export interface DailyNdsCoverage {
  added_sugar: NutrientAvailability;
  /** Entries that contributed to the score. */
  scored_entry_count: number;
  /** Entries present for the day that could not be interpreted. */
  unscorable_entry_count: number;
  limitations: DailyNdsLimitation[];
}

interface DailyNdsBase {
  date_local: string;
  person_id: string;
  day_provenance: DailyNdsDayProvenance;
  versions: DailyNdsVersions;
  coverage: DailyNdsCoverage;
}

/** A score that reflects everything currently logged for the day. */
export interface DailyNdsFresh extends DailyNdsBase {
  state: 'fresh';
  nds_score_100: number;
  subscores_10: DailyNdsSubscores;
  readings: DailyNdsReadings;
  computed_as_of: string;
  source_revision: number;
}

/**
 * A previously computed score, shown while a newer one is being produced.
 *
 * This exists so a stale-but-real number can be labelled instead of silently
 * presented as current. `stale_source_revision` is what the score was computed
 * from; `current_source_revision` is what the day is now.
 */
export interface DailyNdsUpdating extends DailyNdsBase {
  state: 'updating';
  nds_score_100: number;
  subscores_10: DailyNdsSubscores;
  readings: DailyNdsReadings;
  computed_as_of: string;
  stale_source_revision: number | null;
  current_source_revision: number;
}

/** The day verifiably contains no consumption. */
export interface DailyNdsEmpty extends DailyNdsBase {
  state: 'empty';
  source_revision: number;
}

/** Consumption exists but cannot be scored honestly. */
export interface DailyNdsInsufficientData extends DailyNdsBase {
  state: 'insufficient_data';
  source_revision: number;
}

/** The score could not be determined. Carries no number of any kind. */
export interface DailyNdsUnavailable extends DailyNdsBase {
  state: 'unavailable';
  /** Stable, non-sensitive reason code. Never a raw error message. */
  reason: 'computation_failed' | 'storage_unavailable' | 'not_authorized';
}

export type DailyNdsState =
  | DailyNdsFresh
  | DailyNdsUpdating
  | DailyNdsEmpty
  | DailyNdsInsufficientData
  | DailyNdsUnavailable;

/**
 * True when this state carries a score the UI may print as a number.
 *
 * Consumers should branch on this rather than reading `nds_score_100` off an
 * arbitrary state, because the field does not exist on three of the five states.
 */
export function hasPrintableScore(
  state: DailyNdsState,
): state is DailyNdsFresh | DailyNdsUpdating {
  return state.state === 'fresh' || state.state === 'updating';
}

/**
 * True when the state should be presented as provisional rather than settled.
 */
export function isProvisional(state: DailyNdsState): boolean {
  return state.state === 'updating';
}

export function emptyReadings(): DailyNdsReadings {
  return {
    wfr_percent: null,
    protein_score_10: null,
    fiber_g: null,
    added_sugar_g: null,
    plant_variety_score_10: null,
    omega_balance_score_10: null,
    micronutrient_coverage_score_10: null,
  };
}

/**
 * True when the day's membership rests on the UTC compatibility bucket for at
 * least one entry, so the reported day is not a verified subject-local day.
 *
 * Callers use this to avoid asserting more precision than exists; it is not a
 * reason to withhold the score.
 */
export function dayIsVerifiedLocal(state: DailyNdsState): boolean {
  return state.day_provenance === 'explicit' || state.day_provenance === 'empty';
}
