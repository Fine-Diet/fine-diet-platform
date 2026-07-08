/**
 * Tests for the questionSetToAssessmentConfig converter's avatar resolution.
 *
 * Pins the isolation: avatars are sourced from `questionSet.avatars` when
 * present, else the Gut Check v2 level set (level1–level4) is used. Current
 * Gut Check question sets carry no `avatars` field, so output is identical to
 * the prior hardcoded behavior; a future assessment can declare its own list.
 */

import { questionSetToAssessmentConfig } from '@/lib/assessmentConfig';
import type { QuestionSet } from '@/lib/assessments/questions/loadQuestionSet';

function makeQuestionSet(overrides: Partial<QuestionSet> = {}): QuestionSet {
  return {
    version: '2',
    assessmentType: 'gut-check',
    sections: [{ id: 's1', title: 'S1', questionIds: ['q1'] }],
    questions: [
      {
        id: 'q1',
        text: 'Question 1',
        options: [
          { id: 'o1-0', label: 'Option 0', value: 0 },
          { id: 'o1-1', label: 'Option 1', value: 1 },
          { id: 'o1-2', label: 'Option 2', value: 2 },
          { id: 'o1-3', label: 'Option 3', value: 3 },
        ],
      },
    ],
    ...overrides,
  };
}

describe('questionSetToAssessmentConfig — avatar resolution', () => {
  it('falls back to the Gut Check level avatars when no avatars field is present', () => {
    const config = questionSetToAssessmentConfig(makeQuestionSet(), 2);
    expect(config.avatars).toEqual(['level1', 'level2', 'level3', 'level4']);
  });

  it('preserves Gut Check behavior: no avatars field → level1-level4', () => {
    // The bundled gut-check question set has no avatars field; output must be
    // identical to the prior hardcoded avatar list.
    const config = questionSetToAssessmentConfig(makeQuestionSet(), 2);
    expect(config.avatars).toEqual(['level1', 'level2', 'level3', 'level4']);
  });

  it('sources avatars from the question set when present (future assessment opt-in)', () => {
    const futureSet = makeQuestionSet({
      assessmentType: 'some-future',
      avatars: ['pattern-a', 'pattern-b', 'pattern-c'],
    });
    const config = questionSetToAssessmentConfig(futureSet, 1);
    expect(config.avatars).toEqual(['pattern-a', 'pattern-b', 'pattern-c']);
  });

  it('ignores an empty avatars array and falls back to the default', () => {
    const set = makeQuestionSet({ avatars: [] });
    const config = questionSetToAssessmentConfig(set, 2);
    expect(config.avatars).toEqual(['level1', 'level2', 'level3', 'level4']);
  });

  it('does not inherit Gut Check avatars for a future assessment that declares its own', () => {
    const futureSet = makeQuestionSet({
      assessmentType: 'some-future',
      avatars: ['a', 'b'],
    });
    const config = questionSetToAssessmentConfig(futureSet, 1);
    expect(config.avatars).not.toContain('level1');
    expect(config.avatars).toEqual(['a', 'b']);
  });

  it('preserves optional helperText from CMS question specs', () => {
    const set = makeQuestionSet({
      questions: [
        {
          id: 'q1',
          text: 'Question 1',
          helperText: 'Think about your usual rhythm.',
          options: [
            { id: 'o1-0', label: 'Option 0', value: 0 },
            { id: 'o1-1', label: 'Option 1', value: 1 },
            { id: 'o1-2', label: 'Option 2', value: 2 },
            { id: 'o1-3', label: 'Option 3', value: 3 },
          ],
        },
      ],
    });
    const config = questionSetToAssessmentConfig(set, 1);
    expect(config.questions[0].helperText).toBe('Think about your usual rhythm.');
  });

  it('leaves helperText undefined when absent (Gut Check compatibility)', () => {
    const config = questionSetToAssessmentConfig(makeQuestionSet(), 2);
    expect(config.questions[0].helperText).toBeUndefined();
  });
});
