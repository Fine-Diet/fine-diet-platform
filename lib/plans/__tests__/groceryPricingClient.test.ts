import {
  fetchConfirmGroceryPrice,
  fetchGroceryHaulSummary,
  fetchGroceryPriceSearch,
  fetchManualGroceryPrice,
} from '../groceryPricingClient';

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('groceryPricingClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns search results for 200 and 502', async () => {
    const payload = {
      provider: 'serpapi',
      search_event_id: 'event-1',
      outcome: 'provider_error',
      offers: [],
      quota: { remaining: 1 },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(502, payload));

    await expect(
      fetchGroceryPriceSearch('item-1', { retailer: 'Target', postal_code: '94110' }),
    ).resolves.toEqual(payload);
  });

  it('throws quota error on 429', async () => {
    const quota = {
      tier: 'demo',
      access_mode: 'demo',
      limit: 5,
      used: 5,
      remaining: 0,
      reset_at: null,
      consumed_this_request: false,
      upgrade_required: true,
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse(429, { error: 'Quota exceeded', quota }),
    );

    try {
      await fetchGroceryPriceSearch('item-1', { retailer: 'Target', postal_code: '94110' });
      throw new Error('expected rejection');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : 'unknown';
      expect({ name, message }).toEqual({
        name: 'GroceryPriceQuotaExceededClientError',
        message: 'Quota exceeded',
      });
    }
  });

  it('confirms sourced price and returns observation', async () => {
    const observation = { id: 'obs-1', line_total: 4.99, currency: 'USD' };
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { observation }));

    await expect(
      fetchConfirmGroceryPrice('item-1', {
        search_event_id: 'event-1',
        provider_result_id: 'result-1',
        package_count: 1,
        replace_manual: true,
      }),
    ).resolves.toEqual(observation);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/journal/plans/grocery-items/item-1/price-confirm',
      expect.objectContaining({
        body: JSON.stringify({
          search_event_id: 'event-1',
          provider_result_id: 'result-1',
          package_count: 1,
          replace_manual: true,
        }),
      }),
    );
  });

  it('throws manual replace required error on 409', async () => {
    const currentObservation = {
      id: 'obs-manual',
      source: 'manual',
      line_total: 4.5,
      currency: 'USD',
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse(409, {
        error: 'A manual price is already recorded for this item.',
        code: 'manual_replace_required',
        current_observation: currentObservation,
      }),
    );

    await expect(
      fetchConfirmGroceryPrice('item-1', {
        search_event_id: 'event-1',
        provider_result_id: 'result-1',
      }),
    ).rejects.toMatchObject({
      name: 'GroceryPriceManualReplaceRequiredError',
      currentObservation,
    });
  });

  it('saves manual price and returns observation', async () => {
    const observation = { id: 'obs-2', line_total: 3.5, currency: 'USD' };
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { observation }));

    await expect(
      fetchManualGroceryPrice('item-1', { unit_price: 3.5 }),
    ).resolves.toEqual(observation);
  });

  it('loads haul summary bundle with persisted observations', async () => {
    const summary = { grocery_list_id: 'list-1', estimated_total: 10, currency: 'USD' };
    const observations_by_match_key = {
      'food-1::cup': { id: 'obs-1', match_key: 'food-1::cup', line_total: 10, currency: 'USD' },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { summary, observations_by_match_key }));

    await expect(fetchGroceryHaulSummary('plan-1', 'list-1')).resolves.toEqual({
      summary,
      observations_by_match_key,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/journal/plans/plan-1/grocery/haul-summary?grocery_list_id=list-1',
      { credentials: 'include' },
    );
  });
});
