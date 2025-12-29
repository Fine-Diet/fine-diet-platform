/**
 * Tests for buildAssessmentIndex
 * 
 * Tests the merge logic for question sets and results packs into unified assessment rows.
 */

import { buildAssessmentIndex, type AssessmentVersion } from '../buildAssessmentIndex';

describe('buildAssessmentIndex', () => {
  it('should merge question sets and results packs into unified rows', () => {
    const questionSets = [
      {
        id: 'qs-1',
        assessmentType: 'gut-check',
        assessmentVersion: 2, // Number from API
        locale: null,
      },
    ];

    const resultsPacks = [
      {
        id: 'rp-1',
        assessmentType: 'gut-check',
        resultsVersion: 'v2', // String from API
        levelId: 'level1',
      },
      {
        id: 'rp-2',
        assessmentType: 'gut-check',
        resultsVersion: 'v2',
        levelId: 'level2',
      },
    ];

    const result = buildAssessmentIndex(questionSets, resultsPacks);

    expect(result).toHaveLength(1);
    expect(result[0].assessmentType).toBe('gut-check');
    expect(result[0].questionsVersion).toBe(2); // Numeric
    expect(result[0].resultsVersion).toBe('v2'); // String
    expect(result[0].questionSetId).toBe('qs-1');
    expect(result[0].resultsPackIds.level1).toBe('rp-1');
    expect(result[0].resultsPackIds.level2).toBe('rp-2');
    expect(result[0].resultsPackIds.level3).toBeNull();
    expect(result[0].resultsPackIds.level4).toBeNull();
  });

  it('should handle question sets without results packs', () => {
    const questionSets = [
      {
        id: 'qs-1',
        assessmentType: 'gut-check',
        assessmentVersion: 1, // Number from API
        locale: null,
      },
    ];

    const resultsPacks: any[] = [];

    const result = buildAssessmentIndex(questionSets, resultsPacks);

    expect(result).toHaveLength(1);
    expect(result[0].questionsVersion).toBe(1);
    expect(result[0].resultsVersion).toBe('1'); // Defaults to string version of questionsVersion
    expect(result[0].questionSetId).toBe('qs-1');
    expect(Object.values(result[0].resultsPackIds).every(id => id === null)).toBe(true);
  });

  it('should handle results packs without question sets', () => {
    const questionSets: any[] = [];

    const resultsPacks = [
      {
        id: 'rp-1',
        assessmentType: 'gut-check',
        resultsVersion: 'v3', // String from API
        levelId: 'level1',
      },
    ];

    const result = buildAssessmentIndex(questionSets, resultsPacks);

    expect(result).toHaveLength(1);
    expect(result[0].questionsVersion).toBe(3); // Parsed from 'v3'
    expect(result[0].resultsVersion).toBe('v3');
    expect(result[0].questionSetId).toBeNull();
    expect(result[0].resultsPackIds.level1).toBe('rp-1');
  });

  it('should sort by assessmentType, then version (numeric), then locale', () => {
    const questionSets = [
      {
        id: 'qs-1',
        assessmentType: 'gut-check',
        assessmentVersion: 10, // Number from API
        locale: null,
      },
      {
        id: 'qs-2',
        assessmentType: 'gut-check',
        assessmentVersion: 2,
        locale: null,
      },
      {
        id: 'qs-3',
        assessmentType: 'other-assessment',
        assessmentVersion: 1,
        locale: null,
      },
    ];

    const resultsPacks: any[] = [];

    const result = buildAssessmentIndex(questionSets, resultsPacks);

    expect(result).toHaveLength(3);
    expect(result[0].assessmentType).toBe('gut-check');
    expect(result[0].questionsVersion).toBe(2); // Sorted numerically
    expect(result[1].assessmentType).toBe('gut-check');
    expect(result[1].questionsVersion).toBe(10);
    expect(result[2].assessmentType).toBe('other-assessment');
  });

  it('should handle all four result pack levels', () => {
    const questionSets: any[] = [];

    const resultsPacks = [
      {
        id: 'rp-1',
        assessmentType: 'gut-check',
        resultsVersion: 'v2', // String from API
        levelId: 'level1',
      },
      {
        id: 'rp-2',
        assessmentType: 'gut-check',
        resultsVersion: 'v2',
        levelId: 'level2',
      },
      {
        id: 'rp-3',
        assessmentType: 'gut-check',
        resultsVersion: 'v2',
        levelId: 'level3',
      },
      {
        id: 'rp-4',
        assessmentType: 'gut-check',
        resultsVersion: 'v2',
        levelId: 'level4',
      },
    ];

    const result = buildAssessmentIndex(questionSets, resultsPacks);

    expect(result).toHaveLength(1);
    expect(result[0].questionsVersion).toBe(2); // Parsed from 'v2'
    expect(result[0].resultsVersion).toBe('v2');
    expect(result[0].resultsPackIds.level1).toBe('rp-1');
    expect(result[0].resultsPackIds.level2).toBe('rp-2');
    expect(result[0].resultsPackIds.level3).toBe('rp-3');
    expect(result[0].resultsPackIds.level4).toBe('rp-4');
  });

  it('should coerce string assessmentVersion to number', () => {
    const questionSets = [
      {
        id: 'qs-1',
        assessmentType: 'gut-check',
        assessmentVersion: '2', // String that should be parsed
        locale: null,
      },
    ];

    const resultsPacks: any[] = [];

    const result = buildAssessmentIndex(questionSets, resultsPacks);

    expect(result).toHaveLength(1);
    expect(result[0].questionsVersion).toBe(2); // Parsed to number
  });
});

