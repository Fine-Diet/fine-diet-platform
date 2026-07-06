/**
 * Scoring Dispatch (Packet M)
 *
 * The single safe entry point for scoring a completed assessment run. Routes
 * by `assessmentType` to a registered `AssessmentScoringAdapter`, and fails
 * closed for every unknown / mismatched case.
 *
 * Why this exists:
 *   The legacy `calculateScoring` routed by `assessmentVersion` (2 → v2, 3 →
 *   v3). A second assessment shipping with `assessmentVersion: 2` would
 *   silently inherit Gut Check's axis engine — including the q1–q17 axis map,
 *   the level1–level4 decision tree, and `getAssessmentConfig('gut-check', …)`
 *   threshold lookups. That is unsafe. `dispatchScoring` routes by
 *   `assessmentType` instead, so a future assessment must register its own
 *   adapter before it can be scored at all.
 *
 * Fail-closed contract:
 *   - Unknown / unregistered `assessmentType` → `unknown-assessment-type`.
 *   - Caller passes `adapterId` that does not match the resolved adapter →
 *     `adapter-id-mismatch`.
 *   - Caller passes `scoringTemplateId` that does not match the resolved
 *     adapter's declared template → `scoring-template-mismatch`.
 *   - Adapter throws → `adapter-throw` (message is internal-safe; the adapter
 *     is responsible for not embedding user data in thrown messages).
 *   - Missing `assessmentType` / `answers` / `config` → `invalid-input`.
 *
 * A future assessment must NEVER silently fall back to Gut Check scoring. The
 * only adapter registered today is the Gut Check adapter, scoped to
 * `assessmentType: 'gut-check'`.
 *
 * Wiring status (Packet N, hardened in Packet O):
 *   This module is the canonical and live runtime scoring entry point. The
 *   runtime (`AssessmentProvider`) scores through `scoreAssessmentRun`
 *   (→ `dispatchScoring` → the Gut Check adapter → `calculateScoring`).
 *   `AssessmentProvider` does NOT import or call `calculateScoring` directly;
 *   it remains in the tree only as the Gut Check adapter's internal
 *   implementation detail. Dispatch failures fail closed (`state.scoringError`)
 *   and block submission; the recovery path is documented in
 *   `docs/assessments/scoring-dispatch.md`. See that doc for the full guide.
 */

import type {
  AssessmentScoringAdapter,
  AssessmentScoringInput,
  AssessmentScoringOutput,
  ScoringDispatchError,
  ScoringDispatchResult,
} from './types';
import { gutCheckScoringAdapter } from './gutCheckAdapter';
import { baselineReadinessScoringAdapter } from './baselineReadinessAdapter';

// ---------------------------------------------------------------------------
// Adapter registry (keyed by assessmentType)
// ---------------------------------------------------------------------------

/**
 * The adapter registry. Keyed by `assessmentType` so dispatch can never
 * accidentally route a non-Gut-Check assessment to the Gut Check engine.
 *
 * To wire a future assessment's scoring:
 *   1. Implement an `AssessmentScoringAdapter` for that `assessmentType`.
 *   2. Register it here. Until you do, `dispatchScoring` fails closed for
 *      that type — by design.
 */
const ADAPTER_REGISTRY: Readonly<Record<string, AssessmentScoringAdapter>> =
  Object.freeze({
    'gut-check': gutCheckScoringAdapter,
    'baseline-readiness': baselineReadinessScoringAdapter,
  });

/**
 * Look up the adapter registered for an assessment type. Returns undefined for
 * unregistered types. Exported for tests + admin introspection.
 */
export function getScoringAdapter(
  assessmentType: string | null | undefined
): AssessmentScoringAdapter | undefined {
  if (!assessmentType) return undefined;
  return ADAPTER_REGISTRY[assessmentType];
}

/** All registered adapters, in stable insertion order. For admin visibility. */
export function listScoringAdapters(): AssessmentScoringAdapter[] {
  return Object.values(ADAPTER_REGISTRY);
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function invalidInput(
  assessmentType: AssessmentScoringInput['assessmentType'],
  message: string
): ScoringDispatchResult {
  return {
    ok: false,
    error: {
      kind: 'invalid-input',
      message,
      assessmentType,
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Score a completed assessment run via the registered adapter for its
 * `assessmentType`. Returns a `ScoringDispatchResult` — never throws scoring
 * errors to the caller. Use the `ok` discriminator to branch.
 *
 * Callers that want a hard guarantee they are hitting a specific adapter
 * (e.g. an admin tool verifying the live engine) should pass `adapterId`
 * and/or `scoringTemplateId`; the dispatch fails closed on a mismatch.
 */
export async function dispatchScoring(
  input: AssessmentScoringInput
): Promise<ScoringDispatchResult> {
  // Basic input validation. Keep messages internal-safe (no answer contents).
  if (!input) {
    return invalidInput('', 'dispatchScoring called with no input.');
  }
  if (!input.assessmentType) {
    return invalidInput(
      input.assessmentType,
      'dispatchScoring requires input.assessmentType.'
    );
  }
  if (!Array.isArray(input.answers)) {
    return invalidInput(
      input.assessmentType,
      'dispatchScoring requires input.answers to be an array.'
    );
  }
  if (!input.config) {
    return invalidInput(
      input.assessmentType,
      'dispatchScoring requires input.config.'
    );
  }

  const adapter = getScoringAdapter(input.assessmentType);
  if (!adapter) {
    return {
      ok: false,
      error: {
        kind: 'unknown-assessment-type',
        message:
          `No scoring adapter registered for assessmentType ` +
          `"${input.assessmentType}". Register an adapter in ` +
          `lib/assessments/scoring/scoringDispatch.ts before scoring this ` +
          `assessment. A future assessment must never fall back to Gut Check ` +
          `scoring.`,
        assessmentType: input.assessmentType,
        requestedAdapterId: input.adapterId,
        requestedScoringTemplateId: input.scoringTemplateId,
      },
    };
  }

  // Optional identity constraints — fail closed on mismatch.
  if (
    input.adapterId &&
    input.adapterId !== adapter.id &&
    // Allow the legacy v1/v2 adapter ids to pass when the adapter reports a
    // different per-version id at runtime (Gut Check v3 adapter reports
    // 'gut-check-axis-v3' but a caller may pin to a legacy id). The
    // per-version id is resolved inside the adapter; the registry id is the
    // canonical 'gut-check-axis-v3'. To keep fail-closed semantics tight
    // while not breaking honest legacy pinning, accept a match against the
    // canonical registry id OR the Gut Check legacy id set documented in the
    // operations contract.
    !isGutCheckLegacyAdapterId(input.adapterId, adapter)
  ) {
    return {
      ok: false,
      error: {
        kind: 'adapter-id-mismatch',
        message:
          `Requested adapterId "${input.adapterId}" does not match the ` +
          `registered adapter "${adapter.id}" for assessmentType ` +
          `"${input.assessmentType}".`,
        assessmentType: input.assessmentType,
        requestedAdapterId: input.adapterId,
        resolvedAdapterId: adapter.id,
      },
    };
  }

  if (
    input.scoringTemplateId &&
    input.scoringTemplateId !== adapter.scoringTemplateId &&
    !isGutCheckLegacyScoringTemplateId(input.scoringTemplateId, adapter)
  ) {
    return {
      ok: false,
      error: {
        kind: 'scoring-template-mismatch',
        message:
          `Requested scoringTemplateId "${input.scoringTemplateId}" does not ` +
          `match the adapter's declared template "${adapter.scoringTemplateId}" ` +
          `for assessmentType "${input.assessmentType}".`,
        assessmentType: input.assessmentType,
        requestedScoringTemplateId: input.scoringTemplateId,
        resolvedScoringTemplateId: adapter.scoringTemplateId,
      },
    };
  }

  // Delegate to the adapter. Catch any thrown error and convert to a
  // dispatch result so callers never see a scoring throw escape dispatch.
  let output: AssessmentScoringOutput;
  try {
    output = await adapter.score(input);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Scoring adapter threw a non-Error value.';
    return {
      ok: false,
      error: {
        kind: 'adapter-throw',
        // Internal-safe: adapters are responsible for not embedding user data.
        message: `[dispatchScoring] adapter "${adapter.id}" threw: ${message}`,
        assessmentType: input.assessmentType,
        requestedAdapterId: input.adapterId,
        requestedScoringTemplateId: input.scoringTemplateId,
        resolvedAdapterId: adapter.id,
      },
    };
  }

  return { ok: true, output };
}

// ---------------------------------------------------------------------------
// Legacy id helpers (Gut Check only)
// ---------------------------------------------------------------------------

/**
 * The Gut Check adapter's canonical registry id is 'gut-check-axis-v3', but
 * at runtime it reports a per-version id (v3 / v2 / v1). A caller that pins
 * to a legacy id ('gut-check-axis-v2' / 'gut-check-weighted-v1') should still
 * be accepted for Gut Check, since those ids are documented in the operations
 * contract. This helper keeps that allowance scoped to the Gut Check adapter
 * only — a future adapter gets no such allowance.
 */
function isGutCheckLegacyAdapterId(
  requestedId: string,
  adapter: AssessmentScoringAdapter
): boolean {
  if (adapter.assessmentType !== 'gut-check') return false;
  return (
    requestedId === 'gut-check-axis-v2' ||
    requestedId === 'gut-check-weighted-v1' ||
    requestedId === 'gut-check-axis-v3'
  );
}

/**
 * The Gut Check adapter's canonical template id is 'axis-scores-to-profile',
 * but v1 runs report 'weighted-avatar-normalization'. A caller that pins to
 * the legacy v1 template id should still be accepted for Gut Check. Scoped to
 * the Gut Check adapter only.
 */
function isGutCheckLegacyScoringTemplateId(
  requestedId: string,
  adapter: AssessmentScoringAdapter
): boolean {
  if (adapter.assessmentType !== 'gut-check') return false;
  return (
    requestedId === 'axis-scores-to-profile' ||
    requestedId === 'weighted-avatar-normalization'
  );
}
