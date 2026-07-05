/**
 * Runtime Scoring Wrapper (Packet N)
 *
 * The single safe runtime entry point the live assessment runtime
 * (`AssessmentProvider`) calls to score a completed run. It delegates to
 * `dispatchScoring` and maps the adapter output back into the legacy
 * `ScoringResult` shape the runtime reducer / submission payload / preview
 * screen already consume — without reshaping any downstream code.
 *
 * Why a wrapper (instead of calling `dispatchScoring` inline in the provider):
 *   - keeps `AssessmentProvider` readable,
 *   - makes dispatch fail-closed handling unit-testable in isolation,
 *   - gives the runtime one place that owns the `AssessmentScoringOutput` →
 *     `ScoringResult` projection so the projection is explicit and tested.
 *
 * Fail-closed contract:
 *   - On any `dispatchScoring` failure (unknown type, mismatched ids,
 *     adapter throw, invalid input), this wrapper returns `{ ok: false, error }`.
 *   - The runtime MUST surface an explicit scoring-unavailable state and block
 *     submission when `ok: false`. It MUST NOT silently fall back to the legacy
 *     `calculateScoring` path. `calculateScoring` remains in the tree only as
 *     the Gut Check adapter's internal implementation detail.
 *
 * Parity:
 *   - For `assessmentType: 'gut-check'`, the projected `ScoringResult` is
 *     field-for-field equal to what the legacy `calculateScoring` returns
 *     (scoreMap, normalizedScoreMap, primaryAvatar, secondaryAvatar,
 *     confidenceScore, secondaryModifier, confidenceLabel). Parity is asserted
 *     in `lib/assessments/__tests__/runtimeScore.test.ts`.
 */

import type { Answer, AssessmentConfig, AssessmentType } from '@/lib/assessmentTypes';
import type { ScoringResult } from '@/lib/assessmentScoring';
import { dispatchScoring } from './scoringDispatch';
import type { ScoringDispatchError } from './types';

/** Input to `scoreAssessmentRun`. Mirrors what the runtime has on hand. */
export interface RuntimeScoreInput {
  assessmentType: AssessmentType;
  assessmentVersion: number;
  answers: Answer[];
  config: AssessmentConfig;
  /** True when scoring a runtime preview run. Forwarded to the adapter. */
  preview?: boolean;
}

/**
 * Successful runtime scoring result. `scoringResult` is the legacy-shape
 * projection the reducer consumes; `adapterId` / `scoringTemplateId` are
 * surfaced for telemetry / admin visibility and are ignored by the reducer.
 */
export interface RuntimeScoreSuccess {
  ok: true;
  scoringResult: ScoringResult;
  adapterId: string;
  scoringTemplateId: string;
}

/** Fail-closed result. The runtime must block submission on this. */
export interface RuntimeScoreFailure {
  ok: false;
  error: ScoringDispatchError;
}

export type RuntimeScoreOutcome = RuntimeScoreSuccess | RuntimeScoreFailure;

/**
 * Score a completed assessment run through the dispatch layer and project the
 * result into the legacy `ScoringResult` shape. Never throws scoring errors to
 * the caller — failures are returned as `{ ok: false, error }`.
 */
export async function scoreAssessmentRun(
  input: RuntimeScoreInput
): Promise<RuntimeScoreOutcome> {
  const dispatchResult = await dispatchScoring({
    assessmentType: input.assessmentType,
    assessmentVersion: input.assessmentVersion,
    answers: input.answers,
    config: input.config,
    preview: input.preview,
  });

  if (!dispatchResult.ok) {
    return { ok: false, error: dispatchResult.error };
  }

  const out = dispatchResult.output;

  // Project the dispatch output (a strict superset of ScoringResult) into the
  // exact legacy shape the reducer / submission payload / preview consume.
  // Every field read here is part of the compatibility contract documented in
  // `types.ts`.
  const scoringResult: ScoringResult = {
    scoreMap: out.scoreMap,
    normalizedScoreMap: out.normalizedScoreMap,
    primaryAvatar: out.primaryAvatar,
    secondaryAvatar: out.secondaryAvatar,
    confidenceScore: out.confidenceScore,
    secondaryModifier: out.secondaryModifier,
    confidenceLabel: out.confidenceLabel,
  };

  return {
    ok: true,
    scoringResult,
    adapterId: out.adapterId,
    scoringTemplateId: out.scoringTemplateId,
  };
}
