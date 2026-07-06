/**
 * Tests for the outcome mapping foundation (Packet N).
 *
 * Covers:
 *   - the Gut Check level mapper is the only registered mapper today.
 *   - Gut Check scoring output maps to its level1–level4 outcome, with the
 *     label + summary resolved from the operations contract.
 *   - unknown / unregistered `assessmentType` fails closed
 *     (`unknown-assessment-type`), with no Gut Check level fallback.
 *   - a non-Gut-Check type with assessmentVersion 2 never inherits Gut Check
 *     level mapping.
 *   - invalid input is rejected.
 *   - the modeled-but-not-live outcome shapes (persona, flag,
 *     recommendation-set) exist in the type system and in
 *     `MODELED_OUTCOME_SHAPES_NOT_LIVE`, but have no registered mapper.
 */

import {
  mapAssessmentOutcome,
  getOutcomeMapper,
  listOutcomeMappers,
  MODELED_OUTCOME_SHAPES_NOT_LIVE,
  gutCheckLevelOutcomeMapper,
  mapGutCheckLevelOutcome,
} from '../outcomes';
import type { AssessmentScoringOutput } from '../scoring/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gutCheckOutput(levelId: string): AssessmentScoringOutput {
  return {
    assessmentType: 'gut-check',
    assessmentVersion: 3,
    adapterId: 'gut-check-axis-v3',
    scoringTemplateId: 'axis-scores-to-profile',
    primaryAvatar: levelId,
    scoreMap: { [levelId]: 1 },
    normalizedScoreMap: { [levelId]: 1 },
    confidenceScore: 1,
    secondaryModifier: undefined,
    confidenceLabel: 'high',
    levelId,
  };
}

// ---------------------------------------------------------------------------
// Registry / lookups
// ---------------------------------------------------------------------------

describe('outcome mapping registry', () => {
  it('registers Gut Check and Baseline Readiness mappers', () => {
    const mappers = listOutcomeMappers();
    expect(mappers).toHaveLength(2);
    expect(mappers.map((m) => m.assessmentType)).toEqual([
      'gut-check',
      'baseline-readiness',
    ]);
  });

  it('resolves the Gut Check mapper by assessmentType', () => {
    const mapper = getOutcomeMapper('gut-check');
    expect(mapper).toBeDefined();
    expect(mapper?.id).toBe('gut-check-level-mapping');
    expect(mapper?.shape).toBe('level');
  });

  it('resolves the Baseline Readiness mapper by assessmentType', () => {
    const mapper = getOutcomeMapper('baseline-readiness');
    expect(mapper).toBeDefined();
    expect(mapper?.id).toBe('baseline-readiness-level-mapping');
    expect(mapper?.shape).toBe('level');
  });

  it('returns undefined for an unregistered assessment type', () => {
    expect(getOutcomeMapper('protein-sufficiency')).toBeUndefined();
    expect(getOutcomeMapper('')).toBeUndefined();
    expect(getOutcomeMapper(undefined)).toBeUndefined();
    expect(getOutcomeMapper(null)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gut Check level mapping
// ---------------------------------------------------------------------------

describe('mapAssessmentOutcome: Gut Check level mapping', () => {
  it.each(['level1', 'level2', 'level3', 'level4'] as const)(
    'maps %s to a level outcome with contract label + summary',
    (levelId) => {
      const result = mapAssessmentOutcome({
        assessmentType: 'gut-check',
        assessmentVersion: 3,
        scoringOutput: gutCheckOutput(levelId),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.shape).toBe('level');
      if (result.result.shape !== 'level') return;
      expect(result.result.levelId).toBe(levelId);
      expect(typeof result.result.label).toBe('string');
      expect(result.result.label!.length).toBeGreaterThan(0);
      expect(typeof result.result.summary).toBe('string');
    }
  );

  it('echoes the level id even when the contract descriptor is missing (defensive)', () => {
    // Direct call with a level id that is not in the contract — mapper must
    // still return the canonical level id, just without label/summary.
    const result = mapGutCheckLevelOutcome({
      assessmentType: 'gut-check',
      assessmentVersion: 3,
      scoringOutput: gutCheckOutput('level99'),
    });
    expect(result.shape).toBe('level');
    expect(result.levelId).toBe('level99');
    expect(result.label).toBeUndefined();
    expect(result.summary).toBeUndefined();
  });

  it('fails closed (throws) when the level signal is missing/empty', () => {
    // A Gut Check scoring output MUST carry a non-empty primaryAvatar. An
    // empty value is a caller contract violation (the runtime blocks
    // submission on scoring failure, so the mapper is never reached with an
    // empty level in the live path). Per the outcome-mapping contract, this
    // is a programming bug — it throws instead of returning an empty outcome.
    expect(() =>
      mapGutCheckLevelOutcome({
        assessmentType: 'gut-check',
        assessmentVersion: 3,
        scoringOutput: { ...gutCheckOutput('level1'), primaryAvatar: '' },
      })
    ).toThrow(/level id/i);

    expect(() =>
      mapGutCheckLevelOutcome({
        assessmentType: 'gut-check',
        assessmentVersion: 3,
        // @ts-expect-error exercising a defensive guard against bad input
        scoringOutput: { ...gutCheckOutput('level1'), primaryAvatar: undefined },
      })
    ).toThrow(/level id/i);
  });

  it('the gutCheckLevelOutcomeMapper refuses nothing here — it is scoped by dispatch', () => {
    // The mapper itself does not re-check assessmentType; the dispatcher does.
    // Confirm the mapper object is wired correctly.
    expect(gutCheckLevelOutcomeMapper.assessmentType).toBe('gut-check');
    expect(typeof gutCheckLevelOutcomeMapper.map).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Fail-closed
// ---------------------------------------------------------------------------

describe('mapAssessmentOutcome: fail-closed', () => {
  it('maps baseline-readiness when registered (dual activation proof)', () => {
    const result = mapAssessmentOutcome({
      assessmentType: 'baseline-readiness',
      assessmentVersion: 1,
      scoringOutput: {
        assessmentType: 'baseline-readiness',
        assessmentVersion: 1,
        adapterId: 'baseline-readiness-total-score-v1-provisional',
        scoringTemplateId: 'total-score-to-levels',
        primaryAvatar: 'readiness-building',
        scoreMap: { 'readiness-building': 8 },
        normalizedScoreMap: { 'readiness-building': 0.53 },
        confidenceScore: 1,
        levelId: 'readiness-building',
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.shape).toBe('level');
    if (result.result.shape !== 'level') return;
    expect(result.result.levelId).toBe('readiness-building');
  });

  it('rejects an unknown assessmentType with no Gut Check level fallback', () => {
    const result = mapAssessmentOutcome({
      assessmentType: 'protein-sufficiency',
      assessmentVersion: 1,
      scoringOutput: gutCheckOutput('level1'),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unknown-assessment-type');
    expect(result.error.assessmentType).toBe('protein-sufficiency');
    expect(result.error.message).not.toContain('level1');
  });

  it('a non-Gut-Check type with assessmentVersion 2 never inherits level mapping', () => {
    const result = mapAssessmentOutcome({
      assessmentType: 'protein-sufficiency',
      assessmentVersion: 2,
      scoringOutput: gutCheckOutput('level1'),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unknown-assessment-type');
    expect(result.error.assessmentType).toBe('protein-sufficiency');
  });

  it('rejects invalid input (missing assessmentType / scoringOutput)', () => {
    const missingType = mapAssessmentOutcome({
      assessmentType: '' as never,
      assessmentVersion: 3,
      scoringOutput: gutCheckOutput('level1'),
    });
    expect(missingType.ok).toBe(false);
    if (missingType.ok) return;
    expect(missingType.error.kind).toBe('invalid-input');

    const missingOutput = mapAssessmentOutcome({
      assessmentType: 'gut-check',
      assessmentVersion: 3,
      // @ts-expect-error exercising a defensive guard against bad input
      scoringOutput: undefined,
    });
    expect(missingOutput.ok).toBe(false);
    if (missingOutput.ok) return;
    expect(missingOutput.error.kind).toBe('invalid-input');
  });
});

// ---------------------------------------------------------------------------
// Modeled-but-not-live outcome shapes
// ---------------------------------------------------------------------------

describe('modeled-but-not-live outcome shapes', () => {
  it('lists persona / flag / recommendation-set as modeled, not live', () => {
    const shapes = MODELED_OUTCOME_SHAPES_NOT_LIVE.map((s) => s.shape);
    expect(shapes).toEqual(['persona', 'flag', 'recommendation-set']);
  });

  it('no mapper is registered for persona / flag / recommendation-set', () => {
    expect(getOutcomeMapper('persona-category-assessment')).toBeUndefined();
    expect(getOutcomeMapper('risk-triage-assessment')).toBeUndefined();
    expect(getOutcomeMapper('program-fit-assessment')).toBeUndefined();
  });
});
