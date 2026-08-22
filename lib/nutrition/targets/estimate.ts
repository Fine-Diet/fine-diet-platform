/**
 * Nutrition Targets v1 — maintenance-calorie estimator.
 *
 * ============================================================================
 * Estimator policy (v1, reviewed)
 *
 * The founder-approved governing doc ("Fine Diet Nutrition Targets v1 —
 * Confirmed Product & Build Plan" v2, "Implementation hold inside the
 * authorized feature") deferred the exact energy-requirement equation,
 * activity-category mapping, and applicability/safety bounds to a separate
 * calculation-policy review before the estimator could be treated as locked.
 *
 * That review happened in the Bridge thread FD-PLATFORM:nutrition-targets-v1
 * (review_note message 4894c62b-8b06-4b93-a910-e21a0a131785). This module
 * implements exactly what that review specified:
 *
 *  - Equation: the 2023 National Academies of Sciences, Engineering, and
 *    Medicine (NASEM) adult Estimated Energy Requirement (EER) equations
 *    (Dietary Reference Intakes for Energy, 2023 — the equations use age,
 *    sex, height, weight, and one of four physical-activity categories),
 *    not the earlier Mifflin-St Jeor placeholder. Versioned explicitly as
 *    `nasem_eer_2023.adult.v1` and persisted with every estimate so it can
 *    be identified, audited, and revised without silently changing a
 *    previously-confirmed target (see NutritionTargetProvenance).
 *  - Activity mapping: see `mapActivityBaselineToEerCategory` below.
 *  - Applicability/safety bounds: see `estimateMaintenanceCalories` below —
 *    the estimator now requires supported adult inputs and returns null
 *    (routing the UI to manual entry) rather than clamping an unsupported
 *    input into a fabricated number.
 *
 * A formal Second Brain decision record ratifying this as permanent nutrition
 * policy is still pending (decision 8f36a31f is `status: proposed`), so this
 * remains the *reviewed* v1 implementation basis, not a claim that no future
 * revision is possible. Any change to the equation, mapping, or bounds must
 * bump `ESTIMATE_MODEL_VERSION` so existing provenance stays auditable.
 * ============================================================================
 */

export const ESTIMATE_MODEL_VERSION = 'nasem_eer_2023.adult.v1';

/**
 * Reuses the canonical `activity_baseline` enum already captured in
 * people.metadata (Profile → Health & Lifestyle) rather than inventing a
 * second activity taxonomy. See lib/onboarding/defaultOnboardingFlow.ts
 * ACTIVITY_LEVEL_OPTS / pages/journal/profile.tsx ACTIVITY_OPTIONS.
 *
 * `athlete` is accepted by onboarding but not yet offered as a Profile
 * choice; it is preserved verbatim in profile storage (never rewritten) and
 * only mapped, at estimation time, onto the NASEM `very_active` category —
 * see `mapActivityBaselineToEerCategory`.
 */
export type NutritionTargetsActivityBaseline =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'athlete';

/** Offered as new choices in the progressive Activity step (Nutrition Targets §3 / Profile Health & Lifestyle). */
export const ACTIVITY_BASELINE_VALUES: readonly NutritionTargetsActivityBaseline[] = [
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
];

/**
 * All stored activity_baseline values considered already-known, so
 * Nutrition Targets v1 does not re-ask activity when any of these is
 * already captured — including the legacy onboarding-only `athlete` value,
 * which is not offered as a new choice but must not be treated as unknown
 * just because it isn't one of the four Profile-facing options.
 */
const KNOWN_ACTIVITY_BASELINE_VALUES: readonly NutritionTargetsActivityBaseline[] = [
  ...ACTIVITY_BASELINE_VALUES,
  'athlete',
];

export function isNutritionTargetsActivityBaseline(
  value: unknown,
): value is NutritionTargetsActivityBaseline {
  return (
    typeof value === 'string' &&
    (KNOWN_ACTIVITY_BASELINE_VALUES as readonly string[]).includes(value)
  );
}

/** The four NASEM 2023 adult EER physical-activity categories (reviewed activity_mapping). */
export type NasemEerActivityCategory = 'inactive' | 'low_active' | 'active' | 'very_active';

/**
 * Deterministic, estimation-only mapping from the canonical stored
 * activity_baseline taxonomy to the four NASEM EER categories. This never
 * rewrites the stored profile value — it only decides which EER equation to
 * use. Legacy `athlete` maps to `very_active`; no fifth estimator category
 * or new multiplier is introduced for it (per review).
 */
const ACTIVITY_TO_EER_CATEGORY: Record<NutritionTargetsActivityBaseline, NasemEerActivityCategory> = {
  sedentary: 'inactive',
  lightly_active: 'low_active',
  moderately_active: 'active',
  very_active: 'very_active',
  athlete: 'very_active',
};

export function mapActivityBaselineToEerCategory(
  value: NutritionTargetsActivityBaseline,
): NasemEerActivityCategory {
  return ACTIVITY_TO_EER_CATEGORY[value];
}

export type NutritionTargetsSex = 'male' | 'female' | 'unspecified';

export interface NutritionTargetsBodyInputs {
  age_years: number | null;
  sex: NutritionTargetsSex | null;
  height_cm: number | null;
  weight_kg: number | null;
}

export interface NutritionTargetsEstimateInput extends NutritionTargetsBodyInputs {
  activity_baseline: NutritionTargetsActivityBaseline | null;
}

export interface NutritionTargetsEstimate {
  /** Suggested maintenance calories, or null when required/eligible inputs are missing. */
  maintenanceCalories: number | null;
  modelVersion: string;
  /** Why the estimate is null, or informational notes about assumptions made. */
  reasonCodes: string[];
  inputsUsed: NutritionTargetsEstimateInput;
}

/**
 * NASEM equations are published only for adults 19+. Applying them below
 * this age would be an unsupported extrapolation, so the estimator declines
 * (returns null) rather than fabricating a number — the caller routes to
 * manual target entry instead (Nutrition Targets v1 §5/§6, review item
 * "applicability_and_bounds"). Pediatric and special life-stage (e.g.
 * pregnancy/lactation) equations exist in the same NASEM report but are out
 * of scope for this general-adult v1 estimator; this module does not claim
 * applicability to those groups and does not add life-stage UI for them.
 */
const MIN_SUPPORTED_ADULT_AGE_YEARS = 19;

interface EerCoefficients {
  intercept: number;
  agePerYear: number;
  heightPerCm: number;
  weightPerKg: number;
}

/**
 * NASEM (2023) Dietary Reference Intakes for Energy — adult (19+) EER
 * equations: EER = intercept + agePerYear*age[y] + heightPerCm*height[cm] +
 * weightPerKg*weight[kg]. Source: National Academies "Dietary Reference
 * Intakes for Energy" (2023), Table S-3 (reproduced identically by Health
 * Canada's dietary reference intake tables).
 */
const EER_COEFFICIENTS: Record<'male' | 'female', Record<NasemEerActivityCategory, EerCoefficients>> = {
  male: {
    inactive: { intercept: 753.07, agePerYear: -10.83, heightPerCm: 6.5, weightPerKg: 14.1 },
    low_active: { intercept: 581.47, agePerYear: -10.83, heightPerCm: 8.3, weightPerKg: 14.94 },
    active: { intercept: 1004.82, agePerYear: -10.83, heightPerCm: 6.52, weightPerKg: 15.91 },
    very_active: { intercept: -517.88, agePerYear: -10.83, heightPerCm: 15.61, weightPerKg: 19.11 },
  },
  female: {
    inactive: { intercept: 584.9, agePerYear: -7.01, heightPerCm: 5.72, weightPerKg: 11.71 },
    low_active: { intercept: 575.77, agePerYear: -7.01, heightPerCm: 6.6, weightPerKg: 12.14 },
    active: { intercept: 710.25, agePerYear: -7.01, heightPerCm: 6.54, weightPerKg: 12.34 },
    very_active: { intercept: 511.83, agePerYear: -7.01, heightPerCm: 9.07, weightPerKg: 12.56 },
  },
};

/**
 * Estimate a suggested maintenance-energy requirement from body inputs plus
 * activity, using the NASEM 2023 adult EER equations. Never infers a
 * deficit/surplus (Nutrition Targets v1 §4) — this is maintenance only, and
 * the caller is responsible for treating it as a starting point subject to
 * user confirm/edit, never an imposed value.
 *
 * Eligibility (review item "applicability_and_bounds" — replaces the prior
 * output clamp): the NASEM equations only support adults with a known
 * male/female calculation sex. When age, height, weight, sex, or activity
 * are missing, OR age is under 19, OR sex is not male/female (e.g.
 * `unspecified`), OR height/weight are not positive numbers, this returns
 * `maintenanceCalories: null` with explanatory reasonCodes instead of
 * fabricating/clamping a value — callers must route the user to manual
 * target entry in that case.
 */
export function estimateMaintenanceCalories(
  input: NutritionTargetsEstimateInput,
): NutritionTargetsEstimate {
  const { age_years, sex, height_cm, weight_kg, activity_baseline } = input;
  const reasonCodes: string[] = [];

  if (age_years == null) reasonCodes.push('missing_age');
  if (height_cm == null) reasonCodes.push('missing_height');
  if (weight_kg == null) reasonCodes.push('missing_weight');
  if (sex == null) reasonCodes.push('missing_sex');

  if (age_years == null || height_cm == null || weight_kg == null || sex == null) {
    return { maintenanceCalories: null, modelVersion: ESTIMATE_MODEL_VERSION, reasonCodes, inputsUsed: input };
  }

  if (age_years < MIN_SUPPORTED_ADULT_AGE_YEARS) reasonCodes.push('age_below_supported_adult_minimum');
  if (!(height_cm > 0) || !(weight_kg > 0)) reasonCodes.push('invalid_height_or_weight');
  if (sex !== 'male' && sex !== 'female') reasonCodes.push('sex_not_supported_for_estimate');

  const eligibleForEstimate =
    age_years >= MIN_SUPPORTED_ADULT_AGE_YEARS &&
    height_cm > 0 &&
    weight_kg > 0 &&
    (sex === 'male' || sex === 'female');

  if (!eligibleForEstimate) {
    return { maintenanceCalories: null, modelVersion: ESTIMATE_MODEL_VERSION, reasonCodes, inputsUsed: input };
  }

  if (activity_baseline == null) {
    reasonCodes.push('missing_activity_baseline');
    return { maintenanceCalories: null, modelVersion: ESTIMATE_MODEL_VERSION, reasonCodes, inputsUsed: input };
  }

  const eerCategory = mapActivityBaselineToEerCategory(activity_baseline);
  const coeff = EER_COEFFICIENTS[sex][eerCategory];
  const raw =
    coeff.intercept + coeff.agePerYear * age_years + coeff.heightPerCm * height_cm + coeff.weightPerKg * weight_kg;
  const maintenanceCalories = Math.round(raw);

  return { maintenanceCalories, modelVersion: ESTIMATE_MODEL_VERSION, reasonCodes, inputsUsed: input };
}
