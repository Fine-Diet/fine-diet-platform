/**
 * Tests for Assessment Config
 * 
 * Tests questionSetToAssessmentConfig conversion
 */

import { questionSetToAssessmentConfig } from './assessmentConfig';
import type { QuestionSet } from './assessments/questions/loadQuestionSet';

describe('questionSetToAssessmentConfig', () => {
  const mockQuestionSet: QuestionSet = {
    version: '2',
    assessmentType: 'gut-check',
    sections: [
      {
        id: 'section1',
        title: 'Section 1',
        questionIds: ['q1', 'q2'],
      },
    ],
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
      {
        id: 'q2',
        text: 'Question 2',
        options: [
          { id: 'o2-0', label: 'Option 0', value: 0 },
          { id: 'o2-1', label: 'Option 1', value: 1 },
        ],
      },
    ],
  };

  it('should convert QuestionSet to AssessmentConfig', () => {
    const config = questionSetToAssessmentConfig(mockQuestionSet, 2);

    expect(config.assessmentType).toBe('gut-check');
    expect(config.assessmentVersion).toBe(2);
    expect(config.sections).toEqual(mockQuestionSet.sections);
    expect(config.questions).toHaveLength(2);
    expect(config.questions[0].id).toBe('q1');
    expect(config.questions[0].text).toBe('Question 1');
    expect(config.questions[0].options).toHaveLength(4);
    expect(config.questions[0].options[0].id).toBe('o1-0');
    expect(config.questions[0].options[0].label).toBe('Option 0');
    expect(config.questions[0].options[0].value).toBe(0);
    expect(config.avatars).toEqual(['level1', 'level2', 'level3', 'level4']);
    expect(config.scoring.thresholds.secondaryAvatarThreshold).toBe(0.15);
    expect(config.scoring.thresholds.confidenceThresholds.high).toBe(0.3);
    expect(config.scoring.thresholds.confidenceThresholds.medium).toBe(0.15);
  });

  it('should preserve option values (0-3)', () => {
    const config = questionSetToAssessmentConfig(mockQuestionSet, 2);

    expect(config.questions[0].options[0].value).toBe(0);
    expect(config.questions[0].options[1].value).toBe(1);
    expect(config.questions[0].options[2].value).toBe(2);
    expect(config.questions[0].options[3].value).toBe(3);
  });

  it('should handle different versions', () => {
    const configV3 = questionSetToAssessmentConfig(mockQuestionSet, 3);
    expect(configV3.assessmentVersion).toBe(3);
  });
});

