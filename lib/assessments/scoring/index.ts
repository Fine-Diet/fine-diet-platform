/**
 * Scoring Dispatch public surface (Packet M).
 *
 * Re-exports the dispatch module, types, and the Gut Check adapter so callers
 * have a single entry point: `lib/assessments/scoring`.
 *
 * See `docs/assessments/scoring-dispatch.md` for the full guide.
 */

export {
  dispatchScoring,
  getScoringAdapter,
  listScoringAdapters,
} from './scoringDispatch';
export {
  scoreAssessmentRun,
  type RuntimeScoreInput,
  type RuntimeScoreOutcome,
  type RuntimeScoreSuccess,
  type RuntimeScoreFailure,
} from './runtimeScore';
export {
  gutCheckScoringAdapter,
  resolveGutCheckAdapterId,
  resolveGutCheckScoringTemplateId,
} from './gutCheckAdapter';
export {
  baselineReadinessScoringAdapter,
  mapBaselineReadinessTotalToLevel,
  computeBaselineReadinessMaxTotal,
} from './baselineReadinessAdapter';
export type {
  AssessmentScoringAdapter,
  AssessmentScoringInput,
  AssessmentScoringOutput,
  ScoringAdapterId,
  ScoringDispatchError,
  ScoringDispatchErrorKind,
  ScoringDispatchResult,
  ScoringTemplateId,
} from './types';
