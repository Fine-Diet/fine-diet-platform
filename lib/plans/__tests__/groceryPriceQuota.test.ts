import { readFileSync } from 'fs';
import { join } from 'path';
import { buildGroceryPriceSearchQuota, resolveGroceryPriceSearchTier } from '../groceryPriceQuota';

jest.mock('@/lib/access/accessService', () => ({
  hasEntitlement: jest.fn(),
}));

jest.mock('../groceryPriceStore', () => ({
  countBilledGroceryPriceSearches: jest.fn(),
}));

import { hasEntitlement } from '@/lib/access/accessService';
import { countBilledGroceryPriceSearches } from '../groceryPriceStore';

const mockHasEntitlement = hasEntitlement as jest.MockedFunction<typeof hasEntitlement>;
const mockCountBilled = countBilledGroceryPriceSearches as jest.MockedFunction<
  typeof countBilledGroceryPriceSearches
>;

describe('groceryPriceQuota', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses demo lifetime quota for users without premium entitlement', async () => {
    mockHasEntitlement.mockResolvedValue(false);
    mockCountBilled.mockResolvedValue(1);
    const tier = await resolveGroceryPriceSearchTier('person-1');
    const quota = await buildGroceryPriceSearchQuota({ personId: 'person-1' });
    expect(tier).toBe('demo');
    expect(quota).toMatchObject({
      tier: 'demo',
      limit: 2,
      used: 1,
      remaining: 1,
      reset_at: null,
      upgrade_required: false,
    });
  });

  it('uses premium monthly quota with reset date for entitled users', async () => {
    mockHasEntitlement.mockResolvedValue(true);
    mockCountBilled.mockResolvedValue(49);
    const quota = await buildGroceryPriceSearchQuota({ personId: 'person-1' });
    expect(quota.tier).toBe('premium');
    expect(quota.limit).toBe(50);
    expect(quota.remaining).toBe(1);
    expect(quota.reset_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('createGroceryPriceSearchTables.sql', () => {
  it('references people.id and uses auth_user_id RLS boundary', () => {
    const sql = readFileSync(
      join(process.cwd(), 'scripts/sql/createGroceryPriceSearchTables.sql'),
      'utf8',
    );
    expect(sql).toContain('REFERENCES public.people(id)');
    expect(sql).toContain('auth_user_id = auth.uid()');
    expect(sql).toContain('WITH CHECK');
    expect(sql).toContain('grocery_price_search_events');
    expect(sql).toContain('claim_grocery_price_search_quota');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('p_claim_ttl_seconds');
    expect(sql).toContain('expires_at > now()');
    expect(sql).toMatch(
      /grocery_price_search_events[\s\S]*plan_id UUID REFERENCES public\.plans\(id\) ON DELETE SET NULL/,
    );
  });
});
