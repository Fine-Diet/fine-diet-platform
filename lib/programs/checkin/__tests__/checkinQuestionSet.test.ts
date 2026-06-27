import type { ProgramCheckinTemplate } from '../../runtimeTypes';
import { BASELINE_CHECKIN_QUESTION_SET } from '../baselineCheckinQuestionSet';
import {
  getCheckinEyebrow,
  getCheckinQuestionSet,
  resolveCheckinQuestions,
} from '../checkinQuestionSetRegistry';

const BASELINE_BASE_KEYS = [
  'digestion_score',
  'digestion_modifier',
  'bm_frequency',
  'meals_per_day',
  'protein_consistency',
  'hunger_pattern',
  'caffeine_use',
  'energy_score',
  'sleep_score',
  'stress_score',
  'cravings_frequency',
  'gi_red_flags',
];

function template(
  overrides: Partial<ProgramCheckinTemplate> = {},
): ProgramCheckinTemplate {
  return {
    id: 'template-1',
    program_version_id: 'version-1',
    checkin_day: 7,
    title: 'Day 7 check-in',
    description: null,
    questions_json: [],
    status: 'published',
    created_at: '2026-05-27T00:00:00.000Z',
    updated_at: '2026-05-27T00:00:00.000Z',
    ...overrides,
  } as ProgramCheckinTemplate;
}

describe('Baseline check-in question set (back-compat)', () => {
  test('registry resolves the Baseline set and eyebrow', () => {
    expect(getCheckinQuestionSet('baseline')).toBe(
      BASELINE_CHECKIN_QUESTION_SET,
    );
    expect(getCheckinEyebrow('baseline')).toBe('Baseline check-in');
    expect(getCheckinQuestionSet('BASELINE')).toBe(
      BASELINE_CHECKIN_QUESTION_SET,
    );
  });

  test('renders the 12 base questions on non-final days', () => {
    const questions = resolveCheckinQuestions({
      programSlug: 'baseline',
      template: template({ checkin_day: 7 }),
    });
    expect(questions.map((q) => q.key)).toEqual(BASELINE_BASE_KEYS);
  });

  test('appends stability_delta only on the final (day 21) check-in', () => {
    const questions = resolveCheckinQuestions({
      programSlug: 'baseline',
      template: template({ checkin_day: 21 }),
    });
    expect(questions.map((q) => q.key)).toEqual([
      ...BASELINE_BASE_KEYS,
      'stability_delta',
    ]);
    expect(questions[questions.length - 1]).toMatchObject({
      key: 'stability_delta',
      valueType: 'number',
      input: 'delta',
    });
  });

  test('gi_red_flags is a string_array field with a "none" sentinel', () => {
    const gi = BASELINE_CHECKIN_QUESTION_SET.base.find(
      (q) => q.key === 'gi_red_flags',
    );
    expect(gi).toMatchObject({ valueType: 'string_array', noneValue: 'none' });
  });

  test('locks Baseline labels/options/types via snapshot', () => {
    const day21 = resolveCheckinQuestions({
      programSlug: 'baseline',
      template: template({ checkin_day: 21 }),
    });
    expect(day21).toMatchSnapshot();
  });
});

describe('Generic check-in rendering for a second program', () => {
  test('maps a presentation-rich questions_json (data-driven program)', () => {
    const questions = resolveCheckinQuestions({
      programSlug: 'digestive-foundations',
      template: template({
        checkin_day: 10,
        questions_json: [
          {
            key: 'bloating_score',
            label: 'Bloating score',
            value_type: 'number',
            input: 'score',
            options: [
              { value: '1', label: '1' },
              { value: '2', label: '2' },
              { value: '3', label: '3' },
            ],
            help: 'How bloated you felt this week.',
          },
          {
            key: 'trigger_foods',
            label: 'Trigger foods noticed',
            value_type: 'string',
            options: ['none', 'dairy', 'gluten'],
          },
        ] as unknown as ProgramCheckinTemplate['questions_json'],
      }),
    });

    expect(questions.map((q) => q.key)).toEqual([
      'bloating_score',
      'trigger_foods',
    ]);
    expect(questions[0]).toMatchObject({
      label: 'Bloating score',
      valueType: 'number',
      input: 'score',
    });
    // string option provided as a bare string normalizes to { value, label }
    expect(questions[1].options).toEqual([
      { value: 'none', label: 'none' },
      { value: 'dairy', label: 'dairy' },
      { value: 'gluten', label: 'gluten' },
    ]);
    expect(getCheckinEyebrow('digestive-foundations')).toBe('Program check-in');
  });

  test('degrades contract-only questions_json into free inputs', () => {
    const questions = resolveCheckinQuestions({
      programSlug: 'unregistered-program',
      template: template({
        checkin_day: 5,
        questions_json: [
          { key: 'energy', value_type: 'number', required: false },
          { key: 'notes', value_type: 'string', required: false },
        ] as unknown as ProgramCheckinTemplate['questions_json'],
      }),
    });

    expect(questions).toEqual([
      { key: 'energy', label: 'energy', valueType: 'number', input: 'number', options: [] },
      { key: 'notes', label: 'notes', valueType: 'string', input: 'text', options: [] },
    ]);
  });

  test('returns no questions for an unregistered program with no template', () => {
    expect(
      resolveCheckinQuestions({
        programSlug: 'unregistered-program',
        template: null,
      }),
    ).toEqual([]);
  });
});
