/**
 * Programs Marketing API — read-only adapter behavior.
 *
 * Supabase is mocked to be unavailable so we exercise the JSON-fallback path and
 * confirm graceful read-only behavior (no throws, null/empty for missing data,
 * slug sanitization). No seed files exist yet (Stage B), so missing-data reads
 * must resolve to null/[] rather than error.
 */

import { describe, it, expect, jest } from '@jest/globals';

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
  validateComposition,
} from '../programsMarketingApi';
import { MODULE_CONTENT_SCHEMAS } from '../../modules/schema';

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

  it('returns an empty list for both publishedOnly modes when no products are seeded', async () => {
    await expect(listProgramsMarketingProducts(false)).resolves.toEqual([]);
    await expect(listProgramsMarketingProducts(true)).resolves.toEqual([]);
  });
});

describe('programs marketing composition JSON fallback (seeded)', () => {
  it('loads the Nutrition collection composition from the JSON seed', async () => {
    const composition = await getProgramsMarketingComposition('nutrition');

    expect(composition).not.toBeNull();
    expect(composition!.key).toBe('composition:programs:nutrition');
    expect(composition!.modules.length).toBeGreaterThan(0);
    // validateComposition only keeps modules the registry can express.
    for (const mod of composition!.modules) {
      expect(MODULE_CONTENT_SCHEMAS[mod.type]).toBeDefined();
    }
  });

  it('loads the Baseline program composition via the {collection}--{program} slug', async () => {
    const composition = await getProgramsMarketingComposition('nutrition--baseline');

    expect(composition).not.toBeNull();
    expect(composition!.key).toBe('composition:programs:nutrition--baseline');
    expect(composition!.modules.length).toBeGreaterThan(0);
  });

  it('keeps the publish gate closed: a composition seed exists but no product record does', async () => {
    // The Nutrition composition is seeded, but no marketing product record is —
    // so the page falls back to the code catalogue (both keys are required to
    // flip the live render).
    await expect(getProgramsMarketingComposition('nutrition')).resolves.not.toBeNull();
    await expect(getProgramsMarketingProductRecord('nutrition')).resolves.toBeNull();
  });
});

describe('validateComposition — read-path safety contract', () => {
  it('returns null for non-composition shapes', () => {
    expect(validateComposition(null)).toBeNull();
    expect(validateComposition({})).toBeNull();
    expect(validateComposition({ key: 'k' })).toBeNull();
    expect(validateComposition({ key: 'k', modules: 'nope' })).toBeNull();
  });

  it('returns null when a module declares an unknown type (strict top-level enum)', () => {
    expect(
      validateComposition({
        key: 'composition:programs:x',
        version: 1,
        modules: [
          { id: 'a', type: 'totally.unknown.v1', content: {} },
        ],
      }),
    ).toBeNull();
  });

  it('drops known-type modules whose content fails its schema, keeping valid siblings', () => {
    const result = validateComposition({
      key: 'composition:programs:x',
      version: 2,
      modules: [
        { id: 'ok-1', type: 'ambient.marquee-strip.v1', content: { text: 'hi' } },
        { id: 'bad', type: 'ambient.marquee-strip.v1', content: {} }, // missing required `text`
        { id: 'ok-2', type: 'cta.program-offer.v1', content: { collectionSlug: 'nutrition' } },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.key).toBe('composition:programs:x');
    expect(result!.version).toBe(2);
    expect(result!.modules.map((m) => m.id)).toEqual(['ok-1', 'ok-2']);
    expect(result!.modules.map((m) => m.type)).toEqual([
      'ambient.marquee-strip.v1',
      'cta.program-offer.v1',
    ]);
  });
});
