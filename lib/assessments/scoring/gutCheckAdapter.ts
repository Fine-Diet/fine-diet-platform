/**
 * Gut Check Scoring Adapter (Packet M)
 *
 * Wraps the existing Gut Check scoring engine (`calculateScoring` in
 * `lib/assessmentScoring.ts`) behind the `AssessmentScoringAdapter` contract
 * so the dispatch layer can route to it by `assessmentType: 'gut-check'`.
 *
 * IMPORTANT — behavior preservation:
 *   - This adapter does NOT rewrite Gut Check scoring. It delegates to
 *     `calculateScoring`, which still routes by `assessmentVersion`
 *     (2 → v2 axis, 3 → v3 axis, else → v1 weighted). That internal
 *     version-keyed routing is legacy and is preserved here unchanged.
 *   - The output is a strict superset of the legacy `ScoringResult` shape, so
 *     the current ResultsScreen, submission payload, artifact payload, and
 *     preview flow can consume it without reshaping.
 *   - The reported `adapterId` reflects the engine actually used (v3 / v2 /
 *     v1), matching the `ScoringAdapterId` vocabulary in the operations
 *     contract. The `scoringTemplateId` is 'axis-scores-to-profile' for v2/v3
 *     (axis → level decision tree) and 'weighted-avatar-normalization' for v1
 *     (legacy weighted-avatar normalization, not represented in the factory
 *     metadata because v1 is not part of the factory model).
 *
 * This adapter is registered for `assessmentType: 'gut-check'` only. Any other
 * assessment type is rejected by the dispatch layer before reaching it.
 */

import { calculateScoring } from '@/lib/assessmentScoring';
import type { AssessmentScoringAdapter } from './types';

// ---------------------------------------------------------------------------
// Gut Check adapter id + template id resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the honest adapter id for a Gut Check run from the assessment
 * version. Mirrors `calculateScoring`'s internal version routing so the
 * reported id always reflects the engine that actually scored the run.
 */
export function resolveGutCheckAdapterId(
  assessmentVersion: number
): 'gut-check-axis-v3' | 'gut-check-axis-v2' | 'gut-check-weighted-v1' {
  if (assessmentVersion === 3) return 'gut-check-axis-v3';
  if (assessmentVersion === 2) return 'gut-check-axis-v2';
  return 'gut-check-weighted-v1';
}

/**
 * Resolve the scoring template id for a Gut Check run. v2/v3 use the axis →
 * profile decision tree ('axis-scores-to-profile', declared in the factory
 * metadata). v1 is legacy weighted-avatar normalization and is not part of
 * the factory model; it is reported with a stable, honest template id that
 * the dispatch layer accepts but the factory does not claim as `available`.
 */
export function resolveGutCheckScoringTemplateId(
  assessmentVersion: number
): string {
  if (assessmentVersion >= 2) return 'axis-scores-to-profile';
  return 'weighted-avatar-normalization';
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const gutCheckScoringAdapter: AssessmentScoringAdapter = {
  id: 'gut-check-axis-v3',
  assessmentType: 'gut-check',
  scoringTemplateId: 'axis-scores-to-profile',
  description:
    'Gut Check axis-based scoring engine (delegates to calculateScoring). ' +
    'v3/v2 use the 5-axis → level1–level4 decision tree; v1 uses legacy ' +
    'weighted-avatar normalization. Reported adapter id reflects the engine ' +
    'actually used for the run.',
  async score({ assessmentType, assessmentVersion, answers, config }) {
    // Defensive guard: never score a non-Gut-Check run, even if somehow
    // registered. The dispatch layer rejects unknown types before reaching
    // here, but this keeps the adapter honest in isolation too.
    if (assessmentType !== 'gut-check') {
      throw new Error(
        `[gutCheckScoringAdapter] Refusing to score non-Gut-Check assessment ` +
          `type "${assessmentType}". This adapter serves gut-check only.`
      );
    }

    // Delegate to the existing engine. This preserves Gut Check scoring
    // behavior exactly — no rewrite, no remapping of the math.
    const result = await calculateScoring(answers, config);

    const adapterId = resolveGutCheckAdapterId(assessmentVersion);
    const scoringTemplateId = resolveGutCheckScoringTemplateId(assessmentVersion);

    return {
      assessmentType,
      assessmentVersion,
      adapterId,
      scoringTemplateId,
      // Compatibility fields — straight passthrough from the legacy result.
      primaryAvatar: result.primaryAvatar,
      secondaryAvatar: result.secondaryAvatar,
      scoreMap: result.scoreMap,
      normalizedScoreMap: result.normalizedScoreMap,
      confidenceScore: result.confidenceScore,
      secondaryModifier: result.secondaryModifier,
      confidenceLabel: result.confidenceLabel,
      // Additive fields (ignored by current consumers).
      levelId: result.primaryAvatar,
    };
  },
};
