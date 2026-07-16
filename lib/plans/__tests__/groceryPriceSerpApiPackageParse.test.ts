import {
  extractPackageFromSerpApiShoppingRow,
  parseGroceryPackageFromText,
} from '../groceryPriceSerpApiPackageParse';
import { normalizeSerpApiShoppingResults } from '../groceryPriceSerpApiProvider';
import { toSearchOffer } from '../groceryPriceRanking';
import { buildCandidateSnapshot } from '../groceryPriceStore';
import {
  SERPAPI_AMBIGUOUS_PACKAGE_FIXTURE,
  SERPAPI_EXTENSION_PACKAGE_FIXTURE,
  SERPAPI_MISSING_PACKAGE_FIXTURE,
  SERPAPI_SPINACH_FIXTURE,
  SERPAPI_STRUCTURED_PACKAGE_FIXTURE,
  SERPAPI_TAGLINE_PACKAGE_FIXTURE,
} from './fixtures/serpApiShoppingFixtures';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

describe('groceryPriceSerpApiPackageParse', () => {
  it('parses package size from title text', () => {
    expect(parseGroceryPackageFromText('Organic Girl Baby Spinach 5 oz')).toEqual({
      package_size: 5,
      package_unit: 'oz',
      package_text: '5 oz',
      source: null,
    });
  });

  it('parses package size from extension strings', () => {
    const parsed = extractPackageFromSerpApiShoppingRow({
      title: 'Organic Girl Baby Spinach',
      extensions: ['5 oz', 'In store'],
    });
    expect(parsed).toMatchObject({
      package_size: 5,
      package_unit: 'oz',
      source: 'extensions',
    });
  });

  it('parses package size from structured product_attributes', () => {
    const parsed = extractPackageFromSerpApiShoppingRow({
      title: 'Organic Valley Whole Milk',
      product_attributes: [{ name: 'Net weight', value: '64 fl oz' }],
    });
    expect(parsed).toMatchObject({
      package_size: 64,
      package_unit: 'oz',
      source: 'structured',
    });
  });

  it('parses package size from tagline when title omits it', () => {
    const parsed = extractPackageFromSerpApiShoppingRow({
      title: 'Kerrygold Pure Irish Butter',
      tagline: '8 oz salted',
    });
    expect(parsed).toMatchObject({
      package_size: 8,
      package_unit: 'oz',
      source: 'tagline',
    });
  });

  it('returns null package fields for ambiguous conflicting hints', () => {
    const parsed = extractPackageFromSerpApiShoppingRow({
      title: 'Snack Mix Variety 5 oz',
      extensions: ['12 oz'],
    });
    expect(parsed.package_size).toBeNull();
    expect(parsed.package_unit).toBeNull();
  });

  it('returns null package fields when no size hints exist', () => {
    const parsed = extractPackageFromSerpApiShoppingRow({
      title: 'Fresh Herbs Bundle',
      tagline: 'Locally sourced',
      snippet: 'Tastes good (120 user reviews)',
      extensions: ['In store', 'Nearby, 2 mi'],
    });
    expect(parsed.package_size).toBeNull();
    expect(parsed.package_unit).toBeNull();
  });

  it('ignores pack-count-only strings without weight or volume units', () => {
    expect(parseGroceryPackageFromText('6 pack')).toBeNull();
    expect(parseGroceryPackageFromText('Pack of 6')).toBeNull();
  });
});

describe('SerpAPI package end-to-end pipeline', () => {
  const retrievedAt = '2026-07-15T00:00:00.000Z';

  it('carries title-derived package through normalize → snapshot → offer', () => {
    const [candidate] = normalizeSerpApiShoppingResults(
      SERPAPI_SPINACH_FIXTURE,
      'Whole Foods Market',
      retrievedAt,
    );
    expect(candidate).toMatchObject({ package_size: 5, package_unit: 'oz' });

    const snapshot = buildCandidateSnapshot([candidate!]);
    const offer = (snapshot.offers as ReturnType<typeof toSearchOffer>[])[0];
    expect(offer).toMatchObject({ package_size: 5, package_unit: 'oz' });
    expect(toSearchOffer(candidate!)).toMatchObject({ package_size: 5, package_unit: 'oz' });
  });

  it('carries extension-derived package through normalize → snapshot → offer', () => {
    const [candidate] = normalizeSerpApiShoppingResults(
      SERPAPI_EXTENSION_PACKAGE_FIXTURE,
      'Whole Foods Market',
      retrievedAt,
    );
    expect(candidate).toMatchObject({ package_size: 5, package_unit: 'oz' });

    const snapshot = buildCandidateSnapshot([candidate!]);
    const offer = (snapshot.offers as ReturnType<typeof toSearchOffer>[])[0];
    expect(offer).toMatchObject({ package_size: 5, package_unit: 'oz' });
  });

  it('carries structured-field package through normalize → snapshot → offer', () => {
    const [candidate] = normalizeSerpApiShoppingResults(
      SERPAPI_STRUCTURED_PACKAGE_FIXTURE,
      'Target',
      retrievedAt,
    );
    expect(candidate).toMatchObject({ package_size: 64, package_unit: 'oz' });

    const snapshot = buildCandidateSnapshot([candidate!]);
    const offer = (snapshot.offers as ReturnType<typeof toSearchOffer>[])[0];
    expect(offer).toMatchObject({ package_size: 64, package_unit: 'oz' });
  });

  it('carries tagline-derived package through normalize → snapshot → offer', () => {
    const [candidate] = normalizeSerpApiShoppingResults(
      SERPAPI_TAGLINE_PACKAGE_FIXTURE,
      'Whole Foods Market',
      retrievedAt,
    );
    expect(candidate).toMatchObject({ package_size: 8, package_unit: 'oz' });
  });

  it('leaves package null for ambiguous and missing fixtures', () => {
    const [ambiguous] = normalizeSerpApiShoppingResults(
      SERPAPI_AMBIGUOUS_PACKAGE_FIXTURE,
      'Target',
      retrievedAt,
    );
    const [missing] = normalizeSerpApiShoppingResults(
      SERPAPI_MISSING_PACKAGE_FIXTURE,
      'Whole Foods Market',
      retrievedAt,
    );
    expect(ambiguous?.package_size).toBeNull();
    expect(missing?.package_size).toBeNull();
  });
});
