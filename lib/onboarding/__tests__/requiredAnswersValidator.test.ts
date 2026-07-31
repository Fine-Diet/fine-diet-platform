import { describe, expect, it } from '@jest/globals';
import { INITIAL_ANSWERS, type OnboardingAnswers } from '../defaultOnboardingFlow';
import { REQUIRED_APP_COPY_QUESTION_IDS } from '../onboardingFlowTypes';
import {
  coerceOnboardingAnswersForPermissiveMode,
  parseOnboardingAnswersPayload,
  validateRequiredOnboardingAnswers,
} from '../requiredAnswersValidator';

/** Minimal payload satisfying all required App Copy keys. */
const COMPLETE_REQUIRED_ANSWERS: OnboardingAnswers = {
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
  food_restrictions: ['none'],
  grocery_cadence: 'weekly',
  household_size: '2',
};

describe('validateRequiredOnboardingAnswers', () => {
  it('fails closed on INITIAL_ANSWERS with all required keys missing', () => {
    const result = validateRequiredOnboardingAnswers(INITIAL_ANSWERS);
    expect(result.ok).toBe(false);
    expect(result.missingRequiredKeys).toEqual([...REQUIRED_APP_COPY_QUESTION_IDS]);
  });

  it('fails on partial answers', () => {
    const partial: OnboardingAnswers = {
      ...INITIAL_ANSWERS,
      date_of_birth: '1990-05-12',
      sex: 'female',
      primary_goal: 'lose_weight',
    };
    const result = validateRequiredOnboardingAnswers(partial);
    expect(result.ok).toBe(false);
    expect(result.missingRequiredKeys).toContain('height');
    expect(result.missingRequiredKeys).toContain('rhythm_template');
    expect(result.missingRequiredKeys).not.toContain('date_of_birth');
    expect(result.missingRequiredKeys).not.toContain('sex');
  });

  it('succeeds when all required answers are present', () => {
    const result = validateRequiredOnboardingAnswers(COMPLETE_REQUIRED_ANSWERS);
    expect(result.ok).toBe(true);
    expect(result.missingRequiredKeys).toEqual([]);
  });
});

describe('parseOnboardingAnswersPayload (complete fail-closed)', () => {
  it('rejects absent answers', () => {
    expect(parseOnboardingAnswersPayload(undefined).ok).toBe(false);
    expect(parseOnboardingAnswersPayload(null).error).toBe('missing_answers');
  });

  it('rejects malformed answers', () => {
    expect(parseOnboardingAnswersPayload('nope').error).toBe('malformed_answers');
    expect(parseOnboardingAnswersPayload([1, 2]).error).toBe('malformed_answers');
  });

  it('parses object payloads without inventing completion validity', () => {
    const parsed = parseOnboardingAnswersPayload({ sex: 'male' });
    expect(parsed.ok).toBe(true);
    expect(parsed.answers?.sex).toBe('male');
    expect(validateRequiredOnboardingAnswers(parsed.answers!).ok).toBe(false);
  });
});

describe('coerceOnboardingAnswersForPermissiveMode', () => {
  it('coerces absence to INITIAL_ANSWERS for progress/skip only', () => {
    expect(coerceOnboardingAnswersForPermissiveMode(undefined)).toEqual(INITIAL_ANSWERS);
    expect(coerceOnboardingAnswersForPermissiveMode({ sex: 'female' }).sex).toBe('female');
  });
});
