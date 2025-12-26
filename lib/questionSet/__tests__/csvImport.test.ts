/**
 * Tests for CSV Import Functionality
 */

import { parseCSV } from '../csvParser';
import { buildQuestionSetFromCSV } from '../csvToQuestionSet';

describe('parseCSV', () => {
  describe('happy path', () => {
    it('should parse valid CSV with correct headers', () => {
      const content = 'key,value\nversion,2\nassessmentType,gut-check';
      const result = parseCSV(content, 'meta.csv', ['key', 'value']);

      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].key).toBe('version');
      expect(result.rows[0].value).toBe('2');
      expect(result.rows[0].__rowNumber).toBe(2);
    });

    it('should handle quoted fields with commas', () => {
      const content = 'question_id,text\nq1,"Question with, comma"';
      const result = parseCSV(content, 'questions.csv', ['question_id', 'text']);

      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].text).toBe('Question with, comma');
    });
  });

  describe('error cases', () => {
    it('should reject CSV with wrong number of columns in header', () => {
      const content = 'key,value,extra\nversion,2,foo';
      const result = parseCSV(content, 'meta.csv', ['key', 'value']);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].file).toBe('meta.csv');
      expect(result.errors[0].row).toBe(1);
    });

    it('should reject CSV with wrong header names', () => {
      const content = 'wrong,header\nversion,2';
      const result = parseCSV(content, 'meta.csv', ['key', 'value']);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].file).toBe('meta.csv');
      expect(result.errors[0].column).toBe('key');
    });

    it('should reject empty CSV', () => {
      const content = '';
      const result = parseCSV(content, 'meta.csv', ['key', 'value']);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('empty');
    });
  });
});

describe('buildQuestionSetFromCSV', () => {
  const validMetaRows = [
    { key: 'version', value: '2', __rowNumber: 2 },
    { key: 'assessmentType', value: 'gut-check', __rowNumber: 3 },
    { key: 'assessmentVersion', value: '2', __rowNumber: 4 },
  ];

  const validSectionRows = [
    { section_id: 's1', title: 'Section 1', order: '1', __rowNumber: 2 },
    { section_id: 's2', title: 'Section 2', order: '2', __rowNumber: 3 },
  ];

  const validQuestionRows = [
    { question_id: 'q1', section_id: 's1', text: 'Question 1', order: '1', __rowNumber: 2 },
    { question_id: 'q2', section_id: 's1', text: 'Question 2', order: '2', __rowNumber: 3 },
    { question_id: 'q3', section_id: 's2', text: 'Question 3', order: '1', __rowNumber: 4 },
  ];

  const validOptionRows = [
    { question_id: 'q1', option_id: 'o1-0', label: 'Option 0', value: '0', __rowNumber: 2 },
    { question_id: 'q1', option_id: 'o1-1', label: 'Option 1', value: '1', __rowNumber: 3 },
    { question_id: 'q1', option_id: 'o1-2', label: 'Option 2', value: '2', __rowNumber: 4 },
    { question_id: 'q1', option_id: 'o1-3', label: 'Option 3', value: '3', __rowNumber: 5 },
    { question_id: 'q2', option_id: 'o2-0', label: 'Option 0', value: '0', __rowNumber: 6 },
    { question_id: 'q2', option_id: 'o2-1', label: 'Option 1', value: '1', __rowNumber: 7 },
    { question_id: 'q2', option_id: 'o2-2', label: 'Option 2', value: '2', __rowNumber: 8 },
    { question_id: 'q2', option_id: 'o2-3', label: 'Option 3', value: '3', __rowNumber: 9 },
    { question_id: 'q3', option_id: 'o3-0', label: 'Option 0', value: '0', __rowNumber: 10 },
    { question_id: 'q3', option_id: 'o3-1', label: 'Option 1', value: '1', __rowNumber: 11 },
    { question_id: 'q3', option_id: 'o3-2', label: 'Option 2', value: '2', __rowNumber: 12 },
    { question_id: 'q3', option_id: 'o3-3', label: 'Option 3', value: '3', __rowNumber: 13 },
  ];

  describe('happy path', () => {
    it('should build valid QuestionSet from CSV data', () => {
      const result = buildQuestionSetFromCSV(
        validMetaRows,
        validSectionRows,
        validQuestionRows,
        validOptionRows
      );

      expect(result.errors).toHaveLength(0);
      expect(result.questionSet).toBeDefined();
      expect(result.questionSet?.version).toBe('2');
      expect(result.questionSet?.assessmentType).toBe('gut-check');
      expect(result.questionSet?.sections).toHaveLength(2);
      expect(result.questionSet?.questions).toHaveLength(3);
      expect(result.questionSet?.questions[0].options).toHaveLength(4);
    });

    it('should sort sections by order', () => {
      const sectionRows = [
        { section_id: 's2', title: 'Section 2', order: '2', __rowNumber: 2 },
        { section_id: 's1', title: 'Section 1', order: '1', __rowNumber: 3 },
      ];

      const result = buildQuestionSetFromCSV(
        validMetaRows,
        sectionRows,
        validQuestionRows,
        validOptionRows
      );

      expect(result.errors).toHaveLength(0);
      expect(result.questionSet?.sections[0].id).toBe('s1');
      expect(result.questionSet?.sections[1].id).toBe('s2');
    });

    it('should group questions by section and sort by order', () => {
      const questionRows = [
        { question_id: 'q2', section_id: 's1', text: 'Question 2', order: '2', __rowNumber: 2 },
        { question_id: 'q1', section_id: 's1', text: 'Question 1', order: '1', __rowNumber: 3 },
      ];

      const optionRows = [
        ...validOptionRows.filter((opt) => opt.question_id === 'q1'),
        ...validOptionRows.filter((opt) => opt.question_id === 'q2'),
      ];

      const result = buildQuestionSetFromCSV(
        validMetaRows,
        [{ section_id: 's1', title: 'Section 1', order: '1', __rowNumber: 2 }],
        questionRows,
        optionRows
      );

      expect(result.errors).toHaveLength(0);
      expect(result.questionSet?.sections[0].questionIds).toEqual(['q1', 'q2']);
    });
  });

  describe('error cases - missing files', () => {
    it('should reject if meta.csv is empty', () => {
      const result = buildQuestionSetFromCSV(
        [],
        validSectionRows,
        validQuestionRows,
        validOptionRows
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].file).toBe('meta.csv');
      expect(result.errors[0].message).toContain('at least one');
    });
  });

  describe('error cases - invalid headers', () => {
    it('should reject if version is not "2"', () => {
      const invalidMeta = [
        { key: 'version', value: '1', __rowNumber: 2 },
        { key: 'assessmentType', value: 'gut-check', __rowNumber: 3 },
        { key: 'assessmentVersion', value: '2', __rowNumber: 4 },
      ];

      const result = buildQuestionSetFromCSV(
        invalidMeta,
        validSectionRows,
        validQuestionRows,
        validOptionRows
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('version must be "2"'))).toBe(true);
    });

    it('should reject if required meta fields are missing', () => {
      const invalidMeta = [{ key: 'version', value: '2', __rowNumber: 2 }];

      const result = buildQuestionSetFromCSV(
        invalidMeta,
        validSectionRows,
        validQuestionRows,
        validOptionRows
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('assessmentType'))).toBe(true);
      expect(result.errors.some((e) => e.message.includes('assessmentVersion'))).toBe(true);
    });
  });

  describe('error cases - options value errors', () => {
    it('should reject if question has wrong number of options', () => {
      const invalidOptions = [
        { question_id: 'q1', option_id: 'o1-0', label: 'Option 0', value: '0', __rowNumber: 2 },
        { question_id: 'q1', option_id: 'o1-1', label: 'Option 1', value: '1', __rowNumber: 3 },
        { question_id: 'q1', option_id: 'o1-2', label: 'Option 2', value: '2', __rowNumber: 4 },
        // Missing option with value 3
      ];

      const result = buildQuestionSetFromCSV(
        validMetaRows,
        [{ section_id: 's1', title: 'Section 1', order: '1', __rowNumber: 2 }],
        [{ question_id: 'q1', section_id: 's1', text: 'Question 1', order: '1', __rowNumber: 2 }],
        invalidOptions
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('exactly 4 options'))).toBe(true);
    });

    it('should reject if option value is not in {0,1,2,3}', () => {
      const invalidOptions = [
        { question_id: 'q1', option_id: 'o1-0', label: 'Option 0', value: '0', __rowNumber: 2 },
        { question_id: 'q1', option_id: 'o1-1', label: 'Option 1', value: '1', __rowNumber: 3 },
        { question_id: 'q1', option_id: 'o1-2', label: 'Option 2', value: '2', __rowNumber: 4 },
        { question_id: 'q1', option_id: 'o1-3', label: 'Option 3', value: '4', __rowNumber: 5 }, // Invalid value
      ];

      const result = buildQuestionSetFromCSV(
        validMetaRows,
        [{ section_id: 's1', title: 'Section 1', order: '1', __rowNumber: 2 }],
        [{ question_id: 'q1', section_id: 's1', text: 'Question 1', order: '1', __rowNumber: 2 }],
        invalidOptions
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('value must be one of {0,1,2,3}'))).toBe(true);
    });

    it('should reject if option values are missing one of {0,1,2,3}', () => {
      const invalidOptions = [
        { question_id: 'q1', option_id: 'o1-0', label: 'Option 0', value: '0', __rowNumber: 2 },
        { question_id: 'q1', option_id: 'o1-1', label: 'Option 1', value: '1', __rowNumber: 3 },
        { question_id: 'q1', option_id: 'o1-2', label: 'Option 2', value: '2', __rowNumber: 4 },
        { question_id: 'q1', option_id: 'o1-3', label: 'Option 3', value: '2', __rowNumber: 5 }, // Duplicate value 2
      ];

      const result = buildQuestionSetFromCSV(
        validMetaRows,
        [{ section_id: 's1', title: 'Section 1', order: '1', __rowNumber: 2 }],
        [{ question_id: 'q1', section_id: 's1', text: 'Question 1', order: '1', __rowNumber: 2 }],
        invalidOptions
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('missing option with value 3'))).toBe(true);
      expect(result.errors.some((e) => e.message.includes('duplicate value 2'))).toBe(true);
    });
  });

  describe('error cases - unknown section_id', () => {
    it('should reject if question references non-existent section_id', () => {
      const invalidQuestions = [
        { question_id: 'q1', section_id: 's999', text: 'Question 1', order: '1', __rowNumber: 2 },
      ];

      const result = buildQuestionSetFromCSV(
        validMetaRows,
        [{ section_id: 's1', title: 'Section 1', order: '1', __rowNumber: 2 }],
        invalidQuestions,
        validOptionRows
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('does not exist in sections.csv'))).toBe(true);
      expect(result.errors[0].column).toBe('section_id');
    });
  });
});

