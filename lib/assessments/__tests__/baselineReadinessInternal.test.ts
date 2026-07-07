/**
 * Tests for Baseline Readiness internal proof (Packet Q).
 *
 * Covers dual activation gate, provisional scoring adapter, outcome mapper,
 * forced preview helper, registry gating, and Gut Check isolation.
 */

import {
  dispatchScoring,
  getScoringAdapter,
  listScoringAdapters,
  baselineReadinessScoringAdapter,
  mapBaselineReadinessTotalToLevel,
} from '../scoring';
import {
  mapAssessmentOutcome,
  getOutcomeMapper,
  listOutcomeMappers,
  mapBaselineReadinessLevelOutcome,
} from '../outcomes';
import {
  getAssessmentEntry,
  getAssessmentEntryByType,
  isSupportedAssessmentSlug,
  listActiveAssessments,
  ASSESSMENT_REGISTRY,
} from '../assessmentRegistry';
import {
  getOperationsContract,
  hasOperationsContract,
  getAssessmentOperationsProfile,
} from '../operationsContract';
import {
  buildForcedBaselineReadinessPreviewResult,
  FORCED_BASELINE_READINESS_LEVELS,
} from '../results/forcedPreviewBaselineReadiness';
import { getBaselineReadinessInternalFixtureConfig } from '../internal/baselineReadinessFixture';
import type { Answer } from '@/lib/assessmentTypes';
import { dispatchScoring as dispatchScoringDirect } from '../scoring/scoringDispatch';

jest.mock('@/lib/config/getConfig', () => ({
  getAssessmentConfig: jest.fn().mockRejectedValue(new Error('disabled in tests')),
}));

function buildFixtureAnswers(values: number[]): Answer[] {
  const config = getBaselineReadinessInternalFixtureConfig();
  return values.map((v, i) => {
    const q = config.questions[i];
    const option = q.options[v];
    return { questionId: q.id, optionId: option.id };
  });
}

describe('Baseline Readiness registry (active, Packet X2)', () => {
  it('is registered with active status', () => {
    const entry = getAssessmentEntry('baseline-readiness');
    expect(entry).toBeDefined();
    expect(entry?.assessmentType).toBe('baseline-readiness');
    expect(entry?.status).toBe('active');
    expect(entry?.hasFileFallback).toBe(false);
  });

  it('is supported on the public route', () => {
    expect(isSupportedAssessmentSlug('baseline-readiness')).toBe(true);
  });

  it('appears in listActiveAssessments', () => {
    expect(listActiveAssessments().some((e) => e.slug === 'baseline-readiness')).toBe(
      true
    );
  });

  it('is findable by assessmentType for admin/introspection', () => {
    expect(getAssessmentEntryByType('baseline-readiness')?.slug).toBe(
      'baseline-readiness'
    );
  });

  it('registry has two active assessments (Gut Check + Baseline Readiness)', () => {
    const active = listActiveAssessments();
    expect(active).toHaveLength(2);
    expect(active.map((e) => e.slug).sort()).toEqual(['baseline-readiness', 'gut-check']);
  });

  it('validateRegistry passes with baseline-readiness active entry', () => {
    const slugs = ASSESSMENT_REGISTRY.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('Baseline Readiness dual activation gate', () => {
  it('registers scoring adapter + outcome mapper + operations contract', () => {
    expect(getScoringAdapter('baseline-readiness')?.id).toBe(
      'baseline-readiness-total-score-v1-provisional'
    );
    expect(getOutcomeMapper('baseline-readiness')?.id).toBe(
      'baseline-readiness-level-mapping'
    );
    expect(hasOperationsContract('baseline-readiness')).toBe(true);
    expect(getAssessmentOperationsProfile('baseline-readiness')).not.toBeNull();
  });

  it('listScoringAdapters includes gut-check and baseline-readiness', () => {
    const types = listScoringAdapters().map((a) => a.assessmentType);
    expect(types).toContain('gut-check');
    expect(types).toContain('baseline-readiness');
    expect(types).toHaveLength(2);
  });

  it('listOutcomeMappers includes gut-check and baseline-readiness', () => {
    const types = listOutcomeMappers().map((m) => m.assessmentType);
    expect(types).toContain('gut-check');
    expect(types).toContain('baseline-readiness');
    expect(types).toHaveLength(2);
  });
});

describe('mapBaselineReadinessTotalToLevel', () => {
  it('maps ratio thresholds to three readiness levels', () => {
    expect(mapBaselineReadinessTotalToLevel(0, 15)).toBe('readiness-low');
    expect(mapBaselineReadinessTotalToLevel(5, 15)).toBe('readiness-low');
    expect(mapBaselineReadinessTotalToLevel(6, 15)).toBe('readiness-building');
    expect(mapBaselineReadinessTotalToLevel(10, 15)).toBe('readiness-building');
    expect(mapBaselineReadinessTotalToLevel(11, 15)).toBe('readiness-ready');
    expect(mapBaselineReadinessTotalToLevel(15, 15)).toBe('readiness-ready');
  });
});

describe('baselineReadinessScoringAdapter via dispatchScoring', () => {
  const config = getBaselineReadinessInternalFixtureConfig();

  it('scores low answers to readiness-low', async () => {
    const answers = buildFixtureAnswers([0, 0, 0, 0, 0]);
    const result = await dispatchScoring({
      assessmentType: 'baseline-readiness',
      assessmentVersion: 1,
      answers,
      config,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.primaryAvatar).toBe('readiness-low');
    expect(result.output.adapterId).toBe('baseline-readiness-total-score-v1-provisional');
    expect(result.output.scoringTemplateId).toBe('total-score-to-levels');
    expect(result.output.totalScore).toBe(0);
  });

  it('scores high answers to readiness-ready', async () => {
    const answers = buildFixtureAnswers([3, 3, 3, 3, 3]);
    const result = await dispatchScoring({
      assessmentType: 'baseline-readiness',
      assessmentVersion: 1,
      answers,
      config,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.primaryAvatar).toBe('readiness-ready');
    expect(result.output.totalScore).toBe(15);
  });

  it('fail-closed: empty answers → adapter-throw', async () => {
    const result = await dispatchScoring({
      assessmentType: 'baseline-readiness',
      assessmentVersion: 1,
      answers: [],
      config,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('adapter-throw');
  });

  it('fail-closed: partial answers → adapter-throw', async () => {
    const answers = buildFixtureAnswers([0, 0, 0]);
    const result = await dispatchScoring({
      assessmentType: 'baseline-readiness',
      assessmentVersion: 1,
      answers,
      config,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('adapter-throw');
  });

  it('does not route baseline-readiness through Gut Check level ids', async () => {
    const answers = buildFixtureAnswers([3, 3, 3, 3, 3]);
    const dispatched = await dispatchScoring({
      assessmentType: 'baseline-readiness',
      assessmentVersion: 1,
      answers,
      config,
    });
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;
    expect(dispatched.output.primaryAvatar).toBe('readiness-ready');
    expect(['level1', 'level2', 'level3', 'level4']).not.toContain(
      dispatched.output.primaryAvatar
    );
  });

  it('adapter refuses gut-check assessmentType when called directly', async () => {
    const config = getBaselineReadinessInternalFixtureConfig();
    const answers = buildFixtureAnswers([0, 0, 0, 0, 0]);
    await expect(
      baselineReadinessScoringAdapter.score({
        assessmentType: 'gut-check',
        assessmentVersion: 1,
        answers,
        config,
      })
    ).rejects.toThrow(/Refusing to score/);
  });
});

describe('mapAssessmentOutcome: Baseline Readiness', () => {
  it.each(FORCED_BASELINE_READINESS_LEVELS)(
    'maps %s with contract label',
    (levelId) => {
      const result = mapAssessmentOutcome({
        assessmentType: 'baseline-readiness',
        assessmentVersion: 1,
        scoringOutput: {
          assessmentType: 'baseline-readiness',
          assessmentVersion: 1,
          adapterId: 'baseline-readiness-total-score-v1-provisional',
          scoringTemplateId: 'total-score-to-levels',
          primaryAvatar: levelId,
          scoreMap: { [levelId]: 1 },
          normalizedScoreMap: { [levelId]: 1 },
          confidenceScore: 1,
          levelId,
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.shape).toBe('level');
      if (result.result.shape !== 'level') return;
      expect(result.result.levelId).toBe(levelId);
      expect(result.result.label).toBeTruthy();
    }
  );

  it('fail-closed: throws on missing primaryAvatar', () => {
    expect(() =>
      mapBaselineReadinessLevelOutcome({
        assessmentType: 'baseline-readiness',
        assessmentVersion: 1,
        scoringOutput: {
          assessmentType: 'baseline-readiness',
          assessmentVersion: 1,
          adapterId: 'baseline-readiness-total-score-v1-provisional',
          scoringTemplateId: 'total-score-to-levels',
          primaryAvatar: '',
          scoreMap: {},
          normalizedScoreMap: {},
          confidenceScore: 0,
        },
      })
    ).toThrow(/missing a level id/i);
  });

  it('fail-closed: throws on invalid level id', () => {
    expect(() =>
      mapBaselineReadinessLevelOutcome({
        assessmentType: 'baseline-readiness',
        assessmentVersion: 1,
        scoringOutput: {
          assessmentType: 'baseline-readiness',
          assessmentVersion: 1,
          adapterId: 'baseline-readiness-total-score-v1-provisional',
          scoringTemplateId: 'total-score-to-levels',
          primaryAvatar: 'level1',
          scoreMap: {},
          normalizedScoreMap: {},
          confidenceScore: 0,
        },
      })
    ).toThrow(/not a valid Baseline Readiness level/i);
  });
});

describe('buildForcedBaselineReadinessPreviewResult', () => {
  it.each(FORCED_BASELINE_READINESS_LEVELS)('accepts valid level %s', (levelId) => {
    const outcome = buildForcedBaselineReadinessPreviewResult(levelId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.assessmentType).toBe('baseline-readiness');
    expect(outcome.result.primaryAvatar).toBe(levelId);
    expect(outcome.result.submissionId).toBeNull();
    expect(outcome.result.sessionId).toBeNull();
    expect(outcome.result.isForcedPreview).toBe(true);
  });

  it('rejects invalid levels fail-closed', () => {
    expect(buildForcedBaselineReadinessPreviewResult('level1').ok).toBe(false);
    expect(buildForcedBaselineReadinessPreviewResult('').ok).toBe(false);
  });

  it('does not accept Gut Check level ids', () => {
    const outcome = buildForcedBaselineReadinessPreviewResult('level2');
    expect(outcome.ok).toBe(false);
  });
});

describe('operations contract: Baseline Readiness', () => {
  it('declares three readiness result levels', () => {
    const c = getOperationsContract('baseline-readiness')!;
    expect(c.resultLevels.map((l) => l.id)).toEqual([
      'readiness-low',
      'readiness-building',
      'readiness-ready',
    ]);
  });

  it('marks forcedResultPreview true and outputs mostly not-implemented', () => {
    const c = getOperationsContract('baseline-readiness')!;
    expect(c.preview.forcedResultPreview).toBe(true);
    expect(c.outputs.find((o) => o.key === 'email')?.status).toBe('not-implemented');
  });

  it('factory coordinates match planned concept', () => {
    const c = getOperationsContract('baseline-readiness')!;
    expect(c.factoryModel?.problemPointId).toBe('baseline-readiness');
    expect(c.factoryModel?.archetypeId).toBe('readiness-audit');
    expect(c.factoryModel?.scoringTemplateId).toBe('total-score-to-levels');
  });
});

describe('Gut Check unchanged', () => {
  it('unknown types still fail — protein-sufficiency not baseline-readiness regression', async () => {
    const config = getBaselineReadinessInternalFixtureConfig();
    const result = await dispatchScoringDirect({
      assessmentType: 'protein-sufficiency',
      assessmentVersion: 1,
      answers: buildFixtureAnswers([0, 0, 0, 0, 0]),
      config,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unknown-assessment-type');
  });

  it('gut-check adapter id unchanged', () => {
    expect(getScoringAdapter('gut-check')?.id).toBe('gut-check-axis-v3');
  });
});
