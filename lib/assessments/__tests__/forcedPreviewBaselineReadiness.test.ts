/**
 * Tests for Baseline Readiness forced-result preview helper (Packet Q).
 */

import {
  buildForcedBaselineReadinessPreviewResult,
  FORCED_BASELINE_READINESS_LEVELS,
} from '../results/forcedPreviewBaselineReadiness';

describe('FORCED_BASELINE_READINESS_LEVELS', () => {
  it('is exactly the three readiness levels', () => {
    expect(FORCED_BASELINE_READINESS_LEVELS).toEqual([
      'readiness-low',
      'readiness-building',
      'readiness-ready',
    ]);
  });
});

describe('buildForcedBaselineReadinessPreviewResult', () => {
  it.each(FORCED_BASELINE_READINESS_LEVELS)('accepts %s', (levelId) => {
    const outcome = buildForcedBaselineReadinessPreviewResult(levelId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.primaryAvatar).toBe(levelId);
    expect(outcome.result.assessmentType).toBe('baseline-readiness');
    expect(outcome.result.submissionId).toBeNull();
    expect(outcome.result.sessionId).toBeNull();
  });

  it('rejects Gut Check level ids', () => {
    expect(buildForcedBaselineReadinessPreviewResult('level1').ok).toBe(false);
  });

  it('rejects empty input', () => {
    const outcome = buildForcedBaselineReadinessPreviewResult('');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('invalid-input');
  });
});
