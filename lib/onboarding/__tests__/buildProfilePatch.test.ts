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
  buildProfilePatch,
  toHeightCm,
  toNumberOrNull,
  toWeightKg,
} from '../buildProfilePatch';
import { buildMealSchedule } from '../buildProfilePatch';
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
    expect(getPersonaAnswers('fitness').primary_goal).toBe('build_muscle');
    expect(getPersonaAnswers('gut-health').primary_goal).toBe('digestive_health');
  });

  it('isOnboardingPersona narrows recognized keys only', () => {
    expect(isOnboardingPersona('fitness')).toBe(true);
    expect(isOnboardingPersona('blank')).toBe(true);
    expect(isOnboardingPersona('BOGUS')).toBe(false);
    expect(isOnboardingPersona(null)).toBe(false);
  });
});
