/**
 * Tests for the file-system results-pack fallback loader.
 *
 * The loader is the Gut Check-specific results file fallback. Future
 * assessments are CMS-only. These tests pin:
 *   1. Gut Check v2/v3 load from the bundled JSON (v3 redirects to v2 content).
 *   2. Any other assessment type returns null — never a Gut Check pack.
 * This is the defense-in-depth check that an unsupported assessment type
 * cannot leak Gut Check results content through the file fallback.
 *
 * `levelId` is passed already-normalized so the avatar-mapping CMS lookup is
 * not exercised here (it has its own coverage in the config layer).
 */

import { loadResultsPack } from '../loadResultsPack';

// Mock the CMS avatar-mapping lookup so normalizeLevelId is deterministic and
// does not depend on Supabase/env. With the mapping rejecting, a non-level
// levelId falls through to the thrown error and loadResultsPack returns null.
jest.mock('@/lib/config/getConfig', () => ({
  getAvatarMapping: jest.fn().mockRejectedValue(new Error('mock: no config')),
}));

describe('loadResultsPack', () => {
  it('loads a gut-check v2 pack for a valid level id', async () => {
    const pack = await loadResultsPack({
      assessmentType: 'gut-check',
      resultsVersion: '2',
      levelId: 'level1',
    });
    expect(pack).not.toBeNull();
    expect(pack?.label).toBeTruthy();
    expect(pack?.keyPatterns).toBeInstanceOf(Array);
  });

  it('returns packs for every gut-check level1-level4', async () => {
    for (const level of ['level1', 'level2', 'level3', 'level4']) {
      const pack = await loadResultsPack({
        assessmentType: 'gut-check',
        resultsVersion: '2',
        levelId: level,
      });
      expect(pack).not.toBeNull();
    }
  });

  it('redirects a gut-check v3 request to the v2 file content (scoring-only change)', async () => {
    const v3 = await loadResultsPack({
      assessmentType: 'gut-check',
      resultsVersion: '3',
      levelId: 'level1',
    });
    const v2 = await loadResultsPack({
      assessmentType: 'gut-check',
      resultsVersion: '2',
      levelId: 'level1',
    });
    expect(v3).not.toBeNull();
    expect(v3?.label).toBe(v2?.label);
  });

  it('returns null for an unsupported assessment type (no Gut Check leak)', async () => {
    const pack = await loadResultsPack({
      assessmentType: 'some-future',
      resultsVersion: '2',
      levelId: 'level1',
    });
    expect(pack).toBeNull();
  });

  it('returns null for an invalid level id', async () => {
    const pack = await loadResultsPack({
      assessmentType: 'gut-check',
      resultsVersion: '2',
      levelId: 'not-a-level',
    });
    expect(pack).toBeNull();
  });
});
