/**
 * Tests for the file-system question-set fallback loader.
 *
 * The loader is the Gut Check-specific file fallback (gated by
 * `hasFileFallback` in the registry). These tests pin two contracts:
 *   1. Gut Check v2 loads from the bundled JSON.
 *   2. Any other assessment type returns null — never a Gut Check question set.
 * This is the defense-in-depth check that an unsupported slug cannot leak Gut
 * Check question content through the file fallback.
 */

import { loadQuestionSet } from '../loadQuestionSet';

describe('loadQuestionSet', () => {
  it('loads the gut-check v2 question set from the bundled JSON', () => {
    const qs = loadQuestionSet({ assessmentType: 'gut-check', assessmentVersion: '2' });
    expect(qs).not.toBeNull();
    expect(qs?.assessmentType).toBe('gut-check');
    expect(qs?.version).toBe('2');
    expect(qs?.questions.length).toBeGreaterThan(0);
  });

  it('accepts the "v2" prefixed version string for gut-check', () => {
    const qs = loadQuestionSet({ assessmentType: 'gut-check', assessmentVersion: 'v2' });
    expect(qs?.version).toBe('2');
  });

  it('returns null for an unsupported assessment type (no Gut Check leak)', () => {
    expect(
      loadQuestionSet({ assessmentType: 'some-future', assessmentVersion: '2' })
    ).toBeNull();
    expect(
      loadQuestionSet({ assessmentType: 'some-future', assessmentVersion: '1' })
    ).toBeNull();
  });

  it('returns null for a gut-check version that has no bundled file', () => {
    expect(
      loadQuestionSet({ assessmentType: 'gut-check', assessmentVersion: '99' })
    ).toBeNull();
  });
});
