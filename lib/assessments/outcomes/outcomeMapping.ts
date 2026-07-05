/**
 * Outcome Mapping Dispatcher (Packet N)
 *
 * The single safe entry point for mapping a scored assessment run to its
 * user-facing outcome. Routes by `assessmentType` to a registered
 * `OutcomeMapper`, and fails closed for every unknown / unmapped case.
 *
 * Why this exists:
 *   Scoring dispatch (Packet M / Packet N runtime wiring) produces a normalized
 *   `AssessmentScoringOutput`. Downstream consumers (results screen, email,
 *   PDF, webhook, CTA) need a stable *outcome* to route on. For Gut Check that
 *   outcome is a level (`level1`–`level4`). A future assessment will produce a
 *   different shape (persona / flag / recommendation-set). Routing the
 *   outcome by `assessmentType` — and failing closed for unknown types — keeps
 *   a future assessment from silently inheriting Gut Check's level mapping the
 *   way the legacy `calculateScoring` let a future v2 assessment silently
 *   inherit Gut Check's axis engine.
 *
 * Fail-closed contract:
 *   - Unknown / unregistered `assessmentType` → `unknown-assessment-type`.
 *   - Missing/invalid input → `invalid-input`.
 *   - A registered mapper that throws → the throw propagates as a programming
 *     error (mappers are required to be pure). This is intentional: mappers
 *     must not perform I/O, so a throw here is a bug to fix, not a runtime
 *     condition to silently degrade from.
 *
 * A future assessment must NEVER silently fall back to Gut Check's level
 * mapping. The only mapper registered today is the Gut Check level mapper,
 * scoped to `assessmentType: 'gut-check'`.
 */

import type {
  OutcomeMapper,
  OutcomeMappingInput,
  OutcomeMappingOutcome,
  OutcomeMappingError,
} from './types';
import { gutCheckLevelOutcomeMapper } from './gutCheckLevelMapping';

// ---------------------------------------------------------------------------
// Mapper registry (keyed by assessmentType)
// ---------------------------------------------------------------------------

/**
 * The outcome-mapper registry. Keyed by `assessmentType` so dispatch can never
 * accidentally route a non-Gut-Check assessment to Gut Check's level mapping.
 *
 * To wire a future assessment's outcome mapping:
 *   1. Implement an `OutcomeMapper` for that `assessmentType` and shape.
 *   2. Register it here. Until you do, `mapAssessmentOutcome` fails closed for
 *      that type — by design.
 */
const OUTCOME_MAPPERS: Readonly<Record<string, OutcomeMapper>> = Object.freeze({
  'gut-check': gutCheckLevelOutcomeMapper,
});

/** Look up the mapper registered for an assessment type. Exported for tests + admin. */
export function getOutcomeMapper(
  assessmentType: string | null | undefined
): OutcomeMapper | undefined {
  if (!assessmentType) return undefined;
  return OUTCOME_MAPPERS[assessmentType];
}

/** All registered outcome mappers, in stable insertion order. For admin visibility. */
export function listOutcomeMappers(): OutcomeMapper[] {
  return Object.values(OUTCOME_MAPPERS);
}

// ---------------------------------------------------------------------------
// Modeled-but-not-live outcome shapes
// ---------------------------------------------------------------------------

/**
 * Outcome shapes that are *modeled* in the type system but have NO registered
 * mapper for any assessment today. Surfaced for admin visibility so it is clear
 * these are designed-but-not-built, not live-ready. A future assessment that
 * wants one of these shapes must register a mapper in `OUTCOME_MAPPERS`.
 */
export const MODELED_OUTCOME_SHAPES_NOT_LIVE: ReadonlyArray<{
  shape: 'persona' | 'flag' | 'recommendation-set';
  label: string;
  summary: string;
}> = Object.freeze([
  {
    shape: 'persona',
    label: 'Persona / category',
    summary:
      'A persona or category label routed from category tallies. Modeled in the OutcomeMappingResult union; no mapper registered.',
  },
  {
    shape: 'flag',
    label: 'Risk / triage flags',
    summary:
      'A set of risk/triage flags routed from answer thresholds. Modeled in the OutcomeMappingResult union; no mapper registered.',
  },
  {
    shape: 'recommendation-set',
    label: 'Recommendation set',
    summary:
      'A set of recommendation ids routed from answer patterns. Modeled in the OutcomeMappingResult union; no mapper registered.',
  },
]);

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function invalidInput(
  assessmentType: OutcomeMappingInput['assessmentType'],
  message: string
): OutcomeMappingOutcome {
  return {
    ok: false,
    error: { kind: 'invalid-input', message, assessmentType },
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Map a scored assessment run to its user-facing outcome via the registered
 * mapper for its `assessmentType`. Returns an `OutcomeMappingOutcome`
 * discriminator. Mappers are pure, so this function does not catch mapper
 * throws — a throw here is a programming bug, not a runtime condition.
 */
export function mapAssessmentOutcome(
  input: OutcomeMappingInput
): OutcomeMappingOutcome {
  if (!input) {
    return invalidInput('', 'mapAssessmentOutcome called with no input.');
  }
  if (!input.assessmentType) {
    return invalidInput(
      input.assessmentType,
      'mapAssessmentOutcome requires input.assessmentType.'
    );
  }
  if (!input.scoringOutput) {
    return invalidInput(
      input.assessmentType,
      'mapAssessmentOutcome requires input.scoringOutput.'
    );
  }

  const mapper = getOutcomeMapper(input.assessmentType);
  if (!mapper) {
    const error: OutcomeMappingError = {
      kind: 'unknown-assessment-type',
      message:
        `No outcome mapper registered for assessmentType ` +
        `"${input.assessmentType}". Register a mapper in ` +
        `lib/assessments/outcomes/outcomeMapping.ts before mapping this ` +
        `assessment's outcome. A future assessment must never fall back to ` +
        `Gut Check level mapping.`,
      assessmentType: input.assessmentType,
    };
    return { ok: false, error };
  }

  const result = mapper.map(input);
  return { ok: true, result };
}
