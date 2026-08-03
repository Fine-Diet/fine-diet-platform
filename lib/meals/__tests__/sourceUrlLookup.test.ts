/**
 * Package 3 — paginated normalized source URL lookup tests.
 */

import { findRowByNormalizedSourceUrl } from '../sourceUrlLookup';

describe('findRowByNormalizedSourceUrl', () => {
  it('returns exact normalized match without scanning pages', async () => {
    const exact = jest.fn(async () => [{ source_url: 'https://example.com/r', id: 'exact' }]);
    const page = jest.fn(async () => []);

    const match = await findRowByNormalizedSourceUrl(
      'https://example.com/r?utm_source=x',
      { exact, page },
      100,
    );

    expect(match).toEqual({ source_url: 'https://example.com/r', id: 'exact' });
    expect(exact).toHaveBeenCalledWith('https://example.com/r');
    expect(page).not.toHaveBeenCalled();
  });

  it('finds a historical raw-url match older than one page', async () => {
    const target = 'https://example.com/old-recipe';
    const exact = jest.fn(async () => []);
    const page = jest.fn(async (offset: number, limit: number) => {
      if (offset === 0) {
        return Array.from({ length: limit }, (_, i) => ({
          source_url: `https://example.com/other-${i}`,
          id: `other-${i}`,
        }));
      }
      if (offset === limit) {
        return [
          {
            // Historical raw variant with tracking params.
            source_url: 'https://Example.com/old-recipe/?utm_campaign=x#frag',
            id: 'old-match',
          },
        ];
      }
      return [];
    });

    const match = await findRowByNormalizedSourceUrl(target, { exact, page }, 50);

    expect(match?.id).toBe('old-match');
    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(1, 0, 50);
    expect(page).toHaveBeenNthCalledWith(2, 50, 50);
  });

  it('returns null when no page matches', async () => {
    const exact = jest.fn(async () => []);
    const page = jest.fn(async () => [{ source_url: 'https://example.com/nope', id: 'x' }]);

    const match = await findRowByNormalizedSourceUrl(
      'https://example.com/missing',
      { exact, page },
      10,
    );
    expect(match).toBeNull();
  });
});
