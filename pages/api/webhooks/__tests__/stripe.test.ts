/** Route regressions and lifecycle scenarios. Synthetic Stripe/Supabase only. */
import type { NextApiRequest, NextApiResponse } from 'next';

const mockBuffer = jest.fn();
const mockConstructEvent = jest.fn();
const mockSessionRetrieve = jest.fn();
const mockSubscriptionRetrieve = jest.fn();
const mockClaim = jest.fn();
const mockComplete = jest.fn();
const mockRelease = jest.fn();
const mockContext = jest.fn();
const mockAssign = jest.fn();
const mockFrom = jest.fn();
jest.mock('micro', () => ({ buffer: (...args: unknown[]) => mockBuffer(...args) }));
jest.mock('@/lib/stripe/stripeServer', () => ({
  stripe: {
    webhooks: { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) },
    checkout: { sessions: { retrieve: (...args: unknown[]) => mockSessionRetrieve(...args) } },
    subscriptions: { retrieve: (...args: unknown[]) => mockSubscriptionRetrieve(...args) },
  },
}));
jest.mock('@/lib/stripe/stripeAccountContext', () => ({ getStripeAccountContext: () => mockContext() }));
jest.mock('@/lib/stripe/stripeWebhookEventStore', () => ({
  claimStripeEvent: (...args: unknown[]) => mockClaim(...args),
  completeStripeEvent: (...args: unknown[]) => mockComplete(...args),
  releaseStripeEvent: (...args: unknown[]) => mockRelease(...args),
}));
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));
jest.mock('@/lib/plans/programAssignmentAutomationServerService', () => ({ handleStripeCheckoutCompleted: (...args: unknown[]) => mockAssign(...args) }));
jest.mock('@/lib/access/offerEntitlementMappings', () => ({ resolveEffectiveOfferEntitlementMappings: (_key: string, rows: unknown[]) => rows }));

type Row = Record<string, unknown>;
type Operation = 'select' | 'insert' | 'update';
interface Query { table: string; operation: Operation; payload?: Row; filters: Array<[string, unknown]>; single: boolean; returning: boolean; }
let failures: Record<string, boolean>;
let zeroUpdates: boolean;
let failEntitlement: string | null;
let entitlements: Row[];
let mappings: Row[];
let queries: Query[];
let instance: Row | null;
let currentSession: Row;
let currentSubscription: Row;
let event: { id: string; type: string; created: number; livemode: boolean; account?: string; data: { object: Row } };
let handler: typeof import('@/pages/api/webhooks/stripe').default;
const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

function execute(query: Query): { data: unknown; error: unknown } {
  queries.push({ ...query, filters: [...query.filters] });
  if (failures[`${query.table}:${query.operation}`] ||
      (query.table === 'person_entitlements' && query.operation === 'insert' && query.payload?.entitlement_key === failEntitlement)) {
    return { data: null, error: { code: 'XX000', message: 'fixture_database_failure' } };
  }
  if (query.table === 'stripe_offer_instances') {
    const matched = instance && query.filters.every(([key, value]) => instance![key] === value);
    if (query.operation === 'select') return { data: matched ? { ...instance } : null, error: null };
    if (matched && !zeroUpdates) Object.assign(instance!, query.payload);
    return { data: query.returning ? (matched && !zeroUpdates ? [{ id: instance!.id }] : []) : null, error: null };
  }
  if (query.table === 'offer_entitlements') return { data: mappings, error: null };
  if (query.table === 'person_entitlements') {
    const matching = entitlements.filter(row => query.filters.every(([key, value]) => row[key] === value));
    if (query.operation === 'select') return { data: query.single ? (matching[0] ?? null) : matching, error: null };
    if (query.operation === 'insert') entitlements.push({ id: `ent_${entitlements.length}`, ...query.payload });
    if (query.operation === 'update') matching.forEach(row => Object.assign(row, query.payload));
    return { data: query.returning ? matching.map(row => ({ id: row.id })) : null, error: null };
  }
  if (query.table === 'checkout_events') return { data: null, error: null };
  throw new Error(`Unexpected fixture table: ${query.table}`);
}
function builder(table: string) {
  const query: Query = { table, operation: 'select', filters: [], single: false, returning: false };
  const chain = {
    select: (_fields?: string) => { query.returning = query.operation !== 'select'; return chain; },
    eq: (key: string, value: unknown) => { query.filters.push([key, value]); return chain; },
    insert: (payload: Row) => { query.operation = 'insert'; query.payload = payload; return chain; },
    update: (payload: Row) => { query.operation = 'update'; query.payload = payload; return chain; },
    maybeSingle: () => { query.single = true; return Promise.resolve(execute(query)); },
    single: () => { query.single = true; return Promise.resolve(execute(query)); },
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(() => execute(query)).then(resolve, reject),
  };
  return chain;
}
function request(method = 'POST'): NextApiRequest {
  return { method, headers: { 'stripe-signature': 'fixture_signature' }, body: {} } as NextApiRequest;
}
function response() {
  const res = {
    statusCode: 200, body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
    end(body?: string) { res.body = body; return res; }, setHeader: jest.fn(),
  };
  return res as typeof res & NextApiResponse;
}
function subscriptionEvent(type: string) {
  event.type = type;
  event.data.object = type.startsWith('customer.subscription.')
    ? { id: 'sub_fixture' }
    : { id: 'in_fixture', parent: { subscription_details: { subscription: 'sub_fixture' } } };
  if (type === 'customer.subscription.deleted') currentSubscription.status = 'canceled';
  if (type === 'invoice.payment_failed') {
    currentSubscription.status = 'past_due'; currentSubscription.latest_invoice = { id: 'in_fixture', status: 'open' };
  }
}
function seedEntitlement() {
  entitlements.push({ id: 'ent_existing', person_id: 'person_fixture', entitlement_key: 'journal', source: 'stripe', source_ref: 'sub_fixture', is_active: true, ends_at: null });
}
function activeGrants() { return entitlements.filter(row => row.is_active); }

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_isolated_fixture';
  handler = require('@/pages/api/webhooks/stripe').default;
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
});
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  failures = {}; zeroUpdates = false; failEntitlement = null; entitlements = []; queries = [];
  mappings = [{ entitlement_key: 'journal', duration_days: null, is_active: true }];
  const metadata = { person_id: 'person_fixture', offer_key: 'fine-diet-method', billing_model: 'subscription' };
  currentSession = { id: 'cs_test_fixture', mode: 'subscription', status: 'complete', payment_status: 'paid', livemode: false, customer: 'cus_fixture', subscription: 'sub_fixture', metadata: { ...metadata } };
  currentSubscription = { id: 'sub_fixture', status: 'active', livemode: false, customer: 'cus_fixture', latest_invoice: { id: 'in_fixture', status: 'paid' }, metadata: { ...metadata }, cancel_at_period_end: false };
  instance = { id: 'instance_fixture', person_id: 'person_fixture', offer_key: 'fine-diet-method', status: 'pending', stripe_customer_id: 'cus_fixture', stripe_checkout_session_id: 'cs_test_fixture', stripe_subscription_id: 'sub_fixture', stripe_payment_intent_id: null };
  event = { id: 'evt_fixture', type: 'checkout.session.completed', created: 1762000000, livemode: false, data: { object: { ...currentSession, metadata: { ...metadata } } } };
  mockBuffer.mockResolvedValue(Buffer.from('fixture_raw_body'));
  mockConstructEvent.mockImplementation(() => event);
  mockSessionRetrieve.mockImplementation(async () => currentSession);
  mockSubscriptionRetrieve.mockImplementation(async () => currentSubscription);
  mockContext.mockReturnValue({ accountId: 'acct_Fixture', livemode: false });
  mockClaim.mockResolvedValue({ status: 'claimed', token: 'token_fixture' });
  mockComplete.mockResolvedValue(undefined); mockRelease.mockResolvedValue(undefined);
  mockAssign.mockResolvedValue({ action: 'skipped_unmapped' }); mockFrom.mockImplementation(builder);
});
afterEach(() => jest.restoreAllMocks());

describe('Stripe webhook route failure and isolation contracts', () => {
  it('rejects non-POST without claiming an event', async () => {
    const res = response(); await handler(request('GET'), res);
    expect(res.statusCode).toBe(405); expect(mockClaim).not.toHaveBeenCalled();
  });
  it('rejects a missing signature without side effects', async () => {
    const req = request(); req.headers = {}; const res = response(); await handler(req, res);
    expect(res.statusCode).toBe(400); expect(mockClaim).not.toHaveBeenCalled();
  });
  it('verifies the raw body and rejects invalid signatures', async () => {
    mockConstructEvent.mockImplementation(() => { throw new Error('invalid_signature'); });
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(400); expect(mockClaim).not.toHaveBeenCalled();
    expect(mockConstructEvent).toHaveBeenCalledWith(Buffer.from('fixture_raw_body'), 'fixture_signature', 'whsec_isolated_fixture');
  });
  it('rejects a live event on a sandbox deployment before receipt writes', async () => {
    event.livemode = true; const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(400); expect(mockClaim).not.toHaveBeenCalled(); expect(queries).toHaveLength(0);
  });
  it('rejects an event explicitly attributed to a different Stripe account', async () => {
    event.account = 'acct_Other'; const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(400); expect(mockClaim).not.toHaveBeenCalled();
  });
  it('fails closed when deployment context is missing', async () => {
    mockContext.mockImplementation(() => { throw new Error('missing_context'); }); const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(503); expect(mockClaim).not.toHaveBeenCalled();
  });
  it('returns retryable failure while another worker holds the event', async () => {
    mockClaim.mockRejectedValue(new Error('busy')); const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(503); expect(queries).toHaveLength(0);
  });
  it('acknowledges a previously completed duplicate without business writes', async () => {
    mockClaim.mockResolvedValue({ status: 'processed' }); const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(200); expect(queries).toHaveLength(0); expect(mockComplete).not.toHaveBeenCalled();
  });
  it('completes the receipt only after the purchased access is granted', async () => {
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(200); expect(entitlements).toHaveLength(1);
    expect(mockComplete).toHaveBeenCalledWith('evt_fixture', 'token_fixture', expect.anything()); expect(mockRelease).not.toHaveBeenCalled();
  });
  it.each([
    ['stripe_offer_instances', 'update'], ['offer_entitlements', 'select'],
    ['person_entitlements', 'select'], ['person_entitlements', 'insert'],
    ['checkout_events', 'select'], ['checkout_events', 'insert'],
  ])('does not acknowledge a failed %s %s operation', async (table, operation) => {
    failures[`${table}:${operation}`] = true; const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500); expect(mockComplete).not.toHaveBeenCalled(); expect(mockRelease).toHaveBeenCalledWith('evt_fixture', 'token_fixture', expect.anything());
  });
  it('does not grant access when the checkout instance update matches no row', async () => {
    zeroUpdates = true; const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500); expect(entitlements).toHaveLength(0); expect(mockComplete).not.toHaveBeenCalled();
  });
  it('retries a program assignment that reports a database error', async () => {
    mockAssign.mockResolvedValue({ action: 'skipped_error', reason: 'fixture_assignment_failure' }); const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500); expect(mockComplete).not.toHaveBeenCalled(); expect(mockRelease).toHaveBeenCalled();
  });
  it('retries a thrown program assignment error', async () => {
    mockAssign.mockRejectedValue(new Error('fixture_assignment_failure')); const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500); expect(mockComplete).not.toHaveBeenCalled();
  });
  it.each([
    ['customer.subscription.deleted', 'select'], ['customer.subscription.deleted', 'update'],
    ['invoice.payment_failed', 'select'], ['invoice.payment_failed', 'update'],
  ])('retries %s after an instance %s failure', async (type, operation) => {
    subscriptionEvent(type); failures[`stripe_offer_instances:${operation}`] = true; const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500); expect(mockComplete).not.toHaveBeenCalled(); expect(mockRelease).toHaveBeenCalled();
  });
  it.each(['customer.subscription.deleted', 'invoice.payment_failed'])('retries %s after an entitlement revocation failure', async type => {
    subscriptionEvent(type); seedEntitlement(); failures['person_entitlements:update'] = true; const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500); expect(mockComplete).not.toHaveBeenCalled();
  });
  it('does not duplicate an earlier grant when a partial failure is retried', async () => {
    mappings.push({ entitlement_key: 'program:baseline', duration_days: null, is_active: true });
    failEntitlement = 'program:baseline'; const first = response(); await handler(request(), first);
    expect(first.statusCode).toBe(500); expect(entitlements).toHaveLength(1); expect(mockComplete).not.toHaveBeenCalled();
    failEntitlement = null; const second = response(); await handler(request(), second);
    expect(second.statusCode).toBe(200); expect(entitlements).toHaveLength(2);
    expect(entitlements.filter(row => row.entitlement_key === 'journal')).toHaveLength(1);
  });
  it('releases a claim if recording completion fails', async () => {
    mockComplete.mockRejectedValue(new Error('receipt_completion_failed')); const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500); expect(mockRelease).toHaveBeenCalled();
  });
  it('still returns retryable failure when releasing a failed claim also fails', async () => {
    failures['offer_entitlements:select'] = true; mockRelease.mockRejectedValue(new Error('release_failed'));
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(500); expect(mockComplete).not.toHaveBeenCalled();
  });
});

describe('Current-state payment lifecycle', () => {
  it('retrieves current session and subscription instead of trusting the event snapshot', async () => {
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(200); expect(mockSessionRetrieve).toHaveBeenCalledWith('cs_test_fixture', {}, { timeout: 5000 });
    expect(mockSubscriptionRetrieve).toHaveBeenCalledWith('sub_fixture', { expand: ['latest_invoice'] }, { timeout: 5000 });
  });
  it('does not grant on an unpaid completed checkout', async () => {
    currentSession.payment_status = 'unpaid'; event.data.object.payment_status = 'unpaid';
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(0); expect(instance!.status).toBe('pending'); expect(mockAssign).not.toHaveBeenCalled();
  });
  it('uses current unpaid state even when an old snapshot says paid', async () => {
    currentSession.payment_status = 'unpaid'; const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(0);
  });
  it('grants after delayed payment actually succeeds', async () => {
    event.type = 'checkout.session.async_payment_succeeded'; const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(1); expect(instance!.status).toBe('active');
  });
  it('revokes after a confirmed delayed-payment failure', async () => {
    seedEntitlement(); currentSession.payment_status = 'unpaid'; event.type = 'checkout.session.async_payment_failed';
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(0); expect(instance!.status).toBe('canceled');
  });
  it('allows a valid card-required trial without an initial charge', async () => {
    currentSession.payment_status = 'no_payment_required'; currentSubscription.status = 'trialing';
    currentSubscription.trial_end = Date.now() / 1000 + 86400; currentSubscription.latest_invoice = null;
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(1);
  });
  it('does not grant for an expired trial', async () => {
    currentSession.payment_status = 'no_payment_required'; currentSubscription.status = 'trialing'; currentSubscription.trial_end = 1;
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(0);
  });
  it('restores access after failed payment is recovered and is repeatable', async () => {
    seedEntitlement(); instance!.status = 'active'; subscriptionEvent('invoice.payment_failed');
    const failed = response(); await handler(request(), failed); expect(failed.statusCode).toBe(200); expect(activeGrants()).toHaveLength(0);
    subscriptionEvent('invoice.paid'); currentSubscription.status = 'active'; currentSubscription.latest_invoice = { id: 'in_fixture', status: 'paid' };
    const recovered = response(); await handler(request(), recovered);
    expect(recovered.statusCode).toBe(200); expect(activeGrants()).toHaveLength(1); expect(instance!.status).toBe('active');
    const duplicate = response(); await handler(request(), duplicate); expect(duplicate.statusCode).toBe(200); expect(activeGrants()).toHaveLength(1);
  });
  it('does not revoke recovered access for a delayed failure notification', async () => {
    seedEntitlement(); instance!.status = 'active'; subscriptionEvent('invoice.payment_failed');
    currentSubscription.status = 'active'; currentSubscription.latest_invoice = { id: 'in_new', status: 'paid' };
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(1); expect(instance!.status).toBe('active');
  });
  it('does not reopen a canceled subscription for a delayed paid invoice', async () => {
    subscriptionEvent('invoice.paid'); currentSubscription.status = 'canceled'; instance!.status = 'ended';
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(0); expect(instance!.status).toBe('ended');
  });
  it('does not reopen a locally ended purchase even if a retrieved snapshot says active', async () => {
    instance!.status = 'ended'; const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(0); expect(instance!.status).toBe('ended');
  });
  it('does not treat payment of an older invoice as payment of the current one', async () => {
    subscriptionEvent('invoice.paid'); currentSubscription.status = 'past_due'; currentSubscription.latest_invoice = { id: 'in_new', status: 'open' };
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(0); expect(instance!.status).toBe('canceled');
  });
  it('keeps paid access during cancellation scheduled for period end', async () => {
    subscriptionEvent('customer.subscription.updated'); currentSubscription.cancel_at_period_end = true;
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(1); expect(instance!.status).toBe('active');
  });
  it.each(['paused', 'unpaid', 'incomplete', 'past_due'])('does not grant while current subscription is %s', async status => {
    subscriptionEvent('customer.subscription.updated'); currentSubscription.status = status; seedEntitlement();
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(0); expect(instance!.status).toBe('canceled');
  });
  it('ignores an unrelated service checkout on the shared live account', async () => {
    currentSession.metadata = {}; event.data.object.metadata = {}; instance = null;
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(0); expect(mockAssign).not.toHaveBeenCalled();
    expect(queries.filter(query => query.operation !== 'select')).toHaveLength(0);
  });
  it('ignores an unrelated service subscription without app metadata or purchase record', async () => {
    subscriptionEvent('invoice.paid'); currentSubscription.metadata = {}; instance = null;
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(200); expect(activeGrants()).toHaveLength(0);
    expect(queries.filter(query => query.operation !== 'select')).toHaveLength(0);
  });
  it('retries attributed invoices arriving before their purchase instance is linked', async () => {
    subscriptionEvent('invoice.paid'); instance = null;
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(500); expect(mockComplete).not.toHaveBeenCalled();
  });
  it('rejects partial app attribution rather than treating it as an unrelated payment', async () => {
    currentSession.metadata = { person_id: 'person_fixture' }; event.data.object.metadata = { person_id: 'person_fixture' };
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(500); expect(activeGrants()).toHaveLength(0);
  });
  it('rejects a retrieved session for a different customer', async () => {
    currentSession.customer = 'cus_other'; const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500); expect(activeGrants()).toHaveLength(0);
  });
  it('rejects retrieved subscription attribution that conflicts with the purchase', async () => {
    subscriptionEvent('invoice.paid'); currentSubscription.metadata = { person_id: 'person_other', offer_key: 'fine-diet-method' };
    const res = response(); await handler(request(), res); expect(res.statusCode).toBe(500); expect(activeGrants()).toHaveLength(0);
  });
  it('retries rather than falling back to an old event when Stripe retrieval fails', async () => {
    mockSessionRetrieve.mockRejectedValue(new Error('stripe_unavailable')); const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500); expect(activeGrants()).toHaveLength(0); expect(mockComplete).not.toHaveBeenCalled();
  });
  it('verifies retrieved object mode as well as signed event mode', async () => {
    currentSubscription.livemode = true; const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500); expect(activeGrants()).toHaveLength(0);
  });
});
