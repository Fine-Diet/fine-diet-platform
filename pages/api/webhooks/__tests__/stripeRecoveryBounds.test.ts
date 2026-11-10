/** Recovery bounds: synthetic provider/DB fixtures, no network or credentials. */
import type { NextApiRequest, NextApiResponse } from 'next';
const mockFrom = jest.fn();
const mockRetrieve = jest.fn();
const mockEvent = jest.fn();
const mockComplete = jest.fn();
const mockRelease = jest.fn();
jest.mock('micro', () => ({ buffer: async () => Buffer.from('fixture') }));
jest.mock('@/lib/stripe/stripeServer', () => ({ stripe: {
  webhooks: { constructEvent: () => mockEvent() },
  subscriptions: { retrieve: (...args: unknown[]) => mockRetrieve(...args) },
} }));
jest.mock('@/lib/stripe/stripeAccountContext', () => ({ getStripeAccountContext: () => ({ accountId: 'acct_Fixture', livemode: false }) }));
jest.mock('@/lib/stripe/stripeWebhookEventStore', () => ({
  claimStripeEvent: async () => ({ status: 'claimed', token: 'fixture_token' }),
  completeStripeEvent: (...args: unknown[]) => mockComplete(...args),
  releaseStripeEvent: (...args: unknown[]) => mockRelease(...args),
}));
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));
jest.mock('@/lib/plans/programAssignmentAutomationServerService', () => ({ handleStripeCheckoutCompleted: async () => ({ action: 'skipped_unmapped' }) }));
jest.mock('@/lib/access/offerEntitlementMappings', () => ({ resolveEffectiveOfferEntitlementMappings: (_key: string, rows: unknown[]) => rows }));

type Row = Record<string, unknown>;
let purchase: Row;
let rows: Row[];
let provider: Row;
let failRecovery: boolean;
let handler: typeof import('@/pages/api/webhooks/stripe').default;
const priorSecret = process.env.STRIPE_WEBHOOK_SECRET;
const started = '2026-01-01T00:00:00.000Z';

function builder(table: string) {
  let operation = 'select'; let payload: Row = {}; let returning = false; let single = false;
  const filters: Array<[string, unknown]> = [];
  const matches = (row: Row) => filters.every(([key, value]) => row[key] === value);
  const execute = () => {
    if (table === 'offer_entitlements') return { data: [{ entitlement_key: 'journal', duration_days: 30, is_active: true }], error: null };
    const tableRows = table === 'stripe_offer_instances' ? [purchase] : table === 'person_entitlements' ? rows : null;
    if (!tableRows) throw new Error(`Unexpected fixture table ${table}`);
    const found = tableRows.filter(matches);
    if (operation === 'select') return { data: single ? (found[0] ? { ...found[0] } : null) : found.map(row => ({ ...row })), error: null };
    if (operation === 'update') {
      if (table === 'person_entitlements' && payload.is_active === true && failRecovery) return { data: null, error: { code: 'XX000', message: 'fixture_recovery_write_failed' } };
      found.forEach(row => Object.assign(row, payload));
      return { data: returning ? found.map(row => ({ id: row.id })) : null, error: null };
    }
    rows.push({ id: `new_${rows.length}`, ...payload });
    return { data: null, error: null };
  };
  const chain = {
    select: (_fields?: string) => { returning = operation !== 'select'; return chain; },
    eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
    insert: (data: Row) => { operation = 'insert'; payload = data; return chain; },
    update: (data: Row) => { operation = 'update'; payload = data; return chain; },
    maybeSingle: () => { single = true; return Promise.resolve(execute()); },
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(execute).then(resolve, reject),
  };
  return chain;
}
async function deliver(type = 'invoice.paid') {
  mockEvent.mockReturnValue({ id: 'evt_bounds', type, livemode: false, created: 1762000000,
    data: { object: { id: 'in_current', parent: { subscription_details: { subscription: 'sub_fixture' } } } } });
  const response = {
    statusCode: 200, body: undefined as unknown,
    status(code: number) { response.statusCode = code; return response; },
    json(body: unknown) { response.body = body; return response; },
    end() { return response; }, setHeader: jest.fn(),
  };
  await handler({ method: 'POST', headers: { 'stripe-signature': 'fixture_signature' } } as NextApiRequest, response as unknown as NextApiResponse);
  return response;
}
function ownGrant(endsAt: string | null) {
  return { id: 'ent_original', person_id: 'person_fixture', entitlement_key: 'journal',
    source: 'stripe', source_ref: 'sub_fixture', is_active: false, starts_at: started, ends_at: endsAt };
}
beforeAll(() => { process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture_bounds'; handler = require('@/pages/api/webhooks/stripe').default; });
afterAll(() => { if (priorSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = priorSecret; });
beforeEach(() => {
  jest.resetAllMocks(); jest.spyOn(console, 'error').mockImplementation(() => {});
  purchase = { id: 'instance_fixture', person_id: 'person_fixture', offer_key: 'fine-diet-method',
    stripe_customer_id: 'cus_fixture', stripe_subscription_id: 'sub_fixture', status: 'canceled' };
  rows = []; failRecovery = false;
  provider = { id: 'sub_fixture', livemode: false, customer: 'cus_fixture', status: 'active',
    latest_invoice: { id: 'in_current', status: 'paid' }, metadata: { person_id: 'person_fixture', offer_key: 'fine-diet-method' } };
  mockRetrieve.mockImplementation(async () => provider); mockFrom.mockImplementation(builder);
  mockComplete.mockResolvedValue(undefined); mockRelease.mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('same-purchase recovery bounds', () => {
  it('reactivates the original grant without extending its deadline or start date', async () => {
    const deadline = new Date(Date.now() + 86400000).toISOString(); rows = [ownGrant(deadline)];
    expect((await deliver()).statusCode).toBe(200);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ id: 'ent_original', is_active: true, starts_at: started, ends_at: deadline });
    expect((await deliver()).statusCode).toBe(200); expect(rows).toHaveLength(1);
  });
  it('does not reactivate an already expired fixed-duration grant', async () => {
    rows = [ownGrant('2020-01-01T00:00:00.000Z')];
    expect((await deliver()).statusCode).toBe(200); expect(rows).toHaveLength(1); expect(rows[0].is_active).toBe(false);
  });
  it('suspends only this purchase and preserves expiry for later recovery', async () => {
    const deadline = new Date(Date.now() + 86400000).toISOString();
    rows = [{ ...ownGrant(deadline), is_active: true }, { ...ownGrant(null), id: 'ent_other', source_ref: 'sub_other', is_active: true }];
    purchase.status = 'active'; provider.status = 'past_due'; provider.latest_invoice = { id: 'in_current', status: 'open' };
    expect((await deliver('invoice.payment_failed')).statusCode).toBe(200);
    expect(rows[0]).toMatchObject({ is_active: false, ends_at: deadline }); expect(rows[1].is_active).toBe(true);
    provider.status = 'active'; provider.latest_invoice = { id: 'in_current', status: 'paid' };
    expect((await deliver()).statusCode).toBe(200); expect(rows[0]).toMatchObject({ is_active: true, ends_at: deadline }); expect(rows).toHaveLength(2);
  });
  it('does not acknowledge a failed reactivation write', async () => {
    rows = [ownGrant(null)]; failRecovery = true;
    expect((await deliver()).statusCode).toBe(500); expect(rows[0].is_active).toBe(false);
    expect(mockComplete).not.toHaveBeenCalled(); expect(mockRelease).toHaveBeenCalled();
  });
});
