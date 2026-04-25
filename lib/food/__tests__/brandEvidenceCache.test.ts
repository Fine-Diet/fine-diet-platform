/**
 * Phase E — Brand Evidence Cache tests.
 *
 * Covers:
 * - Cache hit (loaded with brand_name fixtures): known brand tokens are marked.
 * - Cache miss / cold (no load): heuristic fallback is used.
 * - Cold-cache fallback path: searchNormalization without `brandTokenSet` keeps
 *   COMMON_WORDS-based behavior.
 * - Stopword filtering: 'inc', 'llc', etc. are not promoted to brand tokens.
 * - Numeric / short tokens: numbers and length-2 tokens never enter the cache.
 * - Brand-first vs brand-last query convergence with cache loaded.
 * - TTL refresh: forced reload re-tokenizes new brand data.
 * - Empty load: cache loaded but empty -> still callable, returns null brand for any token.
 */

// Mock supabaseAdmin BEFORE importing the cache module so the env-var
// guards in lib/supabaseServerClient.ts never fire. The cache only uses
// supabaseAdmin when no `injectedBrands` / `loadBrands` is provided —
// every test in this file uses one of those test seams.
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
    })),
  },
}));

import {
  __resetBrandEvidenceCacheForTests,
  getBrandEvidenceCacheSummary,
  getBrandEvidenceForToken,
  getCachedBrandTokens,
  loadBrandEvidence,
} from '../brandEvidenceCache';
import { normalizeSearchQuery } from '../searchNormalization';

describe('brandEvidenceCache — cold (uninitialized) state', () => {
  beforeEach(() => {
    __resetBrandEvidenceCacheForTests();
  });

  it('returns null until loaded', () => {
    expect(getCachedBrandTokens()).toBeNull();
    expect(getBrandEvidenceForToken('amylu')).toBeNull();
    expect(getBrandEvidenceCacheSummary().loaded).toBe(false);
  });

  it('normalizeSearchQuery without cache uses heuristic (length+COMMON_WORDS)', () => {
    const { tokenGroups } = normalizeSearchQuery('Amylu Breakfast Time Chicken Mini Links');
    const brandLike = tokenGroups.filter((g) => g.isBrandLike).map((g) => g.canonical);
    expect(brandLike).toEqual(['amylu']);
  });

  it('cold tim/tam tokens never become brand-like by heuristic alone', () => {
    const { tokenGroups } = normalizeSearchQuery('tim tam');
    expect(tokenGroups.every((g) => !g.isBrandLike)).toBe(true);
  });
});

describe('brandEvidenceCache — load and hit', () => {
  beforeEach(() => {
    __resetBrandEvidenceCacheForTests();
  });

  it('loads from injectedBrands and exposes per-token evidence', async () => {
    const state = await loadBrandEvidence({
      injectedBrands: ['Amylu Foods', 'Chobani', "Arnott's"],
      force: true,
    });

    expect(state.brandCount).toBe(3);
    expect(state.source).toBe('injected');
    expect(state.tokens.has('amylu')).toBe(true);
    expect(state.tokens.has('chobani')).toBe(true);
    expect(state.tokens.has('arnotts')).toBe(true);
  });

  it('promotes a token as brand-like when cache says so', async () => {
    await loadBrandEvidence({
      injectedBrands: ['Chobani', 'Amylu Foods'],
      force: true,
    });
    const cache = getCachedBrandTokens();
    expect(cache).not.toBeNull();

    const { tokenGroups } = normalizeSearchQuery('chobani plain', {
      brandTokenSet: cache,
    });
    const chobani = tokenGroups.find((g) => g.canonical === 'chobani');
    expect(chobani?.isBrandLike).toBe(true);
  });

  it('keeps brand-token matching invariant when the brand appears first or last in the query (cache loaded)', async () => {
    await loadBrandEvidence({
      injectedBrands: ['Amylu Foods'],
      force: true,
    });
    const cache = getCachedBrandTokens();

    const first = normalizeSearchQuery('Amylu Breakfast Time Chicken Mini Links', {
      brandTokenSet: cache,
    });
    const last = normalizeSearchQuery('Breakfast Time Chicken Mini Links Amylu', {
      brandTokenSet: cache,
    });

    const firstBrand = first.tokenGroups.filter((g) => g.isBrandLike).map((g) => g.canonical);
    const lastBrand = last.tokenGroups.filter((g) => g.isBrandLike).map((g) => g.canonical);

    expect(firstBrand).toEqual(['amylu']);
    expect(lastBrand).toEqual(['amylu']);
  });

  it('returns isKnownBrand:false for unknown tokens once cache is loaded', async () => {
    await loadBrandEvidence({
      injectedBrands: ['Chobani'],
      force: true,
    });
    expect(getBrandEvidenceForToken('chobani')?.isKnownBrand).toBe(true);
    expect(getBrandEvidenceForToken('definitelynotabrand')?.isKnownBrand).toBe(false);
  });

  it('caches sample brands per token (debug aid, capped at 5)', async () => {
    await loadBrandEvidence({
      injectedBrands: [
        'Chobani Greek',
        'Chobani Plain',
        'Chobani Yogurt',
        'Chobani Drink',
        'Chobani Vanilla',
        'Chobani Strawberry',
      ],
      force: true,
    });
    const ev = getBrandEvidenceForToken('chobani');
    expect(ev?.isKnownBrand).toBe(true);
    expect(ev?.sampleBrands.length).toBeLessThanOrEqual(5);
    expect(ev?.sampleBrands.length).toBeGreaterThan(0);
  });
});

describe('brandEvidenceCache — filtering rules', () => {
  beforeEach(() => {
    __resetBrandEvidenceCacheForTests();
  });

  it('drops legal/structural stopwords (Inc, LLC, Foods, Inc., the)', async () => {
    const state = await loadBrandEvidence({
      injectedBrands: ['Amylu Foods Inc', 'Acme LLC', 'The Best Co'],
      force: true,
    });
    expect(state.tokens.has('amylu')).toBe(true);
    expect(state.tokens.has('foods')).toBe(false);
    expect(state.tokens.has('inc')).toBe(false);
    expect(state.tokens.has('llc')).toBe(false);
    expect(state.tokens.has('co')).toBe(false);
    expect(state.tokens.has('the')).toBe(false);
    expect(state.tokens.has('acme')).toBe(true);
    expect(state.tokens.has('best')).toBe(true);
  });

  it('drops pure numeric tokens and short (<3 char) tokens', async () => {
    const state = await loadBrandEvidence({
      injectedBrands: ['7-Up', 'AB Inc', '99 Cent Co', 'XYZ'],
      force: true,
    });
    expect(state.tokens.has('7')).toBe(false);
    expect(state.tokens.has('99')).toBe(false);
    expect(state.tokens.has('ab')).toBe(false);
    expect(state.tokens.has('cent')).toBe(true);
    expect(state.tokens.has('xyz')).toBe(true);
    expect(state.tokens.has('up')).toBe(false);
  });

  it('strips apostrophes and punctuation, then tokenizes', async () => {
    const state = await loadBrandEvidence({
      injectedBrands: ["Arnott's", 'McDonald\u2019s', 'Mom-and-Pop Inc.'],
      force: true,
    });
    expect(state.tokens.has('arnotts')).toBe(true);
    expect(state.tokens.has('mcdonalds')).toBe(true);
    expect(state.tokens.has('mom')).toBe(true);
    expect(state.tokens.has('and')).toBe(false);
    expect(state.tokens.has('pop')).toBe(true);
  });
});

describe('brandEvidenceCache — TTL and reload', () => {
  beforeEach(() => {
    __resetBrandEvidenceCacheForTests();
  });

  it('returns existing state on subsequent calls within TTL', async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return ['Chobani'];
    };

    await loadBrandEvidence({ loadBrands: loader, force: true });
    await loadBrandEvidence({ loadBrands: loader });
    await loadBrandEvidence({ loadBrands: loader });

    expect(calls).toBe(1);
  });

  it('force:true triggers reload and replaces token set', async () => {
    await loadBrandEvidence({ injectedBrands: ['Chobani'], force: true });
    expect(getCachedBrandTokens()?.has('chobani')).toBe(true);
    expect(getCachedBrandTokens()?.has('amylu')).toBe(false);

    await loadBrandEvidence({ injectedBrands: ['Amylu Foods'], force: true });
    expect(getCachedBrandTokens()?.has('amylu')).toBe(true);
    expect(getCachedBrandTokens()?.has('chobani')).toBe(false);
  });

  it('empty injectedBrands yields a loaded but empty cache; tokens=Set(0)', async () => {
    const state = await loadBrandEvidence({ injectedBrands: [], force: true });
    expect(state.tokens.size).toBe(0);
    expect(getCachedBrandTokens()).not.toBeNull();
    expect(getBrandEvidenceForToken('amylu')?.isKnownBrand).toBe(false);
  });
});

describe('brandEvidenceCache — interaction with normalizeSearchQuery', () => {
  beforeEach(() => {
    __resetBrandEvidenceCacheForTests();
  });

  it('cache + heuristic combine: cache promotes, heuristic still applies for non-cache tokens', async () => {
    await loadBrandEvidence({ injectedBrands: ['Amylu Foods'], force: true });
    const cache = getCachedBrandTokens();

    // 'breakfast' is in COMMON_WORDS and NOT in cache -> not brand-like.
    // 'amylu' is in cache -> brand-like.
    const { tokenGroups } = normalizeSearchQuery('amylu breakfast', {
      brandTokenSet: cache,
    });
    const brandLike = tokenGroups.filter((g) => g.isBrandLike).map((g) => g.canonical);
    expect(brandLike).toEqual(['amylu']);
  });

  it('passing brandTokenSet:null is equivalent to passing nothing (cold-cache equivalence)', () => {
    const a = normalizeSearchQuery('amylu breakfast');
    const b = normalizeSearchQuery('amylu breakfast', { brandTokenSet: null });
    expect(a.tokenGroups.map((g) => g.isBrandLike)).toEqual(
      b.tokenGroups.map((g) => g.isBrandLike)
    );
  });
});
