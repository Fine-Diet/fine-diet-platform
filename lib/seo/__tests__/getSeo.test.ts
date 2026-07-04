/**
 * getSeoForRoute — pageOverride precedence + fallback behavior.
 *
 * supabaseServerClient is mocked to throw so the loaders return null and the
 * merger exercises the hard-coded FALLBACK_DEFAULTS. This keeps the test pure
 * (no network, no DB) while validating the precedence chain.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: () => {
      throw new Error('supabase disabled in test');
    },
  },
}));

import { getSeoForRoute } from '@/lib/seo/getSeo';

describe('getSeoForRoute — fallback defaults (no CMS)', () => {
  it('renders a valid title/description/canonical with no overrides', async () => {
    const { seo } = await getSeoForRoute({ routePath: '/start' });
    expect(seo.title).toBeTruthy();
    expect(seo.description).toBeTruthy();
    expect(seo.canonical.startsWith('https://')).toBe(true);
    expect(seo.canonical.endsWith('/start')).toBe(true);
    expect(seo.ogType).toBe('website');
    expect(seo.twitterCard).toBe('summary_large_image');
  });

  it('applies the title template using pageTitle', async () => {
    const { seo } = await getSeoForRoute({
      routePath: '/programs',
      pageTitle: 'Programs',
    });
    // FALLBACK_DEFAULTS.titleTemplate is '{{pageTitle}} | {{siteName}}'
    expect(seo.title).toBe('Programs | Fine Diet');
  });
});

describe('getSeoForRoute — pageOverride precedence', () => {
  it('pageOverride title bypasses the title template', async () => {
    const { seo } = await getSeoForRoute({
      routePath: '/start',
      pageTitle: 'Programs',
      pageOverride: { title: 'Custom Start Title' },
    });
    expect(seo.title).toBe('Custom Start Title');
  });

  it('pageOverride og.image wins over the (absent) global ogImage', async () => {
    const { seo } = await getSeoForRoute({
      routePath: '/start',
      pageOverride: { og: { image: 'https://example.com/og.jpg' } },
    });
    expect(seo.ogImage).toBe('https://example.com/og.jpg');
  });

  it('pageOverride twitter.image wins and falls back to og image when absent', async () => {
    const { seo } = await getSeoForRoute({
      routePath: '/start',
      pageOverride: {
        og: { image: 'https://example.com/og.jpg' },
        twitter: { image: 'https://example.com/tw.jpg' },
      },
    });
    expect(seo.twitterImage).toBe('https://example.com/tw.jpg');
  });

  it('pageOverride twitter.image falls back to og image when twitter image blank', async () => {
    const { seo } = await getSeoForRoute({
      routePath: '/start',
      pageOverride: {
        og: { image: 'https://example.com/og.jpg' },
        twitter: { card: 'summary' },
      },
    });
    expect(seo.twitterImage).toBe('https://example.com/og.jpg');
    expect(seo.twitterCard).toBe('summary');
  });

  it('pageOverride canonical (absolute) wins over canonicalPath', async () => {
    const { seo } = await getSeoForRoute({
      routePath: '/start',
      pageOverride: {
        canonical: 'https://myfinediet.com/start/launch',
        canonicalPath: '/start',
      },
    });
    expect(seo.canonical).toBe('https://myfinediet.com/start/launch');
  });

  it('pageOverride canonicalPath resolves against the canonical base', async () => {
    const { seo } = await getSeoForRoute({
      routePath: '/start',
      pageOverride: { canonicalPath: '/start/launch' },
    });
    expect(seo.canonical).toBe('https://myfinediet.com/start/launch');
  });

  it('pageOverride noindex renders noindex,follow', async () => {
    const { seo } = await getSeoForRoute({
      routePath: '/start',
      pageOverride: { noindex: true },
    });
    expect(seo.robots).toBe('noindex,follow');
  });

  it('pageOverride robots wins over noindex flag', async () => {
    const { seo } = await getSeoForRoute({
      routePath: '/start',
      pageOverride: { noindex: true, robots: 'noindex,nofollow' },
    });
    expect(seo.robots).toBe('noindex,nofollow');
  });

  it('blank pageOverride does not shadow useful fallbacks', async () => {
    const { seo } = await getSeoForRoute({
      routePath: '/start',
      pageTitle: 'Start',
      pageOverride: { title: undefined, description: undefined },
    });
    // Falls back to the template + default description.
    expect(seo.title).toBe('Start | Fine Diet');
    expect(seo.description).toBeTruthy();
  });
});
