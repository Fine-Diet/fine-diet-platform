/**
 * Shared SeoSocialFields schema + composePageSeoOverride helper.
 *
 * Guards the canonical editor/persisted shape and the legacy-column fallback
 * composition used by every marketing page family.
 */
import {
  seoSocialFieldsSchema,
  composePageSeoOverride,
} from '@/lib/seo/seoSocialFields';

describe('seoSocialFieldsSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(seoSocialFieldsSchema.parse({ })).toEqual({});
  });

  it('accepts undefined (optional top-level)', () => {
    expect(seoSocialFieldsSchema.parse(undefined)).toBeUndefined();
  });

  it('parses the full social preview set', () => {
    const parsed = seoSocialFieldsSchema.parse({
      title: 'Gut Check',
      description: 'Quick gut health read.',
      canonicalPath: '/assessments/gut-check',
      canonical: 'https://myfinediet.com/assessments/gut-check',
      robots: 'noindex,follow',
      noindex: true,
      og: {
        title: 'OG title',
        description: 'OG desc',
        image: 'https://example.com/og.jpg',
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Twitter title',
        description: 'Twitter desc',
        image: 'https://example.com/tw.jpg',
      },
    });

    expect(parsed?.og?.image).toBe('https://example.com/og.jpg');
    expect(parsed?.twitter?.card).toBe('summary_large_image');
    expect(parsed?.noindex).toBe(true);
  });

  it('strips unknown keys (display-metadata only boundary)', () => {
    const parsed = seoSocialFieldsSchema.parse({
      title: 'Hi',
      checkoutUrl: '/buy/offer',
      stripePriceId: 'price_123',
    });
    expect(parsed).not.toHaveProperty('checkoutUrl');
    expect(parsed).not.toHaveProperty('stripePriceId');
    expect(parsed?.title).toBe('Hi');
  });

  it('rejects an invalid twitter card enum', () => {
    const parsed = seoSocialFieldsSchema.safeParse({
      twitter: { card: 'huge_card' },
    });
    // zod .optional() at top level returns the raw object on safeParse failure
    // of a nested field — the nested object is stripped to undefined on parse
    // because safeParse fails. Verify safeParse reports failure.
    expect(parsed.success).toBe(false);
  });
});

describe('composePageSeoOverride', () => {
  it('returns null when no source provides any field', () => {
    expect(composePageSeoOverride({})).toBeNull();
    expect(
      composePageSeoOverride({ seo: null, legacyTitle: null, legacyDescription: null }),
    ).toBeNull();
  });

  it('uses the seo block as the authoritative source', () => {
    const result = composePageSeoOverride({
      seo: {
        title: 'Block title',
        og: { image: 'https://example.com/og.jpg' },
      },
      legacyTitle: 'Legacy title',
      legacyDescription: 'Legacy desc',
    });
    expect(result?.title).toBe('Block title');
    expect(result?.og?.image).toBe('https://example.com/og.jpg');
  });

  it('falls back to legacy columns for title/description when the block omits them', () => {
    const result = composePageSeoOverride({
      seo: { og: { image: 'https://example.com/og.jpg' } },
      legacyTitle: 'Legacy title',
      legacyDescription: 'Legacy desc',
    });
    expect(result?.title).toBe('Legacy title');
    expect(result?.description).toBe('Legacy desc');
    expect(result?.og?.image).toBe('https://example.com/og.jpg');
  });

  it('falls back to legacy-only when no seo block exists', () => {
    const result = composePageSeoOverride({
      legacyTitle: 'Legacy title',
      legacyDescription: 'Legacy desc',
    });
    expect(result).toEqual({
      title: 'Legacy title',
      description: 'Legacy desc',
    });
  });
});
