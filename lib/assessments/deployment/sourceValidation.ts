import * as fs from 'fs';
import * as path from 'path';

import { validateQuestionSet } from '@/lib/questionSet/validateQuestionSetShared';
import { validateResultsPack } from '@/lib/resultsPack/validateResultsPack';
import type { AssessmentDeploymentConfig } from '@/lib/assessments/deployment/types';

export interface SourceValidationResult {
  ok: boolean;
  questionSet: {
    ok: boolean;
    errors: string[];
    warnings: string[];
    assessmentType: string;
    schemaVersion: string;
    assessmentVersion: string;
    questionIds: string[];
    avatars: string[];
  };
  resultPacks: {
    ok: boolean;
    resultsVersion: string;
    levelIds: string[];
    packs: Record<
      string,
      { ok: boolean; errors: string[]; warnings: string[]; label?: string }
    >;
  };
  errors: string[];
}

function loadJsonFromRepo(relativePath: string): unknown {
  const abs = path.join(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

export function validateAssessmentSource(
  config: AssessmentDeploymentConfig
): SourceValidationResult {
  const errors: string[] = [];
  const questionSetSource = loadJsonFromRepo(config.contentPaths.questionSetJson) as {
    assessmentType: string;
    version: string;
    questions: { id: string; options: { value: number }[] }[];
    avatars?: string[];
  };
  const resultsSource = loadJsonFromRepo(config.contentPaths.resultsPacksJson) as {
    assessmentType: string;
    version: string;
    packs: Record<string, { label?: string; channels?: { email?: { enabled?: boolean }; pdf?: { enabled?: boolean } } }>;
  };

  const qsValidation = validateQuestionSet(questionSetSource);
  const questionIds = questionSetSource.questions.map((q) => q.id);
  const avatars = questionSetSource.avatars ?? [];

  if (questionSetSource.assessmentType !== config.assessmentType) {
    errors.push(
      `Question set assessmentType must be "${config.assessmentType}", got "${questionSetSource.assessmentType}".`
    );
  }

  if (questionSetSource.version !== config.questionSet.schemaVersion) {
    errors.push(
      `Question set schema version must be "${config.questionSet.schemaVersion}", got "${questionSetSource.version}".`
    );
  }

  const missingQuestions = config.questionSet.expectedQuestionIds.filter(
    (id) => !questionIds.includes(id)
  );
  if (missingQuestions.length > 0) {
    errors.push(`Missing expected question IDs: ${missingQuestions.join(', ')}`);
  }

  const extraQuestions = questionIds.filter(
    (id) => !config.questionSet.expectedQuestionIds.includes(id)
  );
  if (extraQuestions.length > 0) {
    errors.push(`Unexpected question IDs: ${extraQuestions.join(', ')}`);
  }

  for (const q of questionSetSource.questions) {
    const values = q.options.map((o) => o.value).sort((a, b) => a - b);
    if (values.join(',') !== '0,1,2,3') {
      errors.push(`Question ${q.id} must have option values 0,1,2,3 exactly once.`);
    }
  }

  for (const avatar of config.questionSet.expectedAvatars) {
    if (!avatars.includes(avatar)) {
      errors.push(`Missing expected avatar "${avatar}".`);
    }
  }

  if (!qsValidation.ok) {
    errors.push(...qsValidation.errors.map((e) => `Question set: ${e}`));
  }

  if (resultsSource.assessmentType !== config.assessmentType) {
    errors.push(`Results spec assessmentType must be "${config.assessmentType}".`);
  }

  if (resultsSource.version !== config.results.resultsVersion) {
    errors.push(
      `Results spec version must be "${config.results.resultsVersion}", got "${resultsSource.version}".`
    );
  }

  const packResults: SourceValidationResult['resultPacks']['packs'] = {};
  for (const levelId of config.results.levelIds) {
    const pack = resultsSource.packs[levelId];
    if (!pack) {
      errors.push(`Missing result pack for level "${levelId}".`);
      packResults[levelId] = { ok: false, errors: ['missing pack'], warnings: [] };
      continue;
    }

    for (const ch of ['email', 'pdf'] as const) {
      if (pack.channels?.[ch]?.enabled) {
        errors.push(`Pack ${levelId}: channels.${ch}.enabled must be false for launch QA.`);
      }
    }

    const validation = validateResultsPack(pack);
    packResults[levelId] = {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
      label: pack.label,
    };
    if (!validation.ok) {
      errors.push(...validation.errors.map((e) => `Result pack ${levelId}: ${e}`));
    }
  }

  const levelIds = Object.keys(resultsSource.packs).sort();
  const expectedSorted = [...config.results.levelIds].sort();
  if (levelIds.join(',') !== expectedSorted.join(',')) {
    errors.push(
      `Result pack level IDs must be ${expectedSorted.join(', ')}, got ${levelIds.join(', ')}.`
    );
  }

  const questionSetOk =
    qsValidation.ok &&
    questionSetSource.assessmentType === config.assessmentType &&
    missingQuestions.length === 0 &&
    extraQuestions.length === 0;

  const resultPacksOk = Object.values(packResults).every((p) => p.ok);

  return {
    ok: errors.length === 0 && questionSetOk && resultPacksOk,
    questionSet: {
      ok: questionSetOk,
      errors: qsValidation.errors,
      warnings: qsValidation.warnings,
      assessmentType: questionSetSource.assessmentType,
      schemaVersion: questionSetSource.version,
      assessmentVersion: config.questionSet.cmsVersion,
      questionIds,
      avatars,
    },
    resultPacks: {
      ok: resultPacksOk,
      resultsVersion: resultsSource.version,
      levelIds,
      packs: packResults,
    },
    errors,
  };
}
