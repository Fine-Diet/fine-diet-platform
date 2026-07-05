/**
 * Outcome Mapping — Type Foundation (Packet N)
 *
 * Pure, data-shaped types that describe how a scored assessment run maps to a
 * user-facing *outcome* — the thing the results screen, email, PDF, webhook,
 * and CTA route from. This is INTENTIONALLY types + interfaces only plus a
 * thin dispatcher in `outcomeMapping.ts`. It is NOT:
 *   - a UI builder,
 *   - a generalized rule engine,
 *   - a persistence layer,
 *   - a second assessment.
 *
 * Outcome shapes modeled (only `level` is live today, for Gut Check):
 *   - `level`              → an ordered band id (Gut Check: level1–level4).
 *   - `persona`            → a persona / category label (modeled, NOT live).
 *   - `flag`               → a set of risk / triage flags (modeled, NOT live).
 *   - `recommendation-set` → a set of recommendation ids (modeled, NOT live).
 *
 * Fail-closed contract (enforced by `mapAssessmentOutcome`):
 *   - Unknown / unregistered `assessmentType` → `unknown-assessment-type`.
 *   - Registered assessmentType whose mapper has not been wired for the
 *     scoring output's shape → `outcome-shape-not-implemented`.
 *   - Missing/invalid input → `invalid-input`.
 * A future assessment must NEVER inherit Gut Check's level mapping. Gut Check
 * is the only assessment with a registered outcome mapper today.
 */

import type { AssessmentType } from '@/lib/assessmentTypes';
import type { AssessmentScoringOutput } from '@/lib/assessments/scoring/types';

// ---------------------------------------------------------------------------
// Outcome shape vocabulary
// ---------------------------------------------------------------------------

/**
 * The shape of result an assessment produces. Only `level` is live today
 * (Gut Check). `persona`, `flag`, and `recommendation-set` are modeled so a
 * future assessment can declare its shape without redefining the model, but no
 * mapper is registered for them yet — they fail closed.
 */
export type OutcomeShape = 'level' | 'persona' | 'flag' | 'recommendation-set';

// ---------------------------------------------------------------------------
// Outcome result variants (one per shape)
// ---------------------------------------------------------------------------

/** A level/band outcome. Gut Check's `level1`–`level4` is the live instance. */
export interface LevelOutcome {
  shape: 'level';
  /** Stable level id (e.g. 'level1'). Matches `primary_avatar` on the submission. */
  levelId: string;
  /** Display label from the operations contract's result-level descriptor, when available. */
  label?: string;
  /** One-line summary from the operations contract, when available. */
  summary?: string;
}

/** A persona / category outcome. Modeled, NOT live. */
export interface PersonaOutcome {
  shape: 'persona';
  personaId: string;
  label?: string;
}

/** A flag / triage outcome. Modeled, NOT live. */
export interface FlagOutcome {
  shape: 'flag';
  flags: string[];
}

/** A recommendation-set outcome. Modeled, NOT live. */
export interface RecommendationSetOutcome {
  shape: 'recommendation-set';
  recommendationIds: string[];
}

/**
 * Discriminated union of all outcome result shapes. Consumers branch on
 * `shape`. Only `level` is produced by a registered mapper today.
 */
export type OutcomeMappingResult =
  | LevelOutcome
  | PersonaOutcome
  | FlagOutcome
  | RecommendationSetOutcome;

// ---------------------------------------------------------------------------
// Mapping input
// ---------------------------------------------------------------------------

/**
 * Input to `mapAssessmentOutcome`. Carries the assessment identity and the
 * scoring output the dispatch layer produced. The mapper reads only the fields
 * it needs (the Gut Check level mapper reads `scoringOutput.primaryAvatar`).
 */
export interface OutcomeMappingInput {
  assessmentType: AssessmentType;
  assessmentVersion: number;
  scoringOutput: AssessmentScoringOutput;
}

// ---------------------------------------------------------------------------
// Mapping error + outcome
// ---------------------------------------------------------------------------

/** Kind of outcome-mapping failure. All variants are internal-safe (no PII). */
export type OutcomeMappingErrorKind =
  | 'unknown-assessment-type'
  | 'outcome-shape-not-implemented'
  | 'invalid-input';

export interface OutcomeMappingError {
  kind: OutcomeMappingErrorKind;
  message: string;
  assessmentType: AssessmentType;
}

export type OutcomeMappingOutcome =
  | { ok: true; result: OutcomeMappingResult }
  | { ok: false; error: OutcomeMappingError };

// ---------------------------------------------------------------------------
// Mapper contract
// ---------------------------------------------------------------------------

/**
 * An outcome mapper for one assessment type. Mappers are registered in
 * `outcomeMapping.ts` and resolved by `assessmentType`. A mapper:
 *   - declares the `assessmentType` it serves,
 *   - declares the `OutcomeShape` it produces,
 *   - maps a scoring output to that shape, purely and synchronously.
 *
 * Mappers MUST NOT silently accept inputs for a different assessment type.
 */
export interface OutcomeMapper {
  /** Stable mapper id (e.g. 'gut-check-level-mapping'). */
  id: string;
  /** Assessment type this mapper serves. */
  assessmentType: AssessmentType;
  /** Outcome shape this mapper produces. */
  shape: OutcomeShape;
  /** Human-readable description. */
  description: string;
  /** Map a scoring output to an outcome. Pure. */
  map(input: OutcomeMappingInput): OutcomeMappingResult;
}
