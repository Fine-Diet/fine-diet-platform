/**
 * Outcome Mapping public surface (Packet N).
 *
 * Re-exports the dispatcher, types, and the Gut Check level mapper so callers
 * have a single entry point: `lib/assessments/outcomes`.
 *
 * See `docs/assessments/outcome-mapping.md` for the full guide.
 */

export {
  mapAssessmentOutcome,
  getOutcomeMapper,
  listOutcomeMappers,
  MODELED_OUTCOME_SHAPES_NOT_LIVE,
} from './outcomeMapping';
export {
  gutCheckLevelOutcomeMapper,
  mapGutCheckLevelOutcome,
} from './gutCheckLevelMapping';
export {
  baselineReadinessLevelOutcomeMapper,
  mapBaselineReadinessLevelOutcome,
} from './baselineReadinessLevelMapping';
export type {
  OutcomeShape,
  LevelOutcome,
  PersonaOutcome,
  FlagOutcome,
  RecommendationSetOutcome,
  OutcomeMappingResult,
  OutcomeMappingInput,
  OutcomeMappingError,
  OutcomeMappingErrorKind,
  OutcomeMappingOutcome,
  OutcomeMapper,
} from './types';
