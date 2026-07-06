/**
 * Forced Result Preview — Baseline Readiness QA harness (Packet Q)
 *
 * Pure helper that produces a deterministic, preview-only Baseline Readiness
 * result state for a forced level (readiness-low / readiness-building /
 * readiness-ready). Mirrors the Gut Check forced-preview pattern in
 * `forcedPreview.ts` but is scoped to Baseline Readiness only.
 *
 * Safety contract matches Gut Check forced preview:
 *   - submissionId / sessionId always null
 *   - no scoring dispatch, no outcome mapper, no submissions/emails/webhooks
 */

import {
  BASELINE_READINESS_RESULT_LEVELS,
  BASELINE_READINESS_RESULTS_CONTENT_VERSION,
  type BaselineReadinessLevel,
} from '@/lib/assessments/baselineReadiness/constants';
import { BASELINE_READINESS_INTERNAL_FIXTURE_VERSION } from '@/lib/assessments/internal/baselineReadinessFixture';

export { BASELINE_READINESS_RESULT_LEVELS as FORCED_BASELINE_READINESS_LEVELS };

export interface ForcedBaselineReadinessPreviewResult {
  assessmentType: 'baseline-readiness';
  assessmentVersion: number;
  primaryAvatar: BaselineReadinessLevel;
  resultsContentVersion: string;
  isForcedPreview: true;
  scoreMap: Record<string, number>;
  normalizedScoreMap: Record<string, number>;
  confidenceScore: number;
  submissionId: null;
  sessionId: null;
}

export interface ForcedBaselineReadinessPreviewFailure {
  ok: false;
  error: {
    kind: 'invalid-level' | 'invalid-input';
    message: string;
    requestedLevel: string;
  };
}

export interface ForcedBaselineReadinessPreviewSuccess {
  ok: true;
  result: ForcedBaselineReadinessPreviewResult;
}

export type ForcedBaselineReadinessPreviewOutcome =
  | ForcedBaselineReadinessPreviewSuccess
  | ForcedBaselineReadinessPreviewFailure;

export function buildForcedBaselineReadinessPreviewResult(
  levelId: string
): ForcedBaselineReadinessPreviewOutcome {
  if (typeof levelId !== 'string' || levelId.length === 0) {
    return {
      ok: false,
      error: {
        kind: 'invalid-input',
        message:
          'buildForcedBaselineReadinessPreviewResult requires a non-empty level id ' +
          '(one of: readiness-low, readiness-building, readiness-ready).',
        requestedLevel: String(levelId ?? ''),
      },
    };
  }

  if (
    !BASELINE_READINESS_RESULT_LEVELS.includes(levelId as BaselineReadinessLevel)
  ) {
    return {
      ok: false,
      error: {
        kind: 'invalid-level',
        message:
          `"${levelId}" is not a valid Baseline Readiness forced-preview level. ` +
          'Allowed values: readiness-low, readiness-building, readiness-ready.',
        requestedLevel: levelId,
      },
    };
  }

  const forced = levelId as BaselineReadinessLevel;

  return {
    ok: true,
    result: {
      assessmentType: 'baseline-readiness',
      assessmentVersion: BASELINE_READINESS_INTERNAL_FIXTURE_VERSION,
      primaryAvatar: forced,
      resultsContentVersion: BASELINE_READINESS_RESULTS_CONTENT_VERSION,
      isForcedPreview: true,
      scoreMap: { [forced]: 1 },
      normalizedScoreMap: { [forced]: 1 },
      confidenceScore: 1,
      submissionId: null,
      sessionId: null,
    },
  };
}
