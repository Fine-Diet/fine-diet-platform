/**
 * Tests for Question Set Validation and Hashing
 */

import { validateQuestionSet, hashQuestionSetJson } from '../validateQuestionSet';

describe('validateQuestionSet', () => {
  const validQuestionSet = {
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
          { id: 'o2-2', label: 'Option 2', value: 2 },
          { id: 'o2-3', label: 'Option 3', value: 3 },
        ],
      },
    ],
  };

  describe('pass cases', () => {
    it('should validate a valid question set', () => {
      const result = validateQuestionSet(validQuestionSet);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate question set with multiple sections', () => {
      const multiSection = {
        ...validQuestionSet,
        sections: [
          { id: 's1', title: 'Section 1', questionIds: ['q1'] },
          { id: 's2', title: 'Section 2', questionIds: ['q2'] },
        ],
      };
      const result = validateQuestionSet(multiSection);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('fail cases', () => {
    it('should fail if version is not "2"', () => {
      const invalid = { ...validQuestionSet, version: '1' };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('version must be "2", got "1".');
    });

    it('should fail if assessmentType is not "gut-check"', () => {
      const invalid = { ...validQuestionSet, assessmentType: 'other' };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('assessmentType must be "gut-check", got "other".');
    });

    it('should fail if sections array is empty', () => {
      const invalid = { ...validQuestionSet, sections: [] };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('sections array must be non-empty.');
    });

    it('should fail if section has no id', () => {
      const invalid = {
        ...validQuestionSet,
        sections: [{ title: 'Section 1', questionIds: ['q1'] }],
      };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('sections[0].id'))).toBe(true);
    });

    it('should fail if section has empty questionIds', () => {
      const invalid = {
        ...validQuestionSet,
        sections: [{ id: 's1', title: 'Section 1', questionIds: [] }],
      };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('sections[0].questionIds must be non-empty'))).toBe(true);
    });

    it('should fail if section references non-existent question', () => {
      const invalid = {
        ...validQuestionSet,
        sections: [{ id: 's1', title: 'Section 1', questionIds: ['q999'] }],
      };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('references question.id "q999"'))).toBe(true);
    });

    it('should fail if question has duplicate id', () => {
      const invalid = {
        ...validQuestionSet,
        questions: [
          validQuestionSet.questions[0],
          { ...validQuestionSet.questions[0], id: 'q1' }, // Duplicate
        ],
      };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('questions[1].id "q1" is duplicate'))).toBe(true);
    });

    it('should fail if question has fewer than 4 options', () => {
      const invalid = {
        ...validQuestionSet,
        questions: [
          {
            ...validQuestionSet.questions[0],
            options: validQuestionSet.questions[0].options.slice(0, 3),
          },
        ],
      };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('must have exactly 4 options'))).toBe(true);
    });

    it('should fail if question has more than 4 options', () => {
      const invalid = {
        ...validQuestionSet,
        questions: [
          {
            ...validQuestionSet.questions[0],
            options: [
              ...validQuestionSet.questions[0].options,
              { id: 'o1-4', label: 'Extra', value: 0 },
            ],
          },
        ],
      };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('must have exactly 4 options'))).toBe(true);
    });

    it('should fail if option value is not in {0,1,2,3}', () => {
      const invalid = {
        ...validQuestionSet,
        questions: [
          {
            ...validQuestionSet.questions[0],
            options: [
              { id: 'o1-0', label: 'Option 0', value: 0 },
              { id: 'o1-1', label: 'Option 1', value: 1 },
              { id: 'o1-2', label: 'Option 2', value: 2 },
              { id: 'o1-3', label: 'Option 3', value: 4 }, // Invalid
            ],
          },
        ],
      };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('value must be one of {0,1,2,3}'))).toBe(true);
    });

    it('should fail if option values are missing one of {0,1,2,3}', () => {
      const invalid = {
        ...validQuestionSet,
        questions: [
          {
            ...validQuestionSet.questions[0],
            options: [
              { id: 'o1-0', label: 'Option 0', value: 0 },
              { id: 'o1-1', label: 'Option 1', value: 1 },
              { id: 'o1-2', label: 'Option 2', value: 2 },
              { id: 'o1-3', label: 'Option 3', value: 2 }, // Duplicate, missing 3
            ],
          },
        ],
      };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('is missing option with value 3'))).toBe(true);
      expect(result.errors.some(e => e.includes('value 2 is duplicate'))).toBe(true);
    });

    it('should fail if option values have duplicates', () => {
      const invalid = {
        ...validQuestionSet,
        questions: [
          {
            ...validQuestionSet.questions[0],
            options: [
              { id: 'o1-0', label: 'Option 0', value: 0 },
              { id: 'o1-1', label: 'Option 1', value: 1 },
              { id: 'o1-2', label: 'Option 2', value: 1 }, // Duplicate value
              { id: 'o1-3', label: 'Option 3', value: 3 },
            ],
          },
        ],
      };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('value 1 is duplicate'))).toBe(true);
      expect(result.errors.some(e => e.includes('is missing option with value 2'))).toBe(true);
    });

    it('should fail if option ids are duplicate within question', () => {
      const invalid = {
        ...validQuestionSet,
        questions: [
          {
            ...validQuestionSet.questions[0],
            options: [
              { id: 'o1-0', label: 'Option 0', value: 0 },
              { id: 'o1-1', label: 'Option 1', value: 1 },
              { id: 'o1-0', label: 'Option 2', value: 2 }, // Duplicate id
              { id: 'o1-3', label: 'Option 3', value: 3 },
            ],
          },
        ],
      };
      const result = validateQuestionSet(invalid);
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('o1-0" is duplicate within question'))).toBe(true);
    });
  });
});

describe('hashQuestionSetJson', () => {
  it('should produce the same hash for objects with different key order', () => {
    const obj1 = {
      version: '2',
      assessmentType: 'gut-check',
      sections: [{ id: 's1', title: 'Section 1', questionIds: ['q1'] }],
      questions: [{ id: 'q1', text: 'Q1', options: [] }],
    };

    const obj2 = {
      assessmentType: 'gut-check',
      version: '2',
      questions: [{ id: 'q1', text: 'Q1', options: [] }],
      sections: [{ id: 's1', title: 'Section 1', questionIds: ['q1'] }],
    };

    const hash1 = hashQuestionSetJson(obj1);
    const hash2 = hashQuestionSetJson(obj2);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different content', () => {
    const obj1 = {
      version: '2',
      assessmentType: 'gut-check',
      sections: [],
      questions: [],
    };

    const obj2 = {
      version: '2',
      assessmentType: 'gut-check',
      sections: [{ id: 's1', title: 'Section 1', questionIds: [] }],
      questions: [],
    };

    const hash1 = hashQuestionSetJson(obj1);
    const hash2 = hashQuestionSetJson(obj2);

    expect(hash1).not.toBe(hash2);
  });
});


