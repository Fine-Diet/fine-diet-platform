/**
 * Package 2 — pure required-onboarding validator.
 *
 * Shared by UI completion gating and `/api/onboarding/persist` so completion
 * cannot be inferred from client-only checks or INITIAL_ANSWERS coercion.
 */

import {
  INITIAL_ANSWERS,
  type OnboardingAnswers,
} from '@/lib/onboarding/defaultOnboardingFlow';
import { REQUIRED_APP_COPY_QUESTION_IDS } from '@/lib/onboarding/onboardingFlowTypes';

export type RequiredOnboardingQuestionId =
  (typeof REQUIRED_APP_COPY_QUESTION_IDS)[number];

export interface RequiredAnswersValidation {
  ok: boolean;
  missingRequiredKeys: RequiredOnboardingQuestionId[];
}

export interface ParseAnswersResult {
  ok: boolean;
  answers: OnboardingAnswers | null;
  error: 'missing_answers' | 'malformed_answers' | null;
}

const REQUIRED_ANSWER_CHECK: Record<
  RequiredOnboardingQuestionId,
  (a: OnboardingAnswers) => boolean
> = {
  date_of_birth: (a) => Boolean(a.date_of_birth?.trim?.() ?? a.date_of_birth),
  height: (a) => Boolean(String(a.height_value ?? '').trim()),
  weight: (a) => Boolean(String(a.weight_value ?? '').trim()),
  sex: (a) => Boolean(a.sex),
  primary_goal: (a) => Boolean(a.primary_goal),
  rhythm_template: (a) => Boolean(a.rhythm_template),
  first_meal_window: (a) => Boolean(a.first_meal_window),
  second_meal_window: (a) => Boolean(a.second_meal_window),
  last_meal_window: (a) => Boolean(a.last_meal_window),
  last_bite_window: (a) => Boolean(a.last_bite_window),
  dining_out_frequency: (a) => Boolean(a.dining_out_frequency),
  food_restrictions: (a) => Array.isArray(a.food_restrictions) && a.food_restrictions.length > 0,
  grocery_cadence: (a) => Boolean(a.grocery_cadence),
  household_size: (a) => Boolean(String(a.household_size ?? '').trim()),
};

/** True when a single required question is satisfied. */
export function isRequiredOnboardingAnswerPresent(
  questionId: string,
  answers: OnboardingAnswers,
): boolean {
  const check = REQUIRED_ANSWER_CHECK[questionId as RequiredOnboardingQuestionId];
  if (!check) return true;
  return check(answers);
}

/**
 * Validate that all required App Copy baseline answers are present.
 * Does not invent defaults for missing values.
 */
export function validateRequiredOnboardingAnswers(
  answers: OnboardingAnswers,
): RequiredAnswersValidation {
  const missingRequiredKeys: RequiredOnboardingQuestionId[] = [];
  for (const id of REQUIRED_APP_COPY_QUESTION_IDS) {
    if (!isRequiredOnboardingAnswerPresent(id, answers)) {
      missingRequiredKeys.push(id);
    }
  }
  return {
    ok: missingRequiredKeys.length === 0,
    missingRequiredKeys,
  };
}

/**
 * Parse a client answers payload without treating absence as INITIAL_ANSWERS.
 * For complete mode, callers must fail closed when ok is false.
 */
export function parseOnboardingAnswersPayload(raw: unknown): ParseAnswersResult {
  if (raw === undefined || raw === null) {
    return { ok: false, answers: null, error: 'missing_answers' };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, answers: null, error: 'malformed_answers' };
  }
  const answers: OnboardingAnswers = {
    ...INITIAL_ANSWERS,
    ...(raw as Partial<OnboardingAnswers>),
  };
  return { ok: true, answers, error: null };
}

/**
 * Permissive parse for progress/skip only. Absence becomes INITIAL_ANSWERS so
 * skip/progress remain usable, but never creates completion truth by itself.
 */
export function coerceOnboardingAnswersForPermissiveMode(
  raw: unknown,
): OnboardingAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...INITIAL_ANSWERS };
  }
  return { ...INITIAL_ANSWERS, ...(raw as Partial<OnboardingAnswers>) };
}
