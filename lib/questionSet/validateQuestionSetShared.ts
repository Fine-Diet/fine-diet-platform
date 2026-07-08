/**
 * Client-safe Question Set validation (v2 schema).
 *
 * This module is pure TypeScript — no Node-only imports — so it can be bundled
 * into the browser for live authoring UI validation. The crypto-backed content
 * hash lives in `./validateQuestionSet` (server-only) and is re-exported from
 * there for backwards compatibility with existing server imports.
 */

import { BASELINE_READINESS_RESULT_LEVELS } from '@/lib/assessments/baselineReadiness/constants';

/**
 * Explicit allowlist of assessment types accepted by CMS authoring, preview,
 * publish, and save paths. Unknown types fail closed — registry `draft` status
 * does not block CMS authoring; only types listed here pass validation.
 */
export const CMS_VALIDATABLE_ASSESSMENT_TYPES = [
  'gut-check',
  'baseline-readiness',
] as const;

export type CmsValidatableAssessmentType =
  (typeof CMS_VALIDATABLE_ASSESSMENT_TYPES)[number];

export function isCmsValidatableAssessmentType(
  value: unknown
): value is CmsValidatableAssessmentType {
  return (
    typeof value === 'string' &&
    (CMS_VALIDATABLE_ASSESSMENT_TYPES as readonly string[]).includes(value)
  );
}

export interface QuestionSet {
  version: string;
  assessmentType: string;
  /** Optional outcome/avatar ids (required for baseline-readiness). */
  avatars?: string[];
  sections: Array<{
    id: string;
    title: string;
    questionIds: string[];
  }>;
  questions: Array<{
    id: string;
    text: string;
    helperText?: string;
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
 * Validate question set JSON structure (v2 schema)
 *
 * Strictly enforces:
 * - version === "2"
 * - assessmentType ∈ CMS_VALIDATABLE_ASSESSMENT_TYPES (gut-check, baseline-readiness)
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

  // Assessment type check (explicit allowlist — unknown types fail closed)
  const assessmentType = contentJson.assessmentType;
  if (!isCmsValidatableAssessmentType(assessmentType)) {
    const allowed = CMS_VALIDATABLE_ASSESSMENT_TYPES.map((t) => `"${t}"`).join(', ');
    errors.push(
      `assessmentType must be one of ${allowed}, got "${String(assessmentType)}".`
    );
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
      const expectedValues = [0, 1, 2, 3];
      for (const val of expectedValues) {
        if (!optionValues.has(val)) {
          errors.push(`questions[${i}] is missing option with value ${val}.`);
        }
      }
    }
  }

  // Validate that all referenced question IDs exist
  for (const referencedId of Array.from(allReferencedQuestionIds)) {
    if (!questionIds.has(referencedId)) {
      errors.push(`Section references question.id "${referencedId}" which does not exist.`);
    }
  }

  // Per-assessment-type rules (after shared structure checks)
  if (assessmentType === 'baseline-readiness') {
    validateBaselineReadinessQuestionSetExtras(contentJson, errors, warnings);
  }

  // Normalization: return as-is for now
  const normalized = contentJson;

  return { ok: errors.length === 0, errors, warnings, normalized };
}

/**
 * Baseline Readiness requires an `avatars` array matching the three readiness
 * outcome level ids so runtime config does not fall back to Gut Check levels.
 */
function validateBaselineReadinessQuestionSetExtras(
  contentJson: any,
  errors: string[],
  warnings: string[]
): void {
  const expected = [...BASELINE_READINESS_RESULT_LEVELS];
  const avatars = contentJson.avatars;

  if (!Array.isArray(avatars)) {
    errors.push(
      'baseline-readiness question sets must include an avatars array with ' +
        'readiness-low, readiness-building, and readiness-ready.'
    );
    return;
  }

  if (avatars.length !== expected.length) {
    errors.push(
      `avatars must contain exactly ${expected.length} readiness level ids, got ${avatars.length}.`
    );
  }

  const seen = new Set<string>();
  for (let i = 0; i < avatars.length; i++) {
    const id = avatars[i];
    if (typeof id !== 'string' || id.length === 0) {
      errors.push(`avatars[${i}] must be a non-empty string.`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`avatars[${i}] "${id}" is duplicate.`);
    }
    seen.add(id);
    if (!expected.includes(id as (typeof expected)[number])) {
      errors.push(
        `avatars[${i}] "${id}" is not a valid Baseline Readiness level. ` +
          'Expected readiness-low, readiness-building, or readiness-ready.'
      );
    }
  }

  for (const levelId of expected) {
    if (!seen.has(levelId)) {
      errors.push(`avatars is missing required Baseline Readiness level "${levelId}".`);
    }
  }

  if (
    avatars.length === expected.length &&
    avatars.some((id: unknown, i: number) => id !== expected[i])
  ) {
    warnings.push(
      'avatars order differs from canonical readiness-low → readiness-building → readiness-ready; ' +
        'all three ids are present so scoring will still work.'
    );
  }
}
