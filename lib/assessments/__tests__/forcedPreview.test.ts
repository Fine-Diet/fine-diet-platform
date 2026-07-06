/**
 * Tests for the Gut Check forced-result preview helper (Packet P).
 *
 * Covers:
 *   - Each valid level (level1–level4) produces a deterministic
 *     `ForcedGutCheckPreviewResult` with the right `primaryAvatar`.
 *   - Invalid level ids fail closed (`{ ok: false, error }`), with the right
 *     error kind, and are never normalized into a live level.
 *   - Empty / non-string input fails closed with `invalid-input`.
 *   - The helper is pure: it performs no I/O and creates no submission
 *     payload / write calls (asserted structurally — `submissionId` and
 *     `sessionId` are always null, `isForcedPreview` is always true).
 *   - The helper is Gut Check-only: every success result carries
 *     `assessmentType: 'gut-check'`; it never produces a second assessment.
 *   - The allowed level set is exactly level1–level4.
 */

import {
  buildForcedGutCheckPreviewResult,
  FORCED_GUT_CHECK_LEVELS,
} from '../results/forcedPreview';

describe('FORCED_GUT_CHECK_LEVELS', () => {
  it('is exactly level1–level4', () => {
    expect(FORCED_GUT_CHECK_LEVELS).toEqual([
      'level1',
      'level2',
      'level3',
      'level4',
    ]);
  });
});

describe('buildForcedGutCheckPreviewResult: valid levels', () => {
  it.each(FORCED_GUT_CHECK_LEVELS)(
    'produces a deterministic forced result for %s',
    (levelId) => {
      const outcome = buildForcedGutCheckPreviewResult(levelId);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const { result } = outcome;
      expect(result.primaryAvatar).toBe(levelId);
      expect(result.assessmentType).toBe('gut-check');
      expect(result.assessmentVersion).toBe(3);
      expect(result.resultsContentVersion).toBe('v2');
      expect(result.isForcedPreview).toBe(true);
      // Stub scores are deterministic and reflect the forced level only.
      expect(result.scoreMap).toEqual({ [levelId]: 1 });
      expect(result.normalizedScoreMap).toEqual({ [levelId]: 1 });
      expect(result.confidenceScore).toBe(1);
    }
  );

  it('is deterministic: the same level yields deeply-equal results', () => {
    const a = buildForcedGutCheckPreviewResult('level2');
    const b = buildForcedGutCheckPreviewResult('level2');
    expect(a).toEqual(b);
  });

  it('different levels yield different primaryAvatars', () => {
    const levels = FORCED_GUT_CHECK_LEVELS.map(
      (l) => buildForcedGutCheckPreviewResult(l)
    );
    const avatars = levels.map((o) => (o.ok ? o.result.primaryAvatar : 'ERR'));
    expect(new Set(avatars).size).toBe(4);
  });
});

describe('buildForcedGutCheckPreviewResult: fail-closed', () => {
  it('rejects an unknown level id with invalid-level', () => {
    const outcome = buildForcedGutCheckPreviewResult('level99');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('invalid-level');
    expect(outcome.error.requestedLevel).toBe('level99');
    expect(outcome.error.message).toContain('level99');
  });

  it('rejects a non-level string with invalid-level', () => {
    const outcome = buildForcedGutCheckPreviewResult('baseline-readiness');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('invalid-level');
    expect(outcome.error.requestedLevel).toBe('baseline-readiness');
  });

  it('rejects empty input with invalid-input', () => {
    const outcome = buildForcedGutCheckPreviewResult('');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('invalid-input');
    expect(outcome.error.requestedLevel).toBe('');
  });

  it('rejects non-string input defensively', () => {
    // @ts-expect-error exercising a defensive guard against bad input
    const outcome = buildForcedGutCheckPreviewResult(undefined);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('invalid-input');
  });

  it('never normalizes an invalid value into a live level', () => {
    // No matter the invalid input, a success result is never produced.
    const invalids = ['level0', 'level5', 'LEVEL1', 'level1 ', ' gut-check'];
    for (const v of invalids) {
      expect(buildForcedGutCheckPreviewResult(v).ok).toBe(false);
    }
  });
});

describe('buildForcedGutCheckPreviewResult: no writes / Gut Check-only', () => {
  it('every success result has null submissionId / sessionId (no write target)', () => {
    for (const lvl of FORCED_GUT_CHECK_LEVELS) {
      const outcome = buildForcedGutCheckPreviewResult(lvl);
      if (!outcome.ok) throw new Error(`${lvl} should be valid`);
      expect(outcome.result.submissionId).toBeNull();
      expect(outcome.result.sessionId).toBeNull();
    }
  });

  it('is Gut Check-only: success results never carry a second assessment type', () => {
    for (const lvl of FORCED_GUT_CHECK_LEVELS) {
      const outcome = buildForcedGutCheckPreviewResult(lvl);
      if (!outcome.ok) throw new Error(`${lvl} should be valid`);
      expect(outcome.result.assessmentType).toBe('gut-check');
    }
  });

  it('the helper is a pure function (no fetch / network on the module)', () => {
    // Structural assertion: the forced-preview module must not export or
    // call any network primitive. We assert the public surface is only the
    // helper + types + the level list.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../results/forcedPreview');
    expect(typeof mod.buildForcedGutCheckPreviewResult).toBe('function');
    expect(Array.isArray(mod.FORCED_GUT_CHECK_LEVELS)).toBe(true);
    // No accidental network exports.
    expect(mod.fetch).toBeUndefined();
    expect(mod.submitAssessment).toBeUndefined();
    expect(mod.dispatchScoring).toBeUndefined();
    expect(mod.calculateScoring).toBeUndefined();
    expect(mod.mapAssessmentOutcome).toBeUndefined();
  });
});
