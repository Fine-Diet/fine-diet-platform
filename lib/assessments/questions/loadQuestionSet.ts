/**
 * Load Question Set
 * 
 * Loads assessment question set content from JSON files.
 * Returns the question set object for a specific version.
 */

import questionsV2 from '@/content/assessments/gut-check/questions_v2.json';

/**
 * Question Set interface (v2 schema)
 */
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

interface LoadQuestionSetInput {
  assessmentType: string;
  assessmentVersion: string | number;
  locale?: string | null;
}

/**
 * Load question set for a given assessment type and version
 */
export function loadQuestionSet(input: LoadQuestionSetInput): QuestionSet | null {
  const { assessmentType, assessmentVersion } = input;

  // Normalize version to string for comparison
  const versionStr = String(assessmentVersion);

  // Load the appropriate question version
  let questionSet: QuestionSet;
  
  if (assessmentType === 'gut-check' && (versionStr === '2' || versionStr === 'v2')) {
    questionSet = questionsV2 as QuestionSet;
  } else {
    console.error(`Unsupported assessmentType/assessmentVersion: ${assessmentType}/${assessmentVersion}`);
    return null;
  }

  // Validate assessment type matches
  if (questionSet.assessmentType !== assessmentType) {
    console.error(`Assessment type mismatch: expected ${assessmentType}, got ${questionSet.assessmentType}`);
    return null;
  }

  // Validate version matches
  if (questionSet.version !== '2') {
    console.error(`Version mismatch: expected "2", got "${questionSet.version}"`);
    return null;
  }

  return questionSet;
}

