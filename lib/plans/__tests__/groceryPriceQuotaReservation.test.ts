import { reserveGroceryPriceSearchQuota, setClaimGroceryPriceQuotaOverride } from '../groceryPriceQuotaReservation';
import { __resetPersonSearchLocksForTests } from '../groceryPriceQuotaLock';

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

import { GroceryPriceQuotaExceededError } from '../groceryPriceQuota';

describe('groceryPriceQuotaReservation concurrency', () => {
  beforeEach(() => {
    __resetPersonSearchLocksForTests();
    setClaimGroceryPriceQuotaOverride(null);
  });

  it('serializes concurrent claims so only one pending claim is issued at a time', async () => {
    let active = 0;
    let maxActive = 0;
    let claimCount = 0;

    setClaimGroceryPriceQuotaOverride(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      claimCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return `claim-${claimCount}`;
    });

    const [first, second] = await Promise.all([
      reserveGroceryPriceSearchQuota('person-1'),
      reserveGroceryPriceSearchQuota('person-1'),
    ]);

    expect(first.claimId).toBe('claim-1');
    expect(second.claimId).toBe('claim-2');
    expect(maxActive).toBe(1);
  });

  it('throws when claim slot is unavailable', async () => {
    setClaimGroceryPriceQuotaOverride(async () => null);
    await expect(reserveGroceryPriceSearchQuota('person-1')).rejects.toThrow(
      'Grocery price search quota exceeded',
    );
  });
});
