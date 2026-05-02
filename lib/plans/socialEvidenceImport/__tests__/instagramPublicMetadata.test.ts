import { afterEach, describe, expect, jest, test } from '@jest/globals';
import {
  extractInstagramMetadata,
  fetchInstagramPublicMetadata,
  normalizeInstagramPageUrl,
} from '../platformEvidence/instagramPublicMetadata';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('Instagram public metadata acquisition', () => {
  test('normalizes Instagram post and reel URLs without tracking parameters', () => {
    expect(
      normalizeInstagramPageUrl('https://www.instagram.com/reel/ABC123/?utm_source=ig_web_copy_link'),
    ).toBe('https://www.instagram.com/reel/ABC123/');
    expect(normalizeInstagramPageUrl('https://example.com/reel/ABC123/')).toBeNull();
  });

  test('extracts quoted caption and author from public metadata tags', () => {
    const html = `
      <html>
        <head>
          <meta property="og:description" content="1,234 likes, 12 comments - chefname on Instagram: &quot;Lemon chickpea salad recipe: add chickpeas, lemon juice, olive oil, cucumber, and herbs. Mix and serve chilled.&quot;" />
          <meta property="og:title" content="chefname on Instagram • Photos and videos" />
        </head>
      </html>
    `;

    expect(extractInstagramMetadata(html)).toEqual({
      caption:
        'Lemon chickpea salad recipe: add chickpeas, lemon juice, olive oil, cucumber, and herbs. Mix and serve chilled.',
      title: 'chefname on Instagram • Photos and videos',
      author_name: 'chefname',
    });
  });

  test('returns ok with caption from public HTML metadata', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        '<meta property="og:description" content="chef on Instagram: &quot;Recipe: mix oats, yogurt, berries, and cinnamon. Chill overnight and serve.&quot;">',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      ),
    ) as typeof fetch;

    const result = await fetchInstagramPublicMetadata(
      'https://www.instagram.com/p/ABC123/?utm_source=ig_web_copy_link',
    );

    expect(result.status).toBe('ok');
    expect(result.caption).toBe(
      'Recipe: mix oats, yogurt, berries, and cinnamon. Chill overnight and serve.',
    );
    expect(result.url_used).toBe('https://www.instagram.com/p/ABC123/');
  });

  test('maps blocked and empty responses to explicit attempt statuses', async () => {
    global.fetch = jest.fn(async () => new Response('', { status: 403 })) as typeof fetch;
    await expect(
      fetchInstagramPublicMetadata('https://www.instagram.com/reel/BLOCKED/'),
    ).resolves.toMatchObject({ status: 'blocked', http_status: 403 });

    global.fetch = jest.fn(async () => new Response('', { status: 200 })) as typeof fetch;
    await expect(
      fetchInstagramPublicMetadata('https://www.instagram.com/reel/EMPTY/'),
    ).resolves.toMatchObject({ status: 'empty', http_status: 200 });
  });
});
