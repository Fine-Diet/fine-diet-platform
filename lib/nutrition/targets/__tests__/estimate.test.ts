import {
  ESTIMATE_MODEL_VERSION,
  estimateMaintenanceCalories,
  isNutritionTargetsActivityBaseline,
  mapActivityBaselineToEerCategory,
  type NutritionTargetsEstimateInput,
} from '../estimate';

const FULL_INPUT: NutritionTargetsEstimateInput = {
  age_years: 30,
  sex: 'male',
  height_cm: 178,
  weight_kg: 75,
  activity_baseline: 'moderately_active',
};

describe('ESTIMATE_MODEL_VERSION', () => {
  it('is the reviewed NASEM 2023 adult EER equation, explicitly versioned', () => {
    expect(ESTIMATE_MODEL_VERSION).toBe('nasem_eer_2023.adult.v1');
  });
});

describe('mapActivityBaselineToEerCategory (review item: activity_mapping)', () => {
  it('maps the four canonical stored values deterministically onto the four NASEM EER categories', () => {
    expect(mapActivityBaselineToEerCategory('sedentary')).toBe('inactive');
    expect(mapActivityBaselineToEerCategory('lightly_active')).toBe('low_active');
    expect(mapActivityBaselineToEerCategory('moderately_active')).toBe('active');
    expect(mapActivityBaselineToEerCategory('very_active')).toBe('very_active');
  });

  it('maps legacy athlete onto very_active without introducing a fifth category or new multiplier', () => {
    expect(mapActivityBaselineToEerCategory('athlete')).toBe('very_active');
  });
});

describe('isNutritionTargetsActivityBaseline', () => {
  it('accepts the four Profile-offered values', () => {
    expect(isNutritionTargetsActivityBaseline('sedentary')).toBe(true);
    expect(isNutritionTargetsActivityBaseline('lightly_active')).toBe(true);
    expect(isNutritionTargetsActivityBaseline('moderately_active')).toBe(true);
    expect(isNutritionTargetsActivityBaseline('very_active')).toBe(true);
  });

  it('also recognizes legacy athlete as already-known (do not re-ask activity for it)', () => {
    expect(isNutritionTargetsActivityBaseline('athlete')).toBe(true);
  });

  it('rejects unknown values and non-strings', () => {
    expect(isNutritionTargetsActivityBaseline('extremely_active')).toBe(false);
    expect(isNutritionTargetsActivityBaseline(null)).toBe(false);
    expect(isNutritionTargetsActivityBaseline(undefined)).toBe(false);
    expect(isNutritionTargetsActivityBaseline(42)).toBe(false);
  });
});

describe('estimateMaintenanceCalories', () => {
  it('matches the published NASEM 2023 worked example (22yo woman, 165cm, 63kg, low active)', () => {
    // National Academies "Dietary Reference Intakes for Energy" (2023) worked
    // example: 575.77 - (7.01*22) + (6.60*165) + (12.14*63) = 2,275 kcal/day.
    const result = estimateMaintenanceCalories({
      age_years: 22,
      sex: 'female',
      height_cm: 165,
      weight_kg: 63,
      activity_baseline: 'lightly_active',
    });
    expect(result.maintenanceCalories).toBe(2275);
    expect(result.modelVersion).toBe(ESTIMATE_MODEL_VERSION);
  });

  it('returns a positive estimate and stamps the model version when all inputs are present', () => {
    const result = estimateMaintenanceCalories(FULL_INPUT);
    expect(result.maintenanceCalories).not.toBeNull();
    expect(result.maintenanceCalories).toBeGreaterThan(0);
    expect(result.modelVersion).toBe(ESTIMATE_MODEL_VERSION);
    expect(result.reasonCodes).not.toContain('missing_age');
  });

  it('is null with reasonCodes when body inputs are missing (never fabricates a number)', () => {
    const result = estimateMaintenanceCalories({
      age_years: null,
      sex: null,
      height_cm: null,
      weight_kg: 70,
      activity_baseline: 'sedentary',
    });
    expect(result.maintenanceCalories).toBeNull();
    expect(result.reasonCodes).toContain('missing_age');
    expect(result.reasonCodes).toContain('missing_height');
    expect(result.reasonCodes).toContain('missing_sex');
  });

  it('is null and flags missing_activity_baseline when body inputs are present but activity is not yet known', () => {
    const result = estimateMaintenanceCalories({
      age_years: 30,
      sex: 'female',
      height_cm: 165,
      weight_kg: 60,
      activity_baseline: null,
    });
    expect(result.maintenanceCalories).toBeNull();
    expect(result.reasonCodes).toEqual(['missing_activity_baseline']);
  });

  it('higher activity category yields a higher estimate for identical body inputs', () => {
    const low = estimateMaintenanceCalories({ ...FULL_INPUT, activity_baseline: 'sedentary' });
    const high = estimateMaintenanceCalories({ ...FULL_INPUT, activity_baseline: 'very_active' });
    expect(high.maintenanceCalories!).toBeGreaterThan(low.maintenanceCalories!);
  });

  // Review item "applicability_and_bounds": the estimator requires supported
  // adult inputs and must return null (routing to manual entry) rather than
  // clamping an unsupported input into a fabricated number.
  describe('applicability_and_bounds (review item)', () => {
    it('is null and flags unspecified/non-male-female sex rather than using a neutral offset', () => {
      const result = estimateMaintenanceCalories({ ...FULL_INPUT, sex: 'unspecified' });
      expect(result.maintenanceCalories).toBeNull();
      expect(result.reasonCodes).toContain('sex_not_supported_for_estimate');
    });

    it('is null and flags age_below_supported_adult_minimum for under-19 ages rather than extrapolating', () => {
      const result = estimateMaintenanceCalories({ ...FULL_INPUT, age_years: 12 });
      expect(result.maintenanceCalories).toBeNull();
      expect(result.reasonCodes).toContain('age_below_supported_adult_minimum');
    });

    it('is null and flags invalid_height_or_weight for non-positive values rather than clamping', () => {
      const result = estimateMaintenanceCalories({ ...FULL_INPUT, height_cm: 0 });
      expect(result.maintenanceCalories).toBeNull();
      expect(result.reasonCodes).toContain('invalid_height_or_weight');
    });

    it('never clamps an implausible-but-technically-valid combination into a safety-bounded number', () => {
      // A 19-year-old with unusually low height/weight is still a supported
      // adult input by this contract (no output clamp exists any more) —
      // the equation's raw output is returned as-is, however low.
      const result = estimateMaintenanceCalories({
        age_years: 19,
        sex: 'male',
        height_cm: 120,
        weight_kg: 30,
        activity_baseline: 'sedentary',
      });
      expect(result.reasonCodes).not.toContain('clamped_to_safety_bounds');
    });
  });

  it('never returns a deficit/surplus-adjusted value — output is maintenance only', () => {
    // No `goal`/`deficit`/`surplus` parameter exists on the input type; this
    // test guards against a future regression that would thread one in.
    const result = estimateMaintenanceCalories(FULL_INPUT);
    expect(result).not.toHaveProperty('deficitCalories');
    expect(result).not.toHaveProperty('surplusCalories');
    expect(result).not.toHaveProperty('goalAdjustedCalories');
  });
});
