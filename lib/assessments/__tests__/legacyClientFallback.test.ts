/**
 * Tests for the legacy client-side runner config fallback.
 *
 * Pins the contract: only Gut Check v1 gets the bundled placeholder config;
 * every other assessment type / version returns null (runner stays on
 * LoadingState, matching prior behavior for unknown types).
 */

import { getLegacyClientFallbackConfig } from '../legacyClientFallback';

describe('getLegacyClientFallbackConfig', () => {
  it('returns the bundled gut-check v1 config for gut-check v1', () => {
    const config = getLegacyClientFallbackConfig('gut-check', 1);
    expect(config).not.toBeNull();
    expect(config?.assessmentType).toBe('gut-check');
    expect(config?.assessmentVersion).toBe(1);
  });

  it('returns null for gut-check v2 (no legacy fallback)', () => {
    expect(getLegacyClientFallbackConfig('gut-check', 2)).toBeNull();
    expect(getLegacyClientFallbackConfig('gut-check', 3)).toBeNull();
  });

  it('returns null for any other assessment type (no Gut Check leak)', () => {
    expect(getLegacyClientFallbackConfig('some-future', 1)).toBeNull();
    expect(getLegacyClientFallbackConfig('some-future', 2)).toBeNull();
  });
});
