import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import homeFallback from '@/data/homeContent.json';
import navigationFallback from '@/data/navigation.json';
import footerFallback from '@/data/footerContent.json';

const mockContent = new Map<string, unknown>();

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_column: string, key: string) => ({
          eq: () => ({
            single: async () => ({ data: { data: mockContent.get(key) }, error: null }),
          }),
        }),
      }),
    }),
  },
}));

describe('content API Journal links', () => {
  beforeEach(() => {
    jest.resetModules();
    mockContent.clear();
  });

  it('normalizes published homepage CTAs loaded from Supabase without editing stored content', async () => {
    const published = structuredClone(homeFallback);
    published.hero.buttons[0].href = 'https://journal.myfinediet.com/';
    published.featureSections[1].buttons[0].href =
      'https://journal.myfinediet.com/journal/programs?series=nutrition';
    published.featureSections[0].buttons[0].href = 'https://example.com/story';
    mockContent.set('home', published);

    const { getHomeContent } = await import('@/lib/contentApi');
    const result = await getHomeContent();

    expect(result.hero.buttons[0].href).toBe('/app/log');
    expect(result.featureSections[1].buttons[0].href).toBe('/app/programs?series=nutrition');
    expect(result.featureSections[0].buttons[0].href).toBe('https://example.com/story');
    expect(published.hero.buttons[0].href).toBe('https://journal.myfinediet.com/');
  });

  it('normalizes published desktop/mobile navigation destinations', async () => {
    const published = structuredClone(navigationFallback);
    published.topLinks.journal.href = 'https://journal.myfinediet.com';
    published.topLinks.account.href = '/published-account-route';
    published.categories[1].prospectProduct.badge = '';
    published.categories[2].prospectProduct.badge = '';
    mockContent.set('navigation', published);

    const { getNavigationContent } = await import('@/lib/contentApi');
    const result = await getNavigationContent();

    expect(result.topLinks.journal.href).toBe('/app/log');
    expect(result.topLinks.account.href).toBe('/published-account-route');
    expect(published.topLinks.journal.href).toBe('https://journal.myfinediet.com');
  });

  it('normalizes published footer Journal links and preserves unrelated links', async () => {
    const published = structuredClone(footerFallback);
    published.explore.links[0].href = 'https://journal.myfinediet.com/journal/log?entry=new';
    published.connect.links[0].href = 'https://instagram.com/finediet';
    mockContent.set('footer', published);

    const { getFooterContent } = await import('@/lib/contentApi');
    const result = await getFooterContent();

    expect(result.explore.links[0].href).toBe('/app/log/new?entry=new');
    expect(result.connect.links[0].href).toBe('https://instagram.com/finediet');
    expect(published.explore.links[0].href).toBe(
      'https://journal.myfinediet.com/journal/log?entry=new',
    );
  });
});
