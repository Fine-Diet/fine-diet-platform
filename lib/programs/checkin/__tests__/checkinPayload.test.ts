import { BASELINE_CHECKIN_QUESTION_SET } from '../baselineCheckinQuestionSet';
import { buildCheckinPayload } from '../checkinPayload';
import type { CheckinQuestion } from '../checkinQuestionTypes';

/**
 * Oracle: the original BaselineCheckinPanel `toPayload` behavior, reproduced
 * here so we can assert buildCheckinPayload is byte-equivalent for Baseline.
 */
function legacyBaselineToPayload(
  responses: Record<string, string>,
  includeStabilityDelta: boolean,
): Record<string, unknown> {
  const numberKeys = new Set([
    'digestion_score',
    'energy_score',
    'sleep_score',
    'stress_score',
    ...(includeStabilityDelta ? ['stability_delta'] : []),
  ]);
  const keys = [
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
    ...(includeStabilityDelta ? ['stability_delta'] : []),
  ];
  const payload: Record<string, unknown> = {};
  for (const key of keys) {
    const value = responses[key] ?? '';
    if (numberKeys.has(key)) {
      payload[key] = value === '' ? null : Number(value);
    } else if (key === 'gi_red_flags') {
      payload[key] = value === '' || value === 'none' ? [] : [value];
    } else {
      payload[key] = value === '' ? null : value;
    }
  }
  return payload;
}

function baselineQuestions(includeStabilityDelta: boolean): CheckinQuestion[] {
  return includeStabilityDelta
    ? [
        ...BASELINE_CHECKIN_QUESTION_SET.base,
        ...(BASELINE_CHECKIN_QUESTION_SET.finalExtra ?? []),
      ]
    : BASELINE_CHECKIN_QUESTION_SET.base;
}

describe('buildCheckinPayload equals legacy Baseline toPayload', () => {
  const cases: Array<{ name: string; responses: Record<string, string> }> = [
    { name: 'all empty', responses: {} },
    {
      name: 'fully answered',
      responses: {
        digestion_score: '4',
        digestion_modifier: 'better',
        bm_frequency: 'daily',
        meals_per_day: '3',
        protein_consistency: 'steady',
        hunger_pattern: 'steady',
        caffeine_use: 'low',
        energy_score: '5',
        sleep_score: '3',
        stress_score: '2',
        cravings_frequency: 'occasional',
        gi_red_flags: 'pain',
        stability_delta: '1',
      },
    },
    {
      name: 'gi red flags explicit none',
      responses: { gi_red_flags: 'none', digestion_score: '' },
    },
    {
      name: 'negative stability delta',
      responses: { stability_delta: '-2' },
    },
  ];

  test.each(cases)('matches for: $name (day 7)', ({ responses }) => {
    const questions = baselineQuestions(false);
    expect(buildCheckinPayload(questions, responses)).toEqual(
      legacyBaselineToPayload(responses, false),
    );
  });

  test.each(cases)('matches for: $name (day 21)', ({ responses }) => {
    const questions = baselineQuestions(true);
    expect(buildCheckinPayload(questions, responses)).toEqual(
      legacyBaselineToPayload(responses, true),
    );
  });

  test('coerces score/delta empties to null and selections to values', () => {
    const questions = baselineQuestions(true);
    const payload = buildCheckinPayload(questions, {
      digestion_score: '3',
      gi_red_flags: 'blood',
      stability_delta: '',
    });
    expect(payload.digestion_score).toBe(3);
    expect(payload.gi_red_flags).toEqual(['blood']);
    expect(payload.stability_delta).toBeNull();
  });
});
