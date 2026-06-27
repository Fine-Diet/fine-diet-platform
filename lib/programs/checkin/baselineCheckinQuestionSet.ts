/**
 * P1a — Baseline check-in question set (extracted verbatim from the former
 * BaselineCheckinPanel `BASELINE_FIELDS` + day-21 `stability_delta`).
 *
 * Field order, labels, options, help text, value types, and the gi_red_flags
 * "none" behavior are preserved exactly so the generic renderer and payload
 * builder reproduce identical Baseline UI and payloads.
 */

import type {
  CheckinQuestion,
  CheckinQuestionOption,
  CheckinQuestionSet,
} from './checkinQuestionTypes';

const SCORE_OPTIONS: CheckinQuestionOption[] = [1, 2, 3, 4, 5].map((value) => ({
  value: String(value),
  label: String(value),
}));

const DELTA_OPTIONS: CheckinQuestionOption[] = [
  { value: '-2', label: 'Much less stable' },
  { value: '-1', label: 'A little less stable' },
  { value: '0', label: 'About the same' },
  { value: '1', label: 'A little more stable' },
  { value: '2', label: 'Much more stable' },
];

function options(
  pairs: ReadonlyArray<readonly [string, string]>,
): CheckinQuestionOption[] {
  return pairs.map(([value, label]) => ({ value, label }));
}

const BASELINE_BASE_QUESTIONS: CheckinQuestion[] = [
  {
    key: 'digestion_score',
    label: 'Digestion score',
    valueType: 'number',
    input: 'score',
    options: SCORE_OPTIONS,
    help: 'Overall digestive comfort this week.',
  },
  {
    key: 'digestion_modifier',
    label: 'Digestion modifier',
    valueType: 'string',
    input: 'select',
    options: options([
      ['better', 'Better than usual'],
      ['same', 'About the same'],
      ['worse', 'Worse than usual'],
      ['variable', 'Variable'],
    ]),
  },
  {
    key: 'bm_frequency',
    label: 'BM frequency',
    valueType: 'string',
    input: 'select',
    options: options([
      ['daily', 'Daily'],
      ['most_days', 'Most days'],
      ['every_few_days', 'Every few days'],
      ['multiple_daily', 'Multiple times daily'],
      ['variable', 'Variable'],
    ]),
  },
  {
    key: 'meals_per_day',
    label: 'Meals per day',
    valueType: 'string',
    input: 'select',
    options: options([
      ['1', '1 meal'],
      ['2', '2 meals'],
      ['3', '3 meals'],
      ['4_plus', '4+ meals'],
      ['variable', 'Variable'],
    ]),
  },
  {
    key: 'protein_consistency',
    label: 'Protein consistency',
    valueType: 'string',
    input: 'select',
    options: options([
      ['low', 'Low'],
      ['moderate', 'Moderate'],
      ['steady', 'Steady'],
      ['high', 'High'],
    ]),
  },
  {
    key: 'hunger_pattern',
    label: 'Hunger pattern',
    valueType: 'string',
    input: 'select',
    options: options([
      ['steady', 'Steady'],
      ['low_appetite', 'Low appetite'],
      ['early_hunger', 'Hungry soon after meals'],
      ['late_day_hunger', 'Mostly later in the day'],
      ['variable', 'Variable'],
    ]),
  },
  {
    key: 'caffeine_use',
    label: 'Caffeine use',
    valueType: 'string',
    input: 'select',
    options: options([
      ['none', 'None'],
      ['low', 'Low'],
      ['moderate', 'Moderate'],
      ['high', 'High'],
      ['variable', 'Variable'],
    ]),
  },
  {
    key: 'energy_score',
    label: 'Energy score',
    valueType: 'number',
    input: 'score',
    options: SCORE_OPTIONS,
    help: 'Average usable energy this week.',
  },
  {
    key: 'sleep_score',
    label: 'Sleep score',
    valueType: 'number',
    input: 'score',
    options: SCORE_OPTIONS,
    help: 'How restorative sleep felt this week.',
  },
  {
    key: 'stress_score',
    label: 'Stress score',
    valueType: 'number',
    input: 'score',
    options: SCORE_OPTIONS,
    help: 'Overall stress load this week.',
  },
  {
    key: 'cravings_frequency',
    label: 'Cravings frequency',
    valueType: 'string',
    input: 'select',
    options: options([
      ['rare', 'Rare'],
      ['occasional', 'Occasional'],
      ['most_days', 'Most days'],
      ['daily', 'Daily'],
      ['variable', 'Variable'],
    ]),
  },
  {
    key: 'gi_red_flags',
    label: 'GI red flags',
    valueType: 'string_array',
    input: 'select',
    noneValue: 'none',
    options: options([
      ['none', 'None this week'],
      ['pain', 'Pain'],
      ['blood', 'Blood'],
      ['vomiting', 'Vomiting'],
      ['unintentional_weight_loss', 'Unintentional weight loss'],
      ['other', 'Other concern'],
    ]),
  },
];

const BASELINE_FINAL_DAY_QUESTIONS: CheckinQuestion[] = [
  {
    key: 'stability_delta',
    label: 'Stability delta',
    valueType: 'number',
    input: 'delta',
    options: DELTA_OPTIONS,
    help: 'Compared with the start of Baseline.',
  },
];

export const BASELINE_CHECKIN_QUESTION_SET: CheckinQuestionSet = {
  eyebrow: 'Baseline check-in',
  base: BASELINE_BASE_QUESTIONS,
  finalDay: 21,
  finalExtra: BASELINE_FINAL_DAY_QUESTIONS,
};
