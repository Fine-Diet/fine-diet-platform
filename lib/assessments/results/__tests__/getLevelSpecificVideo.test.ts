/**
 * Tests for the Gut Check level-specific video map.
 *
 * Extracted from ResultsScreen.tsx so the deterministic level→route mapping can
 * be unit-tested in isolation. This is the Gut Check-specific adapter the packet
 * asks us to isolate behind a clear function.
 */

describe('getLevelSpecificVideo', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns the gut-pattern-breakdown route for each level id', async () => {
    const { getLevelSpecificVideo } = await import('@/lib/assessments/results/getLevelSpecificVideo');

    expect(getLevelSpecificVideo('level1')).toBe('/gut-pattern-breakdown?level=1');
    expect(getLevelSpecificVideo('level2')).toBe('/gut-pattern-breakdown?level=2');
    expect(getLevelSpecificVideo('level3')).toBe('/gut-pattern-breakdown?level=3');
    expect(getLevelSpecificVideo('level4')).toBe('/gut-pattern-breakdown?level=4');
  });

  it('returns null and warns for an out-of-range or non-level id', async () => {
    const { getLevelSpecificVideo } = await import('@/lib/assessments/results/getLevelSpecificVideo');

    expect(getLevelSpecificVideo('level5')).toBeNull();
    expect(getLevelSpecificVideo('level0')).toBeNull();
    expect(getLevelSpecificVideo('some-avatar-id')).toBeNull();
    expect(getLevelSpecificVideo('')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('does not accept avatar ids that merely contain "level"', async () => {
    const { getLevelSpecificVideo } = await import('@/lib/assessments/results/getLevelSpecificVideo');

    expect(getLevelSpecificVideo('gut-level1-fast')).toBeNull();
    expect(getLevelSpecificVideo('LEVEL1')).toBeNull();
  });
});
