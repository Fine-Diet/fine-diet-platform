/**
 * Programs Marketing API — read-only adapter behavior.
 *
 * Supabase is mocked to be unavailable so we exercise the JSON-fallback path and
 * confirm graceful read-only behavior (no throws, null/empty for missing data,
 * slug sanitization). No seed files exist yet (Stage B), so missing-data reads
 * must resolve to null/[] rather than error.
 */

jest.mock('../../supabaseServerClient', () => ({
  supabaseAdmin: {
    from: () => {
      throw new Error('supabase disabled in test');
    },
  },
}));

import {
  buildProgramMarketingSlug,
  parseProgramMarketingSlug,
  productKey,
  compositionKey,
  getProgramsMarketingProductRecord,
  getProgramsMarketingComposition,
  listProgramsMarketingProducts,
} from '../programsMarketingApi';

describe('programs marketing slug + key helpers', () => {
  it('builds collection and program marketing slugs', () => {
    expect(buildProgramMarketingSlug('nutrition')).toBe('nutrition');
    expect(buildProgramMarketingSlug('nutrition', 'baseline')).toBe(
      'nutrition--baseline',
    );
    expect(buildProgramMarketingSlug('nutrition', null)).toBe('nutrition');
  });

  it('parses marketing slugs back into collection + program', () => {
    expect(parseProgramMarketingSlug('nutrition')).toEqual({
      collectionSlug: 'nutrition',
      programSlug: null,
    });
    expect(parseProgramMarketingSlug('nutrition--baseline')).toEqual({
      collectionSlug: 'nutrition',
      programSlug: 'baseline',
    });
  });

  it('namespaces site_content keys under programs', () => {
    expect(productKey('nutrition')).toBe('product:programs:nutrition');
    expect(compositionKey('nutrition--baseline')).toBe(
      'composition:programs:nutrition--baseline',
    );
  });
});

describe('programs marketing read-only fallback', () => {
  it('returns null for an invalid slug without hitting any source', async () => {
    await expect(
      getProgramsMarketingProductRecord('bad slug!'),
    ).resolves.toBeNull();
    await expect(
      getProgramsMarketingComposition('../etc/passwd'),
    ).resolves.toBeNull();
  });

  it('returns null when no record/composition exists (Supabase down, no JSON seed)', async () => {
    await expect(
      getProgramsMarketingProductRecord('definitely-not-a-real-collection'),
    ).resolves.toBeNull();
    await expect(
      getProgramsMarketingComposition('definitely-not-a-real-collection'),
    ).resolves.toBeNull();
  });

  it('lists products as an array without throwing when sources are empty/unavailable', async () => {
    const all = await listProgramsMarketingProducts();
    expect(Array.isArray(all)).toBe(true);
    for (const product of all) {
      expect(product.category).toBe('programs');
    }
  });
});
