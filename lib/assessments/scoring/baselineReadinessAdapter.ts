/**
 * Baseline Readiness Scoring Adapter (Packet Q — internal proof)
 *
 * Provisional, deterministic total-score-to-levels engine for the second
 * assessment proof. Does NOT delegate to Gut Check's `calculateScoring` or
 * reuse its axis math.
 *
 * Scoring model (PROVISIONAL / INTERNAL ONLY):
 *   - Sum option values (0–3) across all answered questions.
 *   - Map the total to three readiness bands via fixed ratio thresholds:
 *       ≤ 33% of max total  → readiness-low
 *       ≤ 66% of max total → readiness-building
 *       > 66% of max total → readiness-ready
 *
 * Fail-closed:
 *   - Refuses non-baseline-readiness assessmentType.
 *   - Throws when answers are empty, when a question is unanswered, or when
 *     an option value cannot be resolved from the config.
 */

import type { Answer, AssessmentConfig } from '@/lib/assessmentTypes';
import type { AssessmentScoringAdapter } from './types';
import {
  BASELINE_READINESS_RESULT_LEVELS,
  BASELINE_READINESS_SCORING_ADAPTER_ID,
  BASELINE_READINESS_SCORING_TEMPLATE_ID,
  type BaselineReadinessLevel,
} from '@/lib/assessments/baselineReadiness/constants';

/** Resolve the numeric value for one answer from the question set config. */
function resolveOptionValue(
  answer: Answer,
  config: AssessmentConfig
): number {
  const question = config.questions.find((q) => q.id === answer.questionId);
  if (!question) {
    throw new Error(
      `[baselineReadinessAdapter] Unknown questionId "${answer.questionId}".`
    );
  }
  const option = question.options.find((o) => o.id === answer.optionId);
  if (!option) {
    throw new Error(
      `[baselineReadinessAdapter] Unknown optionId "${answer.optionId}" ` +
        `for question "${answer.questionId}".`
    );
  }
  if (typeof option.value !== 'number' || Number.isNaN(option.value)) {
    throw new Error(
      `[baselineReadinessAdapter] Option "${answer.optionId}" has no numeric value.`
    );
  }
  return option.value;
}

/**
 * Map a total score to a readiness level using fixed ratio thresholds.
 * Exported for unit tests.
 */
export function mapBaselineReadinessTotalToLevel(
  totalScore: number,
  maxTotal: number
): BaselineReadinessLevel {
  if (maxTotal <= 0) {
    throw new Error(
      '[baselineReadinessAdapter] maxTotal must be positive to map a level.'
    );
  }
  if (totalScore < 0 || totalScore > maxTotal) {
    throw new Error(
      `[baselineReadinessAdapter] totalScore ${totalScore} out of range 0..${maxTotal}.`
    );
  }

  const ratio = totalScore / maxTotal;
  if (ratio <= 1 / 3) return 'readiness-low';
  if (ratio <= 2 / 3) return 'readiness-building';
  return 'readiness-ready';
}

/** Compute max achievable total from the config (sum of max option values). */
export function computeBaselineReadinessMaxTotal(config: AssessmentConfig): number {
  return config.questions.reduce((sum, q) => {
    const values = q.options
      .map((o) => o.value)
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    if (values.length === 0) {
      throw new Error(
        `[baselineReadinessAdapter] Question "${q.id}" has no numeric option values.`
      );
    }
    return sum + Math.max(...values);
  }, 0);
}

export const baselineReadinessScoringAdapter: AssessmentScoringAdapter = {
  id: BASELINE_READINESS_SCORING_ADAPTER_ID,
  assessmentType: 'baseline-readiness',
  scoringTemplateId: BASELINE_READINESS_SCORING_TEMPLATE_ID,
  description:
    'Provisional internal total-score-to-levels adapter for Baseline Readiness. ' +
    'Sums 0–3 option values and maps to readiness-low / readiness-building / ' +
    'readiness-ready via fixed ratio thresholds. NOT final clinical scoring.',
  async score({ assessmentType, assessmentVersion, answers, config }) {
    if (assessmentType !== 'baseline-readiness') {
      throw new Error(
        `[baselineReadinessAdapter] Refusing to score assessment type ` +
          `"${assessmentType}". This adapter serves baseline-readiness only.`
      );
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      throw new Error(
        '[baselineReadinessAdapter] Refusing to score with empty answers.'
      );
    }

    if (config.questions.length === 0) {
      throw new Error(
        '[baselineReadinessAdapter] Refusing to score with an empty question set.'
      );
    }

    if (config.assessmentType !== 'baseline-readiness') {
      throw new Error(
        `[baselineReadinessAdapter] Config assessmentType "${config.assessmentType}" ` +
          'does not match baseline-readiness.'
      );
    }

    if (answers.length !== config.questions.length) {
      throw new Error(
        `[baselineReadinessAdapter] Expected ${config.questions.length} answers, ` +
          `received ${answers.length}. All questions must be answered.`
      );
    }

    const maxTotal = computeBaselineReadinessMaxTotal(config);
    let totalScore = 0;
    for (const answer of answers) {
      totalScore += resolveOptionValue(answer, config);
    }

    const levelId = mapBaselineReadinessTotalToLevel(totalScore, maxTotal);

    const scoreMap: Record<string, number> = {};
    for (const id of BASELINE_READINESS_RESULT_LEVELS) {
      scoreMap[id] = id === levelId ? totalScore : 0;
    }

    const normalizedScoreMap: Record<string, number> = {};
    for (const id of BASELINE_READINESS_RESULT_LEVELS) {
      normalizedScoreMap[id] = id === levelId ? totalScore / maxTotal : 0;
    }

    return {
      assessmentType,
      assessmentVersion,
      adapterId: BASELINE_READINESS_SCORING_ADAPTER_ID,
      scoringTemplateId: BASELINE_READINESS_SCORING_TEMPLATE_ID,
      primaryAvatar: levelId,
      scoreMap,
      normalizedScoreMap,
      confidenceScore: answers.length / config.questions.length,
      totalScore,
      levelId,
    };
  },
};
