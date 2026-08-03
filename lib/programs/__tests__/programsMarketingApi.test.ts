/**
 * Programs Marketing API — read-only adapter behavior.
 *
 * Supabase is mocked unavailable so this suite exercises the deterministic
 * JSON-seed path only. Live/CMS `site_content` must never affect assertions.
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

describe('programs marketing read-only JSON isolation', () => {
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

  it('lists products as an array without throwing when Supabase is unavailable', async () => {
    const all = await listProgramsMarketingProducts();
    expect(Array.isArray(all)).toBe(true);
    for (const product of all) {
      expect(product.category).toBe('programs');
    }
  });

  it('loads deterministic JSON-seeded products when Supabase is unavailable', async () => {
    const all = await listProgramsMarketingProducts(false);
    const published = await listProgramsMarketingProducts(true);

    expect(all.length).toBeGreaterThan(0);
    expect(published.length).toBeGreaterThan(0);
    expect(all.every((p) => p.status === 'published' || p.status === 'draft')).toBe(
      true,
    );
    expect(published.every((p) => p.status === 'published')).toBe(true);
    expect(all.map((p) => p.slug).sort()).toEqual(
      (await listProgramsMarketingProducts(false)).map((p) => p.slug).sort(),
    );
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

  it('opens the publish gate only when BOTH published product and composition seeds exist', async () => {
    // Intended product contract: nutrition ships with published JSON product +
    // composition. Public pages require both; this suite proves JSON isolation
    // (Supabase mocked down) returns that contract deterministically.
    const composition = await getProgramsMarketingComposition('nutrition', 'published');
    const product = await getProgramsMarketingProductRecord('nutrition', 'published');
    expect(composition).not.toBeNull();
    expect(product).not.toBeNull();
    expect(product!.status).toBe('published');
    expect(product!.slug).toBe('nutrition');
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
