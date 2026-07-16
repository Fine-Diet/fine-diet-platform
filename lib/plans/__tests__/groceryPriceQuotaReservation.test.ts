import { reserveGroceryPriceSearchQuota, setClaimGroceryPriceQuotaOverride } from '../groceryPriceQuotaReservation';
import { GROCERY_PRICE_QUOTA_CLAIM_TTL_SECONDS } from '../groceryPricingConfig';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';

const mockRpc = supabaseAdmin.rpc as jest.Mock;

jest.mock('../groceryPriceQuota', () => {
  const actual = jest.requireActual('../groceryPriceQuota');
  return {
    ...actual,
    resolveGroceryPriceSearchTier: jest.fn().mockResolvedValue('demo'),
    buildGroceryPriceSearchQuota: jest.fn().mockResolvedValue({
      tier: 'demo',
      access_mode: 'demo',
      limit: 2,
      used: 2,
      remaining: 0,
      reset_at: null,
      consumed_this_request: false,
      upgrade_required: true,
    }),
  };
});

describe('groceryPriceQuotaReservation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setClaimGroceryPriceQuotaOverride(null);
    mockRpc.mockResolvedValue({ data: 'claim-1', error: null });
  });

  it('passes configurable claim TTL to the database claim function', async () => {
    await reserveGroceryPriceSearchQuota('person-1');
    expect(mockRpc).toHaveBeenCalledWith('claim_grocery_price_search_quota', {
      p_person_id: 'person-1',
      p_window_key: 'lifetime',
      p_limit: 2,
      p_claim_ttl_seconds: GROCERY_PRICE_QUOTA_CLAIM_TTL_SECONDS,
    });
  });

  it('relies on database claim function rather than process-local locking', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    setClaimGroceryPriceQuotaOverride(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent -= 1;
      return 'claim-1';
    });

    await Promise.all([
      reserveGroceryPriceSearchQuota('person-1'),
      reserveGroceryPriceSearchQuota('person-1'),
    ]);

    expect(maxConcurrent).toBeGreaterThan(1);
  });

  it('throws when claim slot is unavailable', async () => {
    setClaimGroceryPriceQuotaOverride(async () => null);
    await expect(reserveGroceryPriceSearchQuota('person-1')).rejects.toThrow(
      'Grocery price search quota exceeded',
    );
  });
});
