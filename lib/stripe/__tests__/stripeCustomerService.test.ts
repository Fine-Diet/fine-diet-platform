/** Account-scoped customer regression tests; synthetic data, no external calls. */
const mockFrom = jest.fn();
const mockCreate = jest.fn();
const mockContext = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({ supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) } }));
jest.mock('../stripeServer', () => ({ stripe: { customers: { create: (...args: unknown[]) => mockCreate(...args) } } }));
jest.mock('../stripeAccountContext', () => ({ getStripeAccountContext: () => mockContext() }));
import { findStripeCustomerForPerson, ensureStripeCustomerForPerson } from '../stripeCustomerService';

interface CustomerRow { person_id: string; stripe_account_id: string; livemode: boolean; stripe_customer_id: string; email?: string; }
let rows: CustomerRow[];
let readError: boolean;
let writeError: boolean;
let dropWrites: boolean;
let conflictingWrite: boolean;
let scope: { accountId: string; livemode: boolean };
const writes = jest.fn();
function customerTable(table: string) {
  expect(table).toBe('stripe_customer_accounts');
  const filters: Array<[string, unknown]> = [];
  const chain = {
    select: () => chain,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
    maybeSingle: async () => {
      if (readError) return { data: null, error: new Error('read_failed') };
      const found = rows.find(row => filters.every(([key,value]) => (row as unknown as Record<string,unknown>)[key] === value));
      return { data: found ? { stripe_customer_id: found.stripe_customer_id } : null, error: null };
    },
    upsert: async (row: CustomerRow, options: unknown) => {
      writes(row, options);
      if (writeError) return { error: new Error('write_failed') };
      const existing = rows.find(r => r.person_id === row.person_id && r.stripe_account_id === row.stripe_account_id && r.livemode === row.livemode);
      if (!existing && !dropWrites) rows.push({ ...row, ...(conflictingWrite ? { stripe_customer_id: 'cus_Competing' } : {}) });
      return { error: null };
    },
  };
  return chain;
}
beforeEach(() => {
  jest.resetAllMocks();
  rows = []; readError = false; writeError = false; dropWrites = false; conflictingWrite = false;
  scope = { accountId: 'acct_Sandbox', livemode: false };
  mockContext.mockImplementation(() => scope);
  mockFrom.mockImplementation(customerTable);
  mockCreate.mockResolvedValue({ id: 'cus_Created' });
});
describe('Stripe customer identity isolation', () => {
  it('returns only the customer for the selected account and mode', async () => {
    rows.push(
      { person_id: 'person_a', stripe_account_id: 'acct_Sandbox', livemode: false, stripe_customer_id: 'cus_Test' },
      { person_id: 'person_a', stripe_account_id: 'acct_Live', livemode: true, stripe_customer_id: 'cus_Live' },
    );
    expect(await findStripeCustomerForPerson('person_a')).toBe('cus_Test');
    scope = { accountId: 'acct_Live', livemode: true };
    expect(await findStripeCustomerForPerson('person_a')).toBe('cus_Live');
    expect(mockCreate).not.toHaveBeenCalled();
  });
  it('does not reuse a customer from another person, account, or mode', async () => {
    rows.push(
      { person_id: 'person_b', stripe_account_id: 'acct_Sandbox', livemode: false, stripe_customer_id: 'cus_OtherPerson' },
      { person_id: 'person_a', stripe_account_id: 'acct_Other', livemode: false, stripe_customer_id: 'cus_OtherAccount' },
      { person_id: 'person_a', stripe_account_id: 'acct_Sandbox', livemode: true, stripe_customer_id: 'cus_OtherMode' },
    );
    expect(await findStripeCustomerForPerson('person_a')).toBeNull();
  });
  it('never creates a Stripe customer during a read-only lookup', async () => {
    expect(await findStripeCustomerForPerson('person_a')).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });
  it('fails closed on missing deployment context', async () => {
    mockContext.mockImplementation(() => { throw new Error('missing_context'); });
    await expect(ensureStripeCustomerForPerson('person_a', 'a@example.invalid')).rejects.toThrow('missing_context');
    expect(mockFrom).not.toHaveBeenCalled(); expect(mockCreate).not.toHaveBeenCalled();
  });
  it('fails closed on a lookup error instead of making another customer', async () => {
    readError = true;
    await expect(ensureStripeCustomerForPerson('person_a', 'a@example.invalid')).rejects.toThrow('read_failed');
    expect(mockCreate).not.toHaveBeenCalled();
  });
  it('reuses an existing scoped customer without writes', async () => {
    rows.push({ person_id: 'person_a', stripe_account_id: 'acct_Sandbox', livemode: false, stripe_customer_id: 'cus_Existing' });
    expect(await ensureStripeCustomerForPerson('person_a', 'a@example.invalid')).toBe('cus_Existing');
    expect(mockCreate).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });
  it('creates and verifies a deterministic account-and-mode-scoped mapping', async () => {
    expect(await ensureStripeCustomerForPerson('person_a', 'a@example.invalid')).toBe('cus_Created');
    expect(mockCreate).toHaveBeenCalledWith(
      { email: 'a@example.invalid', metadata: { person_id: 'person_a' } },
      { idempotencyKey: 'fd-customer-acct_Sandbox-false-person_a' },
    );
    expect(writes).toHaveBeenCalledWith(expect.objectContaining({ stripe_account_id: 'acct_Sandbox', livemode: false }),
      { onConflict: 'person_id,stripe_account_id,livemode', ignoreDuplicates: true });
    expect(rows).toHaveLength(1);
  });
  it('propagates Stripe creation failure without a database mapping', async () => {
    mockCreate.mockRejectedValue(new Error('stripe_unavailable'));
    await expect(ensureStripeCustomerForPerson('person_a', 'a@example.invalid')).rejects.toThrow('stripe_unavailable');
    expect(writes).not.toHaveBeenCalled();
  });
  it('does not claim success when persistence fails', async () => {
    writeError = true;
    await expect(ensureStripeCustomerForPerson('person_a', 'a@example.invalid')).rejects.toThrow('write_failed');
  });
  it('requires a verified mapping after persistence', async () => {
    dropWrites = true;
    await expect(ensureStripeCustomerForPerson('person_a', 'a@example.invalid')).rejects.toThrow('could not be verified');
  });
  it('does not overwrite a conflicting concurrent mapping', async () => {
    conflictingWrite = true;
    await expect(ensureStripeCustomerForPerson('person_a', 'a@example.invalid')).rejects.toThrow('Conflicting');
    expect(rows[0].stripe_customer_id).toBe('cus_Competing');
  });
  it('uses the same idempotency key when concurrent calls create the same mapping', async () => {
    const result = await Promise.all(Array.from({ length: 5 }, () => ensureStripeCustomerForPerson('person_a', 'a@example.invalid')));
    expect(result).toEqual(Array(5).fill('cus_Created'));
    expect(rows).toHaveLength(1);
    expect(new Set(mockCreate.mock.calls.map(call => call[1].idempotencyKey)).size).toBe(1);
  });
});
