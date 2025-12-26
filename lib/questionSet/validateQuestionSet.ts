/**
 * Question Set Validation and Hashing
 * 
 * Validates question set JSON structure (v2 schema) and generates content hashes
 * for change detection and caching.
 */

import crypto from 'crypto';

export interface QuestionSet {
  version: string;
  assessmentType: string;
  sections: Array<{
    id: string;
    title: string;
    questionIds: string[];
  }>;
  questions: Array<{
    id: string;
    text: string;
    options: Array<{
      id: string;
      label: string;
      value: number;
    }>;
  }>;
}

export type QuestionSetValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  normalized?: any;
};

/**
 * Recursively sort object keys for stable stringify
 * Ensures same content produces same hash regardless of key order
 */
function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => stableStringify(item)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of sortedKeys) {
    parts.push(JSON.stringify(key) + ':' + stableStringify(obj[key]));
  }
  return '{' + parts.join(',') + '}';
}

/**
 * Generate SHA256 hash of normalized question set JSON
 */
export function hashQuestionSetJson(contentJson: any): string {
  const normalized = stableStringify(contentJson);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Validate question set JSON structure (v2 schema)
 * 
 * Strictly enforces:
 * - version === "2"
 * - assessmentType === "gut-check"
 * - sections[] non-empty; each section has id, title, questionIds[] non-empty
 * - each section.questionIds refers to an existing question.id
 * - unique question.id
 * - each question has text and exactly 4 options
 * - each option has id, label, value in {0,1,2,3}
 * - option ids unique within the question
 * - option values must include 0,1,2,3 exactly once (no missing/dupes)
 */
export function validateQuestionSet(contentJson: any): QuestionSetValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic structure checks
  if (!contentJson || typeof contentJson !== 'object') {
    errors.push('Question set JSON must be an object.');
    return { ok: false, errors, warnings };
  }

  // Version check
  if (contentJson.version !== '2') {
    errors.push(`version must be "2", got "${contentJson.version}".`);
  }

  // Assessment type check
  if (contentJson.assessmentType !== 'gut-check') {
    errors.push(`assessmentType must be "gut-check", got "${contentJson.assessmentType}".`);
  }

  // Sections validation
  if (!Array.isArray(contentJson.sections)) {
    errors.push('sections must be an array.');
    return { ok: false, errors, warnings };
  }

  if (contentJson.sections.length === 0) {
    errors.push('sections array must be non-empty.');
  }

  const sectionIds = new Set<string>();
  for (let i = 0; i < contentJson.sections.length; i++) {
    const section = contentJson.sections[i];
    if (!section || typeof section !== 'object') {
      errors.push(`sections[${i}] must be an object.`);
      continue;
    }

    if (!section.id || typeof section.id !== 'string') {
      errors.push(`sections[${i}].id must be a non-empty string.`);
    } else {
      if (sectionIds.has(section.id)) {
        errors.push(`sections[${i}].id "${section.id}" is duplicate.`);
      }
      sectionIds.add(section.id);
    }

    if (!section.title || typeof section.title !== 'string') {
      errors.push(`sections[${i}].title must be a non-empty string.`);
    }

    if (!Array.isArray(section.questionIds)) {
      errors.push(`sections[${i}].questionIds must be an array.`);
    } else {
      if (section.questionIds.length === 0) {
        errors.push(`sections[${i}].questionIds must be non-empty.`);
      }
    }
  }

  // Questions validation
  if (!Array.isArray(contentJson.questions)) {
    errors.push('questions must be an array.');
    return { ok: false, errors, warnings };
  }

  if (contentJson.questions.length === 0) {
    errors.push('questions array must be non-empty.');
  }

  const questionIds = new Set<string>();
  const allReferencedQuestionIds = new Set<string>();

  // Collect all referenced question IDs from sections
  for (const section of contentJson.sections) {
    if (Array.isArray(section?.questionIds)) {
      for (const qid of section.questionIds) {
        if (typeof qid === 'string') {
          allReferencedQuestionIds.add(qid);
        }
      }
    }
  }

  for (let i = 0; i < contentJson.questions.length; i++) {
    const question = contentJson.questions[i];
    if (!question || typeof question !== 'object') {
      errors.push(`questions[${i}] must be an object.`);
      continue;
    }

    if (!question.id || typeof question.id !== 'string') {
      errors.push(`questions[${i}].id must be a non-empty string.`);
    } else {
      if (questionIds.has(question.id)) {
        errors.push(`questions[${i}].id "${question.id}" is duplicate.`);
      }
      questionIds.add(question.id);
    }

    if (!question.text || typeof question.text !== 'string') {
      errors.push(`questions[${i}].text must be a non-empty string.`);
    }

    // Options validation
    if (!Array.isArray(question.options)) {
      errors.push(`questions[${i}].options must be an array.`);
    } else {
      if (question.options.length !== 4) {
        errors.push(`questions[${i}].options must have exactly 4 options, got ${question.options.length}.`);
      }

      const optionIds = new Set<string>();
      const optionValues = new Set<number>();

      for (let j = 0; j < question.options.length; j++) {
        const option = question.options[j];
        if (!option || typeof option !== 'object') {
          errors.push(`questions[${i}].options[${j}] must be an object.`);
          continue;
        }

        if (!option.id || typeof option.id !== 'string') {
          errors.push(`questions[${i}].options[${j}].id must be a non-empty string.`);
        } else {
          if (optionIds.has(option.id)) {
            errors.push(`questions[${i}].options[${j}].id "${option.id}" is duplicate within question.`);
          }
          optionIds.add(option.id);
        }

        if (!option.label || typeof option.label !== 'string') {
          errors.push(`questions[${i}].options[${j}].label must be a non-empty string.`);
        }

        if (typeof option.value !== 'number') {
          errors.push(`questions[${i}].options[${j}].value must be a number.`);
        } else {
          if (![0, 1, 2, 3].includes(option.value)) {
            errors.push(`questions[${i}].options[${j}].value must be one of {0,1,2,3}, got ${option.value}.`);
          } else {
            if (optionValues.has(option.value)) {
              errors.push(`questions[${i}].options[${j}].value ${option.value} is duplicate within question.`);
            }
            optionValues.add(option.value);
          }
        }
      }

      // Check that all values {0,1,2,3} are present exactly once
      const expectedValues = new Set([0, 1, 2, 3]);
      for (const val of expectedValues) {
        if (!optionValues.has(val)) {
          errors.push(`questions[${i}] is missing option with value ${val}.`);
        }
      }
    }
  }

  // Validate that all referenced question IDs exist
  for (const referencedId of allReferencedQuestionIds) {
    if (!questionIds.has(referencedId)) {
      errors.push(`Section references question.id "${referencedId}" which does not exist.`);
    }
  }

  // Normalization: return as-is for now
  const normalized = contentJson;

  return { ok: errors.length === 0, errors, warnings, normalized };
}

