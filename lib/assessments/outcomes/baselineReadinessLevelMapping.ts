/**
 * Baseline Readiness Level Outcome Mapping (Packet Q — internal proof)
 *
 * Maps the provisional total-score adapter output to readiness-low /
 * readiness-building / readiness-ready outcomes. Resolves label + summary from
 * the Baseline Readiness operations contract.
 *
 * Fail-closed: throws when scoringOutput.primaryAvatar is missing/empty or
 * not one of the declared readiness levels (caller contract violation).
 */

import { getOperationsContract } from '@/lib/assessments/operationsContract';
import { BASELINE_READINESS_RESULT_LEVELS } from '@/lib/assessments/baselineReadiness/constants';
import type { OutcomeMapper, OutcomeMappingInput, LevelOutcome } from './types';

export function mapBaselineReadinessLevelOutcome(
  input: OutcomeMappingInput
): LevelOutcome {
  const levelId = input.scoringOutput.primaryAvatar;

  if (!levelId || typeof levelId !== 'string' || levelId.length === 0) {
    throw new Error(
      '[mapBaselineReadinessLevelOutcome] Baseline Readiness scoring output is ' +
        'missing a level id (scoringOutput.primaryAvatar is empty).'
    );
  }

  if (
    !BASELINE_READINESS_RESULT_LEVELS.includes(
      levelId as (typeof BASELINE_READINESS_RESULT_LEVELS)[number]
    )
  ) {
    throw new Error(
      `[mapBaselineReadinessLevelOutcome] "${levelId}" is not a valid Baseline ` +
        'Readiness level. Expected readiness-low, readiness-building, or ' +
        'readiness-ready.'
    );
  }

  const contract = getOperationsContract(input.assessmentType);
  const descriptor = contract?.resultLevels.find((l) => l.id === levelId);

  return {
    shape: 'level',
    levelId,
    label: descriptor?.label,
    summary: descriptor?.summary,
  };
}

export const baselineReadinessLevelOutcomeMapper: OutcomeMapper = {
  id: 'baseline-readiness-level-mapping',
  assessmentType: 'baseline-readiness',
  shape: 'level',
  description:
    'Maps Baseline Readiness provisional scoring output to readiness-low / ' +
    'readiness-building / readiness-ready, resolving labels from the operations contract.',
  map: mapBaselineReadinessLevelOutcome,
};
