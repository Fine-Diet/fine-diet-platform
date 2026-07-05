/**
 * Scoring Dispatch — Type Foundation (Packet M)
 *
 * Pure, testable types that describe how an assessment's answers become a
 * scored result. This module is INTENTIONALLY types + interfaces only — it
 * does not execute scoring and does not couple to the Gut Check engine.
 *
 * The dispatch layer (`scoringDispatch.ts`) uses these types to route scoring
 * by `assessmentType` (and optionally by `adapterId` / `scoringTemplateId`),
 * delegating to a registered `AssessmentScoringAdapter`. Today only the Gut
 * Check adapter is registered; every other assessment type fails closed.
 *
 * Design rules enforced by the dispatch layer:
 *   - Dispatch is keyed by `assessmentType`, NEVER by `assessmentVersion` alone.
 *     The legacy `calculateScoring` routed by version (2 → v2, 3 → v3), which
 *     would let a second assessment with version 2 silently inherit Gut Check's
 *     axis engine. The dispatch layer forbids that.
 *   - Unknown / unregistered assessment types fail closed with a
 *     `ScoringDispatchError`. A future assessment must never silently fall
 *     back to Gut Check scoring.
 *   - When a caller passes an explicit `adapterId` or `scoringTemplateId`, the
 *     resolved adapter must match both, or the dispatch fails closed. This
 *     makes accidental cross-assessment adapter reuse impossible.
 *
 * This module does NOT:
 *   - build a generalized scoring-rule engine,
 *   - persist scoring rules or planned assessment drafts to the DB,
 *   - change Gut Check runtime scoring behavior.
 */

import type {
  Answer,
  AssessmentConfig,
  AssessmentType,
  ScoreMap,
} from '@/lib/assessmentTypes';

// ---------------------------------------------------------------------------
// Identity ids
// ---------------------------------------------------------------------------

/**
 * Stable scoring-adapter id. Mirrors `ScoringAdapterId` in the operations
 * contract but is widened to a string so future adapters can be declared
 * without editing this union. Known live ids today:
 *   - 'gut-check-axis-v3'        (Gut Check v3 axis engine, live)
 *   - 'gut-check-axis-v2'        (Gut Check v2 axis engine, legacy)
 *   - 'gut-check-weighted-v1'    (Gut Check v1 weighted-avatar engine, legacy)
 */
export type ScoringAdapterId = string;

/**
 * Stable scoring-template id. Mirrors `ScoringTemplate['id']` in the factory
 * metadata but widened to a string. Known template today:
 *   - 'axis-scores-to-profile'   (Gut Check axis → level decision tree)
 * Future templates ('total-score-to-levels', 'category-tally-to-persona', …)
 * are declared as metadata in `assessmentFactory.ts` and remain `planned` until
 * a real adapter is wired here.
 */
export type ScoringTemplateId = string;

// ---------------------------------------------------------------------------
// Dispatch input / output
// ---------------------------------------------------------------------------

/**
 * Input to `dispatchScoring`. Carries everything an adapter needs to score a
 * completed assessment run, plus optional identity constraints that the
 * dispatch layer validates to prevent cross-assessment adapter leakage.
 */
export interface AssessmentScoringInput {
  /** Assessment type being scored. Selects the adapter from the registry. */
  assessmentType: AssessmentType;
  /** Assessment version (drives legacy version-keyed engines inside an adapter). */
  assessmentVersion: number;
  /**
   * Optional adapter id constraint. When present, the resolved adapter's id
   * MUST equal this value or the dispatch fails closed. Used by callers that
   * want a hard guarantee they are hitting a specific engine.
   */
  adapterId?: ScoringAdapterId;
  /**
   * Optional scoring-template id constraint. When present, the resolved
   * adapter's declared `scoringTemplateId` MUST equal this value or the
   * dispatch fails closed.
   */
  scoringTemplateId?: ScoringTemplateId;
  /** Completed answers (questionId + optionId), in question order. */
  answers: Answer[];
  /**
   * Question-set metadata needed for scoring (avatars, questions, options,
   * scoring thresholds). This is the same `AssessmentConfig` the runtime
   * resolver produces; adapters may read only the fields they need.
   */
  config: AssessmentConfig;
  /** True when scoring a runtime preview run. Adapters MUST NOT branch on this
   *  to change scoring math; it is forwarded for telemetry / defensive guards. */
  preview?: boolean;
}

/**
 * Normalized scoring output. Superset of the legacy `ScoringResult` shape so
 * the current Gut Check result flow (ResultsScreen, submission payload,
 * artifact payload, preview) can consume it without reshaping.
 *
 * Compatibility fields (kept stable for the current Gut Check result flow):
 *   - `primaryAvatar`   → stored as `primary_avatar` on the submission row.
 *   - `scoreMap` / `normalizedScoreMap` → forwarded on the submission payload.
 *   - `secondaryAvatar`, `confidenceScore`, `secondaryModifier`,
 *     `confidenceLabel` → forwarded on the submission payload + artifacts.
 *
 * New fields (additive, optional, ignored by current consumers):
 *   - `totalScore`, `axisScores`, `flags` → reserved for future adapters.
 */
export interface AssessmentScoringOutput {
  /** Assessment type that was scored. Echoed from the input. */
  assessmentType: AssessmentType;
  /** Assessment version that was scored. Echoed from the input. */
  assessmentVersion: number;
  /** Adapter id that produced this output. */
  adapterId: ScoringAdapterId;
  /** Scoring template id the adapter declares for this result. */
  scoringTemplateId: ScoringTemplateId;

  // --- Compatibility fields consumed by the current Gut Check result flow ---
  /** Result level / primary avatar id (e.g. 'level1' … 'level4'). */
  primaryAvatar: string;
  /** Secondary avatar id, when the adapter emits one. */
  secondaryAvatar?: string;
  /** Raw score map (avatar → score). Forwarded on the submission payload. */
  scoreMap: ScoreMap;
  /** Normalized score map (avatar → 0..1). Forwarded on the submission payload. */
  normalizedScoreMap: ScoreMap;
  /** Confidence score (0..1). Forwarded on the submission payload. */
  confidenceScore: number;
  /** Secondary modifier string (e.g. 'high_responsiveness'), v2/v3 only. */
  secondaryModifier?: string;
  /** Confidence band label ('high' | 'moderate' | 'low'), v2/v3 only. */
  confidenceLabel?: string;

  // --- Additive fields reserved for future adapters (ignored today) ---
  /** Total score, when the adapter produces a single scalar. */
  totalScore?: number;
  /** Axis → score map, when the adapter produces per-axis scores. */
  axisScores?: Record<string, number>;
  /** Result level id (alias of `primaryAvatar` for non-avatar adapters). */
  levelId?: string;
  /** Risk / triage flags, when the adapter produces flag-based results. */
  flags?: string[];
}

// ---------------------------------------------------------------------------
// Adapter contract
// ---------------------------------------------------------------------------

/**
 * A scoring adapter for one assessment type. Adapters are registered in
 * `scoringDispatch.ts` and resolved by `assessmentType`. An adapter:
 *   - declares the `assessmentType` it serves,
 *   - declares the `scoringTemplateId` it instantiates,
 *   - exposes a pure-ish async `score()` that maps input → output.
 *
 * Adapters MAY delegate to existing engines (the Gut Check adapter delegates
 * to `calculateScoring`). They MUST NOT silently accept inputs for a
 * different assessment type.
 */
export interface AssessmentScoringAdapter {
  /** Stable adapter id (e.g. 'gut-check-axis-v3'). */
  id: ScoringAdapterId;
  /** Assessment type this adapter serves. */
  assessmentType: AssessmentType;
  /** Scoring template id this adapter instantiates. */
  scoringTemplateId: ScoringTemplateId;
  /** Human-readable description of the scoring logic. */
  description: string;
  /** Score a completed run. Must not mutate the input. */
  score(input: AssessmentScoringInput): Promise<AssessmentScoringOutput>;
}

// ---------------------------------------------------------------------------
// Dispatch result + error
// ---------------------------------------------------------------------------

/** Successful dispatch result. */
export type ScoringDispatchResult =
  | { ok: true; output: AssessmentScoringOutput }
  | { ok: false; error: ScoringDispatchError };

/** Kind of dispatch failure. All variants are internal-safe (no PII). */
export type ScoringDispatchErrorKind =
  | 'unknown-assessment-type'
  | 'adapter-id-mismatch'
  | 'scoring-template-mismatch'
  | 'adapter-throw'
  | 'invalid-input';

/**
 * Internal-safe dispatch error. Never includes answer contents or user data;
 * only ids and a short message. Safe to log server-side and to surface in
 * admin tooling.
 */
export interface ScoringDispatchError {
  kind: ScoringDispatchErrorKind;
  message: string;
  /** The assessment type that was requested. */
  assessmentType: AssessmentType;
  /** The adapter id that was requested, if any. */
  requestedAdapterId?: ScoringAdapterId;
  /** The scoring template id that was requested, if any. */
  requestedScoringTemplateId?: ScoringTemplateId;
  /** The adapter id that was resolved, when a mismatch is the cause. */
  resolvedAdapterId?: ScoringAdapterId;
  /** The scoring template id that was resolved, when a mismatch is the cause. */
  resolvedScoringTemplateId?: ScoringTemplateId;
}
