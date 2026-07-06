/**
 * Forced Result Preview — Gut Check QA harness (Packet P)
 *
 * A pure, testable helper that produces a deterministic, preview-only Gut Check
 * result state for a forced level (`level1`–`level4`). It lets an admin/dev
 * force-render each Gut Check outcome on demand so QA can verify copy, results
 * pack rendering, CTA labels, video resolution, and result layout stability
 * WITHOUT running answers through scoring and WITHOUT writing a submission.
 *
 * What this is NOT:
 *   - NOT a scoring adapter. It does not run scoring math and does not call
 *     `calculateScoring` or `dispatchScoring`. The `scoreMap` here is a stub
 *     for display only.
 *   - NOT an outcome mapper. It does not register or call
 *     `mapAssessmentOutcome`. It produces a forced preview state, not an
 *     `OutcomeMappingResult`.
 *   - NOT an outcome builder UI.
 *   - NOT a public user feature. It is admin/dev-only and writes nothing.
 *   - NOT a path to activate a second assessment. Gut Check is the only
 *     assessment this supports. A future assessment must add its own explicit
 *     forced-preview support before it can be QA'd this way.
 *
 * Safety contract:
 *   - The returned object carries `submissionId: null` and `sessionId: null`
 *     so no downstream code path can mistake it for a real submission. The
 *     forced-preview route renders directly from the results pack + this
 *     state and never POSTs to `/api/assessments/submit`, never emails,
 *     never triggers webhooks / claim / saved-account flows.
 *   - Invalid level ids fail closed (`{ ok: false, error }`); the caller is
 *     responsible for rendering a safe error and never feeding a forced
 *     payload into a real submission path.
 */

import { GUT_CHECK_RESULTS_CONTENT_VERSION } from './constants';

/** The only Gut Check levels a forced preview can render. */
export const FORCED_GUT_CHECK_LEVELS = [
  'level1',
  'level2',
  'level3',
  'level4',
] as const;

export type ForcedGutCheckLevel = (typeof FORCED_GUT_CHECK_LEVELS)[number];

/**
 * Forced preview result state. Shaped to look like a valid Gut Check result
 * for rendering, but marked preview-only and stripped of any identifier that
 * could be mistaken for a real submission.
 */
export interface ForcedGutCheckPreviewResult {
  /** Always 'gut-check'. Forced preview is Gut Check-only today. */
  assessmentType: 'gut-check';
  /** Gut Check live default version. Display only — no scoring is run. */
  assessmentVersion: number;
  /** The forced level id (level1–level4). */
  primaryAvatar: ForcedGutCheckLevel;
  /** Results content version the preview should load (matches ResultsScreen). */
  resultsContentVersion: string;
  /** Permanent marker: consumers can assert this is a forced preview. */
  isForcedPreview: true;
  /**
   * Stub score map for display only. NOT computed by scoring. Deterministic
   * so previews are stable across reloads.
   */
  scoreMap: Record<string, number>;
  normalizedScoreMap: Record<string, number>;
  confidenceScore: number;
  /** Always null — a forced preview has no submission id and writes nothing. */
  submissionId: null;
  /** Always null — a forced preview does not reference a real session. */
  sessionId: null;
}

/** Fail-closed result. The caller must render a safe error and not submit. */
export interface ForcedGutCheckPreviewFailure {
  ok: false;
  error: {
    kind: 'invalid-level' | 'invalid-input';
    message: string;
    requestedLevel: string;
  };
}

export interface ForcedGutCheckPreviewSuccess {
  ok: true;
  result: ForcedGutCheckPreviewResult;
}

export type ForcedGutCheckPreviewOutcome =
  | ForcedGutCheckPreviewSuccess
  | ForcedGutCheckPreviewFailure;

/** Gut Check live default version (matches the registry's defaultVersion). */
const GUT_CHECK_LIVE_VERSION = 3;

/**
 * Build a deterministic, preview-only Gut Check result state for a forced
 * level id. Pure: no I/O, no side effects, no writes. Returns a
 * discriminated outcome — invalid level ids fail closed with
 * `{ ok: false, error }` and are never normalized into a live level.
 *
 * @param levelId - One of 'level1' | 'level2' | 'level3' | 'level4'.
 */
export function buildForcedGutCheckPreviewResult(
  levelId: string
): ForcedGutCheckPreviewOutcome {
  if (typeof levelId !== 'string' || levelId.length === 0) {
    return {
      ok: false,
      error: {
        kind: 'invalid-input',
        message:
          'buildForcedGutCheckPreviewResult requires a non-empty level id ' +
          '(one of: level1, level2, level3, level4).',
        requestedLevel: String(levelId ?? ''),
      },
    };
  }

  if (!FORCED_GUT_CHECK_LEVELS.includes(levelId as ForcedGutCheckLevel)) {
    return {
      ok: false,
      error: {
        kind: 'invalid-level',
        message:
          `"${levelId}" is not a valid Gut Check forced-preview level. ` +
          'Allowed values: level1, level2, level3, level4.',
        requestedLevel: levelId,
      },
    };
  }

  const forced = levelId as ForcedGutCheckLevel;

  return {
    ok: true,
    result: {
      assessmentType: 'gut-check',
      assessmentVersion: GUT_CHECK_LIVE_VERSION,
      primaryAvatar: forced,
      resultsContentVersion: GUT_CHECK_RESULTS_CONTENT_VERSION,
      isForcedPreview: true,
      // Deterministic stub scores for display only. The forced level is the
      // sole non-zero entry so any QA display of "scores" reflects the forced
      // outcome, not a real scoring run.
      scoreMap: { [forced]: 1 },
      normalizedScoreMap: { [forced]: 1 },
      confidenceScore: 1,
      submissionId: null,
      sessionId: null,
    },
  };
}
