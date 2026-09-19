import {
  PantryRetailSearchLocationError,
  resolvePantryRetailSearchLocation,
  setPantryRetailLocationResolverTimeoutMsOverride,
  setPantryRetailLocationsFetchOverride,
} from '../pantryRetailSearchLocation';

describe('resolvePantryRetailSearchLocation', () => {
  afterEach(() => {
    setPantryRetailLocationsFetchOverride(null);
    setPantryRetailLocationResolverTimeoutMsOverride(null);
    jest.useRealTimers();
  });

  it('prefers an exact postal Supported Locations candidate', async () => {
    setPantryRetailLocationsFetchOverride(async () => ([
      {
        name: 'San Francisco, California, United States',
        canonical_name: 'San Francisco, California, United States',
        country_code: 'US',
        target_type: 'City',
      },
      {
        name: '94110, California, United States',
        canonical_name: '94110, California, United States',
        country_code: 'US',
        target_type: 'Postal Code',
      },
    ]));

    const result = await resolvePantryRetailSearchLocation('94110');
    expect(result).toMatchObject({
      postal_code: '94110',
      provider_location: '94110, California, United States',
      country_code: 'US',
      resolution_source: 'serpapi_supported_locations',
    });
  });

  it('rejects same-country candidates that do not contain the exact postal token', async () => {
    setPantryRetailLocationsFetchOverride(async () => ([
      {
        name: 'San Francisco, California, United States',
        canonical_name: 'San Francisco, California, United States',
        country_code: 'US',
        target_type: 'City',
      },
    ]));

    const result = await resolvePantryRetailSearchLocation('94110');
    expect(result.resolution_source).toBe('legacy_market_fallback');
    expect(result.provider_location).toContain('San Francisco');
  });

  it('rejects wrong-country candidates', async () => {
    setPantryRetailLocationsFetchOverride(async () => ([
      {
        name: '94110, Ontario, Canada',
        canonical_name: '94110, Ontario, Canada',
        country_code: 'CA',
        target_type: 'Postal Code',
      },
    ]));

    const result = await resolvePantryRetailSearchLocation('94110');
    expect(result.resolution_source).toBe('legacy_market_fallback');
    expect(result.provider_location).toContain('San Francisco');
  });

  it('uses controlled legacy market fallback when Supported Locations has no exact hit', async () => {
    setPantryRetailLocationsFetchOverride(async () => ([]));

    const result = await resolvePantryRetailSearchLocation('94110');
    expect(result).toMatchObject({
      postal_code: '94110',
      country_code: 'US',
      resolution_source: 'legacy_market_fallback',
    });
    expect(result.provider_location).toContain('San Francisco');
  });

  it('normalizes Canadian postal codes', async () => {
    setPantryRetailLocationsFetchOverride(async () => ([
      {
        name: 'M5V 2T6, Ontario, Canada',
        canonical_name: 'M5V 2T6, Ontario, Canada',
        country_code: 'CA',
        target_type: 'Postal Code',
      },
    ]));

    const result = await resolvePantryRetailSearchLocation('M5V 2T6');
    expect(result.postal_code).toBe('M5V 2T6');
    expect(result.country_code).toBe('CA');
  });

  it('uses legacy fallback when Supported Locations fetch fails with location_unresolved', async () => {
    setPantryRetailLocationsFetchOverride(async () => {
      throw new PantryRetailSearchLocationError(
        'location_unresolved',
        'Unable to resolve search location.',
      );
    });

    const result = await resolvePantryRetailSearchLocation('94110');
    expect(result.resolution_source).toBe('legacy_market_fallback');
    expect(result.provider_location).toContain('San Francisco');
  });

  it('throws when location cannot be resolved', async () => {
    setPantryRetailLocationsFetchOverride(async () => ([]));

    await expect(resolvePantryRetailSearchLocation('99999')).rejects.toMatchObject({
      code: 'location_unresolved',
    });
  });

  it('throws on resolver timeout', async () => {
    jest.useFakeTimers();
    setPantryRetailLocationResolverTimeoutMsOverride(25);
    setPantryRetailLocationsFetchOverride((_postal, init) => new Promise((resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('expected abort signal'));
        return;
      }
      signal.addEventListener('abort', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));

    const promise = resolvePantryRetailSearchLocation('94110');
    const assertion = expect(promise).rejects.toMatchObject({ code: 'location_timeout' });
    await jest.advanceTimersByTimeAsync(25);
    await assertion;
  });
});
