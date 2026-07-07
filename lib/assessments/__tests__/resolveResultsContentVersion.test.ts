/**
 * Packet X1 — assessment-aware results content version resolution.
 */

import { GUT_CHECK_RESULTS_CONTENT_VERSION } from '../results/constants';
import { BASELINE_READINESS_RESULTS_CONTENT_VERSION } from '../baselineReadiness/constants';
import {
  resolveResultsContentVersion,
  isOutputArtifactEnabled,
  getOutputArtifact,
} from '../operationsContract';

describe('resolveResultsContentVersion', () => {
  it('returns v2 for gut-check', () => {
    expect(resolveResultsContentVersion('gut-check')).toBe('v2');
    expect(resolveResultsContentVersion('gut-check')).toBe(
      GUT_CHECK_RESULTS_CONTENT_VERSION
    );
  });

  it('returns v1-internal for baseline-readiness', () => {
    expect(resolveResultsContentVersion('baseline-readiness')).toBe('v1-internal');
    expect(resolveResultsContentVersion('baseline-readiness')).toBe(
      BASELINE_READINESS_RESULTS_CONTENT_VERSION
    );
  });

  it('falls back to Gut Check v2 for unknown or empty assessment types', () => {
    expect(resolveResultsContentVersion('future-assessment')).toBe('v2');
    expect(resolveResultsContentVersion(null)).toBe('v2');
    expect(resolveResultsContentVersion('')).toBe('v2');
    expect(resolveResultsContentVersion(undefined)).toBe('v2');
  });
});

describe('isOutputArtifactEnabled', () => {
  it('enables Gut Check downstream artifacts declared implemented or external', () => {
    expect(isOutputArtifactEnabled('gut-check', 'email')).toBe(true);
    expect(isOutputArtifactEnabled('gut-check', 'pdf')).toBe(true);
    expect(isOutputArtifactEnabled('gut-check', 'claim')).toBe(true);
    expect(isOutputArtifactEnabled('gut-check', 'account-save')).toBe(true);
    expect(isOutputArtifactEnabled('gut-check', 'share')).toBe(false);
  });

  it('disables Baseline Readiness downstream artifacts not yet implemented', () => {
    expect(isOutputArtifactEnabled('baseline-readiness', 'email')).toBe(false);
    expect(isOutputArtifactEnabled('baseline-readiness', 'pdf')).toBe(false);
    expect(isOutputArtifactEnabled('baseline-readiness', 'claim')).toBe(false);
    expect(isOutputArtifactEnabled('baseline-readiness', 'account-save')).toBe(
      false
    );
  });

  it('returns false for unknown assessment types', () => {
    expect(getOutputArtifact('unknown', 'email')).toBeUndefined();
    expect(isOutputArtifactEnabled('unknown', 'email')).toBe(false);
  });
});
