/**
 * Unit tests for the extracted onboarding persistence mapping.
 *
 * Locks in the contract that `buildProfilePatch` produces the canonical
 * metadata fields the rest of the app reads, plus the `onboarding` blob and
 * `onboarding_completed_at`, without ever storing age or requiring optional
 * fields. The admin preview imports the answers type from the same source but
 * never calls this mapper — these tests guard the live write path only.
 */
import { describe, it, expect } from '@jest/globals';
import {
  buildMealSchedule,
  buildProfilePatch,
  buildAppCopyMealSchedule,
  convertHeightDisplayValue,
  convertWeightDisplayValue,
  toHeightCm,
  toNumberOrNull,
  toWeightKg,
} from '../buildProfilePatch';
import { isUsableSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';
import {
  INITIAL_ANSWERS,
  ONBOARDING_PERSONAS,
  getPersonaAnswers,
  isOnboardingPersona,
} from '../defaultOnboardingFlow';
import type { OnboardingAnswers } from '../defaultOnboardingFlow';

const FILLED: OnboardingAnswers = {
  ...INITIAL_ANSWERS,
  primary_goal: 'lose_weight',
  date_of_birth: '1990-05-12',
  sex: 'female',
  height_value: '165',
  height_unit: 'cm',
  weight_value: '150',
  weight_unit: 'lb',
  body_fat_percent: '24',
  goal_state: 'lose',
  meal_slots: ['breakfast', 'lunch', 'dinner'],
  eating_window: '12h',
  dining_out_frequency: 'weekly',
  dietary_style: 'mediterranean',
  allergies: ['dairy', 'wheat'],
  disliked_foods: 'cilantro, liver',
  preferred_proteins: ['chicken', 'fish'],
  cooking_confidence: 'comfortable',
  kitchen_access: 'full',
  household_size: '3',
  shopping_mode_preference: 'mixed',
  cooking_days: ['mon', 'wed'],
  prep_days: ['sun'],
  leftovers_tolerance: 'love',
  budget_sensitivity: 'moderate',
};

describe('buildProfilePatch helpers', () => {
  it('toNumberOrNull parses finite numbers and rejects garbage', () => {
    expect(toNumberOrNull('42')).toBe(42);
    expect(toNumberOrNull(' 3.5 ')).toBe(3.5);
    expect(toNumberOrNull('')).toBeNull();
    expect(toNumberOrNull('abc')).toBeNull();
  });

  it('toHeightCm converts inches to cm and rounds', () => {
    expect(toHeightCm('180', 'cm')).toBe(180);
    expect(toHeightCm('69', 'in')).toBe(175); // 69 * 2.54 = 175.26
    expect(toHeightCm('', 'cm')).toBeNull();
  });

  it('toWeightKg converts pounds to kg with one decimal', () => {
    expect(toWeightKg('70', 'kg')).toBe(70);
    expect(toWeightKg('150', 'lb')).toBe(68); // 150 * 0.45359237 = 68.04
    expect(toWeightKg('', 'kg')).toBeNull();
  });

  it('convertHeightDisplayValue preserves physical height across unit switches', () => {
    // 74 in ≈ 188 cm; round-trip should stay near the original inches.
    expect(convertHeightDisplayValue('74', 'in', 'cm')).toBe('188');
    expect(convertHeightDisplayValue('188', 'cm', 'in')).toBe('74');
    expect(convertHeightDisplayValue('', 'in', 'cm')).toBe('');
    expect(convertHeightDisplayValue('180', 'cm', 'cm')).toBe('180');
  });

  it('convertWeightDisplayValue preserves physical weight across unit switches', () => {
    expect(convertWeightDisplayValue('185', 'lb', 'kg')).toBe('83.9');
    expect(convertWeightDisplayValue('83.9', 'kg', 'lb')).toBe('185');
    expect(convertWeightDisplayValue('', 'lb', 'kg')).toBe('');
    expect(convertWeightDisplayValue('70', 'kg', 'kg')).toBe('70');
  });

  it('custom_rhythm complete/skip schedules are not usable saved meal rhythms', () => {
    const answers: OnboardingAnswers = {
      ...INITIAL_ANSWERS,
      date_of_birth: '1978-11-05',
      height_value: '74',
      weight_value: '185',
      sex: 'male',
      rhythm_template: 'custom_rhythm',
    };
    const complete = buildProfilePatch(answers, { mode: 'complete' });
    const skip = buildProfilePatch(answers, { mode: 'skip' });
    expect(isUsableSavedMealSchedule(complete.meal_schedule)).toBe(false);
    expect(isUsableSavedMealSchedule(skip.meal_schedule)).toBe(false);
    expect((complete.onboarding as any).eating.rhythm_template).toBe('custom_rhythm');
    expect(buildAppCopyMealSchedule(answers).slots.breakfast.enabled).toBe(false);
  });

  it('buildMealSchedule enables selected slots and disables the rest', () => {
    const schedule = buildMealSchedule(['breakfast', 'dinner']);
    expect(schedule.slots.breakfast.enabled).toBe(true);
    expect(schedule.slots.dinner.enabled).toBe(true);
    expect(schedule.slots.lunch.enabled).toBe(false);
    expect(schedule.updated_at).toBeTruthy();
  });

  it('buildMealSchedule falls back to three meals when nothing selected', () => {
    const schedule = buildMealSchedule([]);
    expect(schedule.slots.breakfast.enabled).toBe(true);
    expect(schedule.slots.lunch.enabled).toBe(true);
    expect(schedule.slots.dinner.enabled).toBe(true);
  });
});

describe('buildProfilePatch', () => {
  it('writes canonical fields, the onboarding blob, and completion timestamp', () => {
    const patch = buildProfilePatch(FILLED);

    expect(patch.onboarding_completed_at).toBeTruthy();
    expect(typeof patch.onboarding_completed_at).toBe('string');

    // Canonical fields the rest of the app reads.
    expect(patch.primary_goal).toBe('lose_weight');
    expect(patch.date_of_birth).toBe('1990-05-12');
    expect(patch.sex).toBe('female');
    expect(patch.height_cm).toBe(165);
    expect(patch.height_display_unit).toBe('cm');
    expect(patch.weight_kg).toBe(68);
    expect(patch.weight_display_unit).toBe('lb');
    expect(patch.eating_window).toBe('12h');
    expect(patch.dining_out_frequency).toBe('weekly');
    expect(patch.dietary_style).toBe('mediterranean');
    expect(patch.allergies).toEqual(['dairy', 'wheat']);
    expect(patch.shopping_mode_preference).toBe('mixed');
    expect(patch.household_size).toBe(3);
    expect(patch.meal_schedule).toBeDefined();

    // Onboarding blob shape.
    const blob = patch.onboarding as Record<string, unknown>;
    expect(blob.version).toBe(1);
    expect(blob.completed_at).toBeTruthy();
    const intent = blob.intent as Record<string, unknown>;
    expect(intent.primary_goal).toBe('lose_weight');
  });

  it('never stores age directly and never sets canonical fields that are empty', () => {
    const patch = buildProfilePatch(INITIAL_ANSWERS);

    expect(patch).not.toHaveProperty('age');
    expect(patch).not.toHaveProperty('primary_goal');
    expect(patch).not.toHaveProperty('date_of_birth');
    expect(patch).not.toHaveProperty('sex');
    expect(patch).not.toHaveProperty('height_cm');
    expect(patch).not.toHaveProperty('weight_kg');
    expect(patch).not.toHaveProperty('eating_window');
    expect(patch).not.toHaveProperty('household_size');

    // Completion timestamp + blob still written so the flow can complete even
    // when every optional field is blank.
    expect(patch.onboarding_completed_at).toBeTruthy();
    expect(patch.onboarding).toBeDefined();
  });

  it('does not set eating_window when the answer is "none"', () => {
    const a: OnboardingAnswers = { ...FILLED, eating_window: 'none' };
    const patch = buildProfilePatch(a);
    expect(patch).not.toHaveProperty('eating_window');
  });

  it('parses household_size as a number when present', () => {
    const patch = buildProfilePatch({ ...FILLED, household_size: ' 4 ' });
    expect(patch.household_size).toBe(4);
  });
});

describe('onboarding preview personas', () => {
  it('exposes the four documented persona keys', () => {
    expect(ONBOARDING_PERSONAS).toEqual(['blank', 'busy-parent', 'fitness', 'gut-health']);
  });

  it('getPersonaAnswers returns INITIAL_ANSWERS for blank and unknown input', () => {
    expect(getPersonaAnswers('blank')).toEqual(INITIAL_ANSWERS);
    expect(getPersonaAnswers('nonsense')).toEqual(INITIAL_ANSWERS);
    expect(getPersonaAnswers(undefined)).toEqual(INITIAL_ANSWERS);
  });

  it('getPersonaAnswers seeds a primary goal for every non-blank persona', () => {
    expect(getPersonaAnswers('busy-parent').primary_goal).toBeTruthy();
    expect(getPersonaAnswers('fitness').primary_goal).toBe('protein_intake');
    expect(getPersonaAnswers('gut-health').primary_goal).toBe('digestion');
  });

  it('isOnboardingPersona narrows recognized keys only', () => {
    expect(isOnboardingPersona('fitness')).toBe(true);
    expect(isOnboardingPersona('blank')).toBe(true);
    expect(isOnboardingPersona('BOGUS')).toBe(false);
    expect(isOnboardingPersona(null)).toBe(false);
  });
});

describe('App Copy 23-item write map', () => {
  const SETUP: OnboardingAnswers = {
    ...INITIAL_ANSWERS,
    date_of_birth: '1990-05-12',
    height_value: '180',
    height_unit: 'cm',
    weight_value: '82',
    weight_unit: 'kg',
    sex: 'male',
    primary_goal: 'protein_intake',
    rhythm_template: 'three_meals_two_minis',
    first_meal_window: '7_9',
    second_meal_window: '1_3',
    last_meal_window: '7_9',
    last_bite_window: 'before_9',
    dining_out_frequency: 'rarely',
    food_restrictions: ['dairy_free', 'vegetarian'],
    grocery_cadence: 'weekly',
    household_size: '2',
    activity_level: 'very_active',
    nutrition_target_preference: 'estimate_for_me',
    log_emphasis_metrics: ['protein_sufficiency', 'fiber_intake'],
    pantry_foundation: 'choose_staples',
    favorite_meal_preference: 'add_now',
    logging_prompts: ['hydration', 'sleep'],
    program_starting_point: 'start_baseline',
    review_acknowledgement: 'looks_good',
  };

  it('writes canonical Profile-satisfaction fields directly', () => {
    const patch = buildProfilePatch(SETUP);
    expect(patch.date_of_birth).toBe('1990-05-12');
    expect(patch.height_cm).toBe(180);
    expect(patch.height_display_unit).toBe('cm');
    expect(patch.weight_kg).toBe(82);
    expect(patch.weight_display_unit).toBe('kg');
    expect(patch.sex).toBe('male');
    expect(patch.primary_goal).toBe('protein_intake');
    expect(patch.dining_out_frequency).toBe('rarely');
    expect(patch.activity_baseline).toBe('very_active');
    expect(patch.household_size).toBe(2);
    expect(patch.meal_schedule).toBeDefined();
    // food_restrictions map to canonical dietary_style + allergies.
    expect(patch.dietary_style).toBe('vegetarian');
    expect(patch.allergies).toEqual(['dairy']);
    // Completion marker always written.
    expect(patch.onboarding_completed_at).toBeTruthy();
  });

  it('writes optional setup answers only under the onboarding blob', () => {
    const patch = buildProfilePatch(SETUP);
    const blob = patch.onboarding as Record<string, unknown>;

    // Optional enrichment answers live under nested onboarding.* paths.
    const body = blob.body as Record<string, unknown>;
    expect(body.activity_level).toBe('very_active');
    const targets = blob.targets as Record<string, unknown>;
    expect(targets.estimate_preference).toBe('estimate_for_me');
    const log = blob.log as Record<string, unknown>;
    expect(log.emphasis_metrics).toEqual(['protein_sufficiency', 'fiber_intake']);
    expect(log.available_prompts).toEqual(['hydration', 'sleep']);
    const pantry = blob.pantry as Record<string, unknown>;
    expect(pantry.foundation_preference).toBe('choose_staples');
    const favorites = blob.favorites as Record<string, unknown>;
    expect(favorites.repeat_meal_preference).toBe('add_now');
    const programs = blob.programs as Record<string, unknown>;
    expect(programs.starting_point).toBe('start_baseline');
    const planning = blob.planning as Record<string, unknown>;
    expect(planning.grocery_cadence).toBe('weekly');

    // Optional answers must NOT leak into canonical top-level metadata keys.
    expect(patch).not.toHaveProperty('nutrition_target_preference');
    expect(patch).not.toHaveProperty('log_emphasis_metrics');
    expect(patch).not.toHaveProperty('pantry_foundation');
    expect(patch).not.toHaveProperty('favorite_meal_preference');
    expect(patch).not.toHaveProperty('logging_prompts');
    expect(patch).not.toHaveProperty('program_starting_point');
    expect(patch).not.toHaveProperty('review_acknowledgement');
  });

  it('does not write eating_window from last_bite_window (compat preserved)', () => {
    const patch = buildProfilePatch(SETUP);
    expect(patch).not.toHaveProperty('eating_window');
    const blob = patch.onboarding as Record<string, unknown>;
    const eating = blob.eating as Record<string, unknown>;
    expect(eating.last_bite_window).toBe('before_9');
  });

  it('leaves optional fields blank without breaking completion', () => {
    const minimal: OnboardingAnswers = {
      ...INITIAL_ANSWERS,
      date_of_birth: '1990-05-12',
      height_value: '180',
      height_unit: 'cm',
      weight_value: '82',
      weight_unit: 'kg',
      sex: 'unspecified',
      primary_goal: 'not_sure',
      rhythm_template: 'three_meals_daily',
      first_meal_window: '7_9',
      second_meal_window: '11_1',
      last_meal_window: '5_7',
      last_bite_window: 'no',
      dining_out_frequency: 'never',
      food_restrictions: ['no_restrictions'],
      grocery_cadence: 'weekly',
      household_size: '1',
    };
    const patch = buildProfilePatch(minimal);
    expect(patch.onboarding_completed_at).toBeTruthy();
    expect(patch).not.toHaveProperty('activity_baseline');
    const blob = patch.onboarding as Record<string, unknown>;
    const body = blob.body as Record<string, unknown>;
    expect(body.activity_level).toBeNull();
  });
});
