import { deriveAgeYears, extractBodyInputsFromProfile, normalizeSexForEstimate } from '../bodyInputs';
import {
  NUTRITION_TARGETS_POLICY_ID,
  NUTRITION_TARGETS_POLICY_VERSION,
  proposeNutritionTargets,
} from '../proposal';

// Constructed from local components (not an ISO string) so this test is not
// sensitive to the runner's timezone offset shifting a date-only DOB string
// (parsed as UTC midnight) across a local day boundary.
const NOW = new Date(2026, 7, 22, 12, 0, 0); // Aug 22, 2026, local noon

describe('deriveAgeYears', () => {
  it('computes whole years once this year\'s birthday has clearly passed', () => {
    expect(deriveAgeYears('1996-01-01', NOW)).toBe(30);
  });

  it('has not yet incremented this year when the birthday clearly has not happened yet', () => {
    expect(deriveAgeYears('1996-12-25', NOW)).toBe(29);
  });

  it('returns null for missing or unparseable input', () => {
    expect(deriveAgeYears(null, NOW)).toBeNull();
    expect(deriveAgeYears(undefined, NOW)).toBeNull();
    expect(deriveAgeYears('not-a-date', NOW)).toBeNull();
  });
});

describe('normalizeSexForEstimate', () => {
  it('passes male/female through unchanged', () => {
    expect(normalizeSexForEstimate('male')).toBe('male');
    expect(normalizeSexForEstimate('female')).toBe('female');
  });

  it('maps any other non-empty captured value to unspecified rather than guessing', () => {
    expect(normalizeSexForEstimate('nonbinary')).toBe('unspecified');
    expect(normalizeSexForEstimate('prefer_not_to_say')).toBe('unspecified');
  });

  it('returns null when nothing was captured', () => {
    expect(normalizeSexForEstimate(null)).toBeNull();
    expect(normalizeSexForEstimate(undefined)).toBeNull();
    expect(normalizeSexForEstimate('')).toBeNull();
  });
});

describe('extractBodyInputsFromProfile', () => {
  it('reuses existing onboarding-captured body fields verbatim (no re-asking)', () => {
    const inputs = extractBodyInputsFromProfile(
      { date_of_birth: '1996-08-22', sex: 'female', height_cm: 165, weight_kg: 60 },
      NOW,
    );
    expect(inputs).toEqual({ age_years: 30, sex: 'female', height_cm: 165, weight_kg: 60 });
  });

  it('is null-safe field-by-field when some profile fields were never captured', () => {
    const inputs = extractBodyInputsFromProfile({}, NOW);
    expect(inputs).toEqual({ age_years: null, sex: null, height_cm: null, weight_kg: null });
  });
});

describe('proposeNutritionTargets', () => {
  const fullProfile = {
    date_of_birth: '1996-08-22',
    sex: 'male' as const,
    height_cm: 178,
    weight_kg: 75,
  };

  it('stamps the policy id/version on every proposal', () => {
    const proposal = proposeNutritionTargets({ profile: fullProfile, goals: null, now: NOW });
    expect(proposal.policyId).toBe(NUTRITION_TARGETS_POLICY_ID);
    expect(proposal.policyVersion).toBe(NUTRITION_TARGETS_POLICY_VERSION);
  });

  it('requests progressive activity confirmation when activity_baseline is not yet known', () => {
    const proposal = proposeNutritionTargets({ profile: fullProfile, goals: null, now: NOW });
    expect(proposal.needsActivity).toBe(true);
    expect(proposal.activityBaseline).toBeNull();
    expect(proposal.estimate.maintenanceCalories).toBeNull();
    expect(proposal.estimate.reasonCodes).toContain('missing_activity_baseline');
  });

  it('does not ask again once activity_baseline is already known, and computes an estimate', () => {
    const proposal = proposeNutritionTargets({
      profile: { ...fullProfile, activity_baseline: 'moderately_active' },
      goals: null,
      now: NOW,
    });
    expect(proposal.needsActivity).toBe(false);
    expect(proposal.activityBaseline).toBe('moderately_active');
    expect(proposal.estimate.maintenanceCalories).not.toBeNull();
  });

  it('recognizes legacy athlete as already-known (review item: activity_mapping) and still estimates via very_active', () => {
    const proposal = proposeNutritionTargets({
      profile: { ...fullProfile, activity_baseline: 'athlete' },
      goals: null,
      now: NOW,
    });
    expect(proposal.needsActivity).toBe(false);
    expect(proposal.activityBaseline).toBe('athlete');
    expect(proposal.estimate.maintenanceCalories).not.toBeNull();
  });

  it('treats an unrecognized activity_baseline value as unknown rather than guessing a multiplier', () => {
    const proposal = proposeNutritionTargets({
      profile: { ...fullProfile, activity_baseline: 'super_human' },
      goals: null,
      now: NOW,
    });
    expect(proposal.needsActivity).toBe(true);
    expect(proposal.activityBaseline).toBeNull();
  });

  it('exposes no existingConfirmed target when goals are default/unset', () => {
    const proposal = proposeNutritionTargets({
      profile: fullProfile,
      goals: {
        dailyCalorieGoal: 2500,
        macroGoals: { protein_g: 150, carbs_g: 250, fat_g: 80 },
        isDefault: true,
        macroGoalsSet: false,
      },
      now: NOW,
    });
    expect(proposal.existingConfirmed).toBeNull();
  });

  it('surfaces the existing confirmed target (for the Adjust/re-open surface) once one exists', () => {
    const proposal = proposeNutritionTargets({
      profile: fullProfile,
      goals: {
        dailyCalorieGoal: 2200,
        macroGoals: { protein_g: 160, carbs_g: 200, fat_g: 70 },
        isDefault: false,
        macroGoalsSet: true,
      },
      now: NOW,
    });
    expect(proposal.existingConfirmed).toEqual({
      dailyCalorieGoal: 2200,
      macroGoals: { protein_g: 160, carbs_g: 200, fat_g: 70 },
      macroGoalsSet: true,
    });
  });
});
