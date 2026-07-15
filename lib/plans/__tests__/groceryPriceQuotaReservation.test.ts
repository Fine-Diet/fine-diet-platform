import { reserveGroceryPriceSearchQuota, setClaimGroceryPriceQuotaOverride } from '../groceryPriceQuotaReservation';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

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
    setClaimGroceryPriceQuotaOverride(null);
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
