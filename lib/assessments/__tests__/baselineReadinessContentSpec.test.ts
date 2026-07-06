/**
 * Baseline Readiness content spec validation (Packet R)
 *
 * Lightweight static checks that CMS-ready specs align with the internal
 * fixture, operations contract, and outcome mapper. Does not write to CMS.
 */

import questionSetSpec from '@/content/assessments/baseline-readiness/questions_v1.json';
import resultsSpec from '@/content/assessments/baseline-readiness/results_v1-internal.json';
import { getBaselineReadinessInternalFixtureConfig } from '../internal/baselineReadinessFixture';
import {
  BASELINE_READINESS_RESULT_LEVELS,
  BASELINE_READINESS_RESULTS_CONTENT_VERSION,
} from '../baselineReadiness/constants';
import { getOperationsContract } from '../operationsContract';
import {
  getAssessmentEntry,
  isSupportedAssessmentSlug,
  listActiveAssessments,
} from '../assessmentRegistry';
import { getScoringAdapter } from '../scoring';
import { validateResultsPack } from '@/lib/resultsPack/validateResultsPack';
import { validateQuestionSet } from '@/lib/questionSet/validateQuestionSetShared';

function collectFixtureIds() {
  const config = getBaselineReadinessInternalFixtureConfig();
  const questionIds = config.questions.map((q) => q.id);
  const optionIds = config.questions.flatMap((q) => q.options.map((o) => o.id));
  const optionValues = config.questions.flatMap((q) =>
    q.options.map((o) => o.value).sort((a, b) => a - b)
  );
  return { questionIds, optionIds, config };
}

describe('Baseline Readiness question-set spec vs internal fixture', () => {
  const fixture = collectFixtureIds();
  const specQuestions = questionSetSpec.questions;
  const specQuestionIds = specQuestions.map((q) => q.id);
  const specOptionIds = specQuestions.flatMap((q) => q.options.map((o) => o.id));

  it('covers all internal fixture question IDs', () => {
    expect(specQuestionIds.sort()).toEqual(fixture.questionIds.sort());
  });

  it('covers all internal fixture option IDs', () => {
    expect(specOptionIds.sort()).toEqual(fixture.optionIds.sort());
  });

  it('preserves 0–3 option values on every question', () => {
    for (const q of specQuestions) {
      const values = q.options.map((o) => o.value).sort((a, b) => a - b);
      expect(values).toEqual([0, 1, 2, 3]);
    }
  });

  it('declares baseline-readiness assessment type and v2 schema', () => {
    expect(questionSetSpec.assessmentType).toBe('baseline-readiness');
    expect(questionSetSpec.version).toBe('2');
  });

  it('declares readiness avatars (not Gut Check levels)', () => {
    expect(questionSetSpec.avatars).toEqual([...BASELINE_READINESS_RESULT_LEVELS]);
    expect(questionSetSpec.avatars).not.toContain('level1');
  });

  it('sections reference every question exactly once', () => {
    const fromSections = questionSetSpec.sections.flatMap((s) => s.questionIds);
    expect(fromSections.sort()).toEqual(specQuestionIds.sort());
    expect(new Set(fromSections).size).toBe(specQuestionIds.length);
  });

  it('passes CMS question-set validation (Packet S)', () => {
    const result = validateQuestionSet(questionSetSpec);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('Baseline Readiness result-pack drafts', () => {
  const contract = getOperationsContract('baseline-readiness')!;
  const contractLevelIds = contract.resultLevels.map((l) => l.id);

  it('defines a draft pack for every outcome level', () => {
    for (const levelId of BASELINE_READINESS_RESULT_LEVELS) {
      expect(resultsSpec.packs).toHaveProperty(levelId);
    }
  });

  it('result-pack level IDs match operations contract and outcome mapper', () => {
    const packLevelIds = Object.keys(resultsSpec.packs).sort();
    expect(packLevelIds).toEqual([...BASELINE_READINESS_RESULT_LEVELS].sort());
    expect(packLevelIds).toEqual(contractLevelIds.sort());
  });

  it('uses v1-internal results content version', () => {
    expect(resultsSpec.version).toBe(BASELINE_READINESS_RESULTS_CONTENT_VERSION);
    expect(contract.resultsContentVersion).toBe(BASELINE_READINESS_RESULTS_CONTENT_VERSION);
  });

  it.each(BASELINE_READINESS_RESULT_LEVELS as unknown as string[])(
    '%s pack passes Flow v2 validateResultsPack',
    (levelId) => {
      const pack = resultsSpec.packs[levelId as keyof typeof resultsSpec.packs];
      const result = validateResultsPack(pack);
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    }
  );
});

describe('Baseline Readiness remains draft; Gut Check unchanged', () => {
  it('registry status is draft — not publicly active', () => {
    const entry = getAssessmentEntry('baseline-readiness');
    expect(entry?.status).toBe('draft');
    expect(isSupportedAssessmentSlug('baseline-readiness')).toBe(false);
  });

  it('only Gut Check is active in registry', () => {
    const active = listActiveAssessments();
    expect(active).toHaveLength(1);
    expect(active[0].slug).toBe('gut-check');
  });

  it('Gut Check scoring adapter unchanged', () => {
    expect(getScoringAdapter('gut-check')?.id).toBe('gut-check-axis-v3');
  });
});
