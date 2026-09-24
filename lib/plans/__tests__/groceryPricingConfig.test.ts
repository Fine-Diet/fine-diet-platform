import {
  resolveGroceryPriceSerpApiApiKey,
} from '../groceryPricingConfig';

describe('groceryPricingConfig SerpAPI key resolution', () => {
  const original = process.env.SERPAPI_API_KEY;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SERPAPI_API_KEY;
    } else {
      process.env.SERPAPI_API_KEY = original;
    }
  });

  it('treats whitespace-only SERPAPI_API_KEY as unset', () => {
    process.env.SERPAPI_API_KEY = '   ';
    expect(resolveGroceryPriceSerpApiApiKey()).toBeNull();
  });

  it('treats empty-string SERPAPI_API_KEY as unset', () => {
    process.env.SERPAPI_API_KEY = '';
    expect(resolveGroceryPriceSerpApiApiKey()).toBeNull();
  });

  it('returns trimmed key when configured', () => {
    process.env.SERPAPI_API_KEY = '  abc123  ';
    expect(resolveGroceryPriceSerpApiApiKey()).toBe('abc123');
  });
});
