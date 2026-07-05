/**
 * Gut Check Level Outcome Mapping (Packet N)
 *
 * The explicit, live outcome mapping for Gut Check. Gut Check's scoring output
 * is a level id (`level1`–`level4`) carried on `scoringOutput.primaryAvatar`.
 * This mapper represents that mapping explicitly and resolves the level's
 * display label + summary from the Gut Check operations contract's
 * `resultLevels` descriptor — the single source of truth for level copy
 * pointers.
 *
 * This is the ONLY registered outcome mapper today. A future assessment must
 * register its own mapper; it must never inherit this one. Gut Check's
 * level1–level4 results copy resolver is NOT reused here — this mapper only
 * carries the level id + the contract's descriptor metadata (label/summary).
 * Results *copy* continues to be resolved from the CMS results pack by the
 * existing ResultsScreen pipeline, unchanged.
 */

import { getOperationsContract } from '@/lib/assessments/operationsContract';
import type { OutcomeMapper, OutcomeMappingInput, LevelOutcome } from './types';

/**
 * Map a Gut Check scoring output to its level outcome. Pure: reads the level
 * id from `scoringOutput.primaryAvatar` and the label/summary from the
 * operations contract. Returns the level id even when the contract descriptor
 * is missing (defensive — the contract is the source of truth, but the level
 * id is the canonical persisted field).
 */
export function mapGutCheckLevelOutcome(
  input: OutcomeMappingInput
): LevelOutcome {
  const levelId = input.scoringOutput.primaryAvatar;

  const contract = getOperationsContract(input.assessmentType);
  const descriptor = contract?.resultLevels.find((l) => l.id === levelId);

  return {
    shape: 'level',
    levelId,
    label: descriptor?.label,
    summary: descriptor?.summary,
  };
}

export const gutCheckLevelOutcomeMapper: OutcomeMapper = {
  id: 'gut-check-level-mapping',
  assessmentType: 'gut-check',
  shape: 'level',
  description:
    'Maps a Gut Check scoring output to its level1–level4 outcome, ' +
    'resolving the level label + summary from the Gut Check operations ' +
    'contract. The only live outcome mapper today.',
  map: mapGutCheckLevelOutcome,
};
