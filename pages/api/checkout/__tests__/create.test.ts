/** Actual checkout route + safety validator, synthetic providers only. */
import type { NextApiRequest, NextApiResponse } from 'next';
const mockGetUser = jest.fn(), mockFrom = jest.fn(), mockCovered = jest.fn();
const mockPrice = jest.fn(), mockCustomer = jest.fn(), mockCreate = jest.fn(), mockExpire = jest.fn(), mockResolve = jest.fn();
let live: boolean, offer: any, price: any, mappings: any[], errors: Record<string, unknown>;
let pendingResult: any, writes: Array<{ table: string; value: any }>, order: string[];
jest.mock('@/lib/authServer', () => ({ getCurrentUserWithRoleFromApi: (...args: unknown[]) => mockGetUser(...args) }));
jest.mock('@/lib/supabaseServerClient', () => ({ supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) } }));
jest.mock('@/lib/stripe/stripeAccountContext', () => ({ getStripeAccountContext: () => ({ accountId: 'acct_Fixture', livemode: live }) }));
jest.mock('@/lib/stripe/stripeServer', () => ({ stripe: {
  prices: { retrieve: (...args: unknown[]) => mockPrice(...args) },
  checkout: { sessions: { create: (...args: unknown[]) => mockCreate(...args), expire: (...args: unknown[]) => mockExpire(...args) } },
}, absoluteUrl: (path: string) => `https://app.example.test${path}` }));
jest.mock('@/lib/stripe/stripeCustomerService', () => ({ ensureStripeCustomerForPerson: (...args: unknown[]) => mockCustomer(...args) }));
jest.mock('@/lib/access/effectiveAccess', () => ({ personHasEffectiveEntitlementKeys: (...args: unknown[]) => mockCovered(...args) }));
jest.mock('@/lib/access/priceOptionBillingService', () => ({ resolvePriceOptionBilling: (...args: unknown[]) => mockResolve(...args) }));
jest.mock('@/lib/tracking/sessionId', () => ({ getOrCreateSessionId: () => 'fd_sid_test' }));
import handler from '@/pages/api/checkout/create';
const priorFlag = process.env.STRIPE_ATOMIC_FULFILLMENT;
function query(table: string) {
  const data = () => table === 'people' ? { id: 'person_fixture', email: 'fixture@example.invalid' }
    : table === 'offers' ? offer : table === 'offer_entitlements' ? mappings
    : table === 'stripe_offer_instances' ? pendingResult : null;
  const result = () => ({ data: data(), error: errors[table] || null });
  const chain = { select: (_fields?: string) => chain, eq: (_key: string, _value: unknown) => chain,
    insert: (value: unknown) => { writes.push({ table, value }); order.push(`write:${table}`); return chain; },
    maybeSingle: async () => result(), single: async () => result(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
  return chain;
}
async function request(body: Record<string, unknown> = { offer_key: 'method' }, method = 'POST') {
  const response = { statusCode: 200, body: undefined as any,
    status(code: number) { response.statusCode = code; return response; },
    json(value: unknown) { response.body = value; return response; }, setHeader: jest.fn() };
  await handler({ method, body, query: {}, headers: { referer: 'https://app.example.test/start', 'user-agent': 'jest' } } as NextApiRequest,
    response as unknown as NextApiResponse);
  expect(JSON.stringify(response.body)).not.toMatch(/sk_live|sk_test|whsec_|SERVICE_ROLE|cus_fixture/);
  return response;
}
function noPaymentSideEffects() {
  expect(mockCustomer).not.toHaveBeenCalled(); expect(mockCreate).not.toHaveBeenCalled(); expect(writes).toHaveLength(0);
}
beforeEach(() => {
  jest.resetAllMocks(); jest.spyOn(console, 'error').mockImplementation(() => {});
  delete process.env.STRIPE_ATOMIC_FULFILLMENT;
  live = false; errors = {}; writes = []; order = []; pendingResult = { id: 'purchase_fixture' };
  offer = { offer_key: 'method', name: 'Method', is_active: true, billing_model: 'subscription', stripe_price_id: 'price_Fixture',
    stripe_phase_price_ids: null, stripe_phase_iterations: null, success_path: '/app/log', cancel_path: '/start', trial_period_days: 14 };
  mappings = [{ entitlement_key: 'journal', duration_days: null, is_active: true }];
  price = { id: 'price_Fixture', active: true, livemode: false, type: 'recurring', billing_scheme: 'per_unit', unit_amount: 2499,
    custom_unit_amount: null, transform_quantity: null, product: { id: 'prod_fixture', active: true, livemode: false },
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
  mockGetUser.mockResolvedValue({ id: 'auth_fixture', email: 'fixture@example.invalid' });
  mockCovered.mockResolvedValue({ covered: false, grantSource: 'none' });
  mockPrice.mockImplementation(async () => { order.push('price'); return price; });
  mockCustomer.mockImplementation(async () => { order.push('customer'); return 'cus_fixture'; });
  mockCreate.mockImplementation(async () => { order.push('session'); return { id: 'cs_test_created', url: 'https://checkout.stripe.com/c/pay/cs_test_created' }; });
  mockExpire.mockResolvedValue({ id: 'cs_test_created', status: 'expired' }); mockFrom.mockImplementation(query);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { if (priorFlag === undefined) delete process.env.STRIPE_ATOMIC_FULFILLMENT; else process.env.STRIPE_ATOMIC_FULFILLMENT = priorFlag; });
describe('POST /api/checkout/create pre-charge boundary', () => {
  it('rejects unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue(null); expect((await request()).statusCode).toBe(401); noPaymentSideEffects();
  });
  it('requires offer_key', async () => {
    expect((await request({})).body).toEqual({ error: 'offer_key is required' }); noPaymentSideEffects();
  });
  it('rejects non-POST requests', async () => { expect((await request({}, 'GET')).statusCode).toBe(405); noPaymentSideEffects(); });
  it('returns 409 when caller is already entitled', async () => {
    mockCovered.mockResolvedValue({ covered: true, grantSource: 'entitlement' });
    const response = await request(); expect(response.statusCode).toBe(409); expect(response.body.error).toBe('already_entitled'); noPaymentSideEffects();
  });
  it('creates a checkout session with success URL returning through /checkout/success', async () => {
    const response = await request({ offer_key: 'method', placement: 'home' });
    expect(response.statusCode).toBe(200); expect(response.body).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_created' });
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.success_url).toContain('/checkout/success'); expect(arg.success_url).toContain('session_id={CHECKOUT_SESSION_ID}');
    expect(decodeURIComponent(arg.success_url)).toContain('returnTo=/app/log');
    expect(arg.metadata.person_id).toBe('person_fixture'); expect(arg.subscription_data.trial_period_days).toBe(14);
    expect(arg.payment_method_collection).toBe('always');
    expect(order).toEqual(['price', 'customer', 'write:checkout_events', 'session', 'write:stripe_offer_instances']);
    expect(writes.find(write => write.table === 'stripe_offer_instances')?.value).toMatchObject({ stripe_checkout_session_id: 'cs_test_created', status: 'pending' });
  });
  it.each(['installment', 'intro_then_subscription', 'unexpected'])('blocks legacy %s before customer/session creation', async model => {
    offer.billing_model = model; const response = await request();
    expect(response.statusCode).toBe(409); expect(response.body.error).toBe('billing_model_not_enabled'); noPaymentSideEffects();
  });
  it.each([
    ['phase prices', { stripe_phase_price_ids: ['price_Intro'] }],
    ['phase iterations', { stripe_phase_iterations: [3] }],
    ['empty phase configuration', { stripe_phase_price_ids: [] }],
  ])('rejects legacy %s configuration before any Stripe mutation', async (_label, fields) => {
    Object.assign(offer, fields);
    const response = await request();
    expect(response.statusCode).toBe(409); expect(response.body.error).toBe('billing_schedule_not_enabled');
    expect(mockPrice).not.toHaveBeenCalled(); noPaymentSideEffects();
  });
  it.each(['installment', 'intro_then_subscription'])('blocks a selected %s price option before charge', async model => {
    mockResolve.mockResolvedValue({ ok: true, billing: { billingModel: model, stripePriceId: 'price_Option', trialPeriodDays: null } });
    expect((await request({ offer_key: 'method', price_option_key: 'option_fixture' })).statusCode).toBe(409); noPaymentSideEffects();
  });
  it.each([
    ['phase prices', { stripePhasePriceIds: ['price_Intro'] }],
    ['phase iterations', { stripePhaseIterations: [3] }],
    ['intro price', { introPriceId: 'price_Intro' }],
    ['intro iterations', { introIterations: 2 }],
    ['renewal price', { renewalPriceId: 'price_Renewal' }],
  ])('rejects selected price option with %s before Stripe mutations', async (_label, fields) => {
    mockResolve.mockResolvedValue({ ok: true, billing: { billingModel: 'subscription', stripePriceId: 'price_Option', trialPeriodDays: null, ...fields } });
    const response = await request({ offer_key: 'method', price_option_key: 'option_fixture' });
    expect(response.statusCode).toBe(409); expect(response.body.error).toBe('billing_schedule_not_enabled');
    expect(mockPrice).not.toHaveBeenCalled(); noPaymentSideEffects();
  });
  it('uses the selected server price option, never client price/model fields', async () => {
    mockResolve.mockResolvedValue({ ok: true, billing: { billingModel: 'subscription', stripePriceId: 'price_Option', trialPeriodDays: null } });
    price.id = 'price_Option';
    expect((await request({ offer_key: 'method', price_option_key: 'option_fixture', stripe_price_id: 'price_Attack', billing_model: 'one_time' })).statusCode).toBe(200);
    expect(mockPrice).toHaveBeenCalledWith('price_Option', { expand: ['product'] });
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ mode: 'subscription', line_items: [{ price: 'price_Option', quantity: 1 }] });
    expect(mockCreate.mock.calls[0][0].subscription_data.trial_period_days).toBeUndefined();
  });
  it.each(['not_found', 'offer_mismatch', 'inactive'])('does not charge for %s price option', async error => {
    mockResolve.mockResolvedValue({ ok: false, error });
    expect((await request({ offer_key: 'method', price_option_key: 'option_fixture' })).statusCode).toBe(error === 'not_found' ? 404 : 400); noPaymentSideEffects();
  });
  it('blocks live checkout before atomic fulfillment is enabled', async () => {
    live = true; expect((await request()).statusCode).toBe(503); expect(mockPrice).not.toHaveBeenCalled(); noPaymentSideEffects();
  });
  it('permits a matching live price only with atomic fulfillment enabled in the fixture', async () => {
    live = true; price.livemode = true; price.product.livemode = true; process.env.STRIPE_ATOMIC_FULFILLMENT = '1';
    expect((await request()).statusCode).toBe(200);
  });
  it('rejects sandbox price in a live context', async () => {
    live = true; process.env.STRIPE_ATOMIC_FULFILLMENT = '1'; expect((await request()).statusCode).toBe(503); noPaymentSideEffects();
  });
  it.each([
    ['inactive', (p: any) => p.active = false], ['wrong price identity', (p: any) => p.id = 'price_Other'],
    ['inactive product', (p: any) => p.product.active = false], ['wrong product mode', (p: any) => p.product.livemode = true],
    ['unexpanded product', (p: any) => p.product = 'prod_fixture'], ['deleted product', (p: any) => p.product = { id: 'prod_fixture', deleted: true }],
    ['metered', (p: any) => p.recurring.usage_type = 'metered'], ['tiered', (p: any) => p.billing_scheme = 'tiered'],
    ['custom amount', (p: any) => p.custom_unit_amount = {}], ['quantity transform', (p: any) => p.transform_quantity = {}],
    ['weekly', (p: any) => p.recurring.interval = 'week'], ['multi-month', (p: any) => p.recurring.interval_count = 3],
    ['missing amount', (p: any) => p.unit_amount = null], ['negative amount', (p: any) => p.unit_amount = -1],
    ['one-time/recurring mismatch', (p: any) => p.type = 'one_time'],
  ])('blocks %s price configuration', async (_label, mutate) => {
    (mutate as (p: any) => void)(price); expect((await request()).statusCode).toBe(503); noPaymentSideEffects();
  });
  it('supports ordinary annual subscriptions', async () => { price.recurring.interval = 'year'; expect((await request()).statusCode).toBe(200); });
  it('supports one-time purchases without a trial', async () => {
    offer.billing_model = 'one_time'; offer.trial_period_days = null; price.type = 'one_time'; price.recurring = null;
    expect((await request()).statusCode).toBe(200); expect(mockCreate.mock.calls[0][0].mode).toBe('payment');
  });
  it.each([-1, 1.5, NaN])('blocks invalid trial days %s before payment setup', async days => {
    offer.trial_period_days = days; expect((await request()).statusCode).toBe(503); noPaymentSideEffects();
  });
  it('blocks a trial on one-time billing', async () => {
    offer.billing_model = 'one_time'; expect((await request()).statusCode).toBe(503); noPaymentSideEffects();
  });
  it('does not default a missing model to one-time billing', async () => {
    offer.billing_model = null; expect((await request()).statusCode).toBe(409); noPaymentSideEffects();
  });
  it('does not charge for missing or failed entitlement mapping', async () => {
    mappings = []; expect((await request()).statusCode).toBe(503); noPaymentSideEffects();
  });
  it.each(['people', 'offers', 'offer_entitlements'])('fails closed on %s read errors', async table => {
    errors[table] = { message: 'database_unavailable' }; expect((await request()).statusCode).toBe(500); noPaymentSideEffects();
  });
  it('does not create a session if checkout-start recording fails', async () => {
    errors.checkout_events = { message: 'database_unavailable' }; expect((await request()).statusCode).toBe(500); expect(mockCreate).not.toHaveBeenCalled();
  });
  it('does not return a URL when the durable purchase write fails', async () => {
    errors.stripe_offer_instances = { message: 'database_unavailable' };
    const response = await request(); expect(response.statusCode).toBe(500); expect(response.body.url).toBeUndefined();
    expect(mockExpire).toHaveBeenCalledWith('cs_test_created');
  });
  it('requires positive confirmation of a pending purchase row', async () => {
    pendingResult = null; expect((await request()).statusCode).toBe(500); expect(mockExpire).toHaveBeenCalledWith('cs_test_created');
  });
  it('does not leak the checkout URL if cleanup also fails', async () => {
    pendingResult = null; mockExpire.mockRejectedValue(new Error('provider unavailable'));
    const response = await request(); expect(response.statusCode).toBe(500); expect(JSON.stringify(response.body)).not.toContain('checkout.stripe.com');
  });
  it('does not persist a malformed checkout response', async () => {
    mockCreate.mockResolvedValue({ id: 'cs_test_created', url: null });
    expect((await request()).statusCode).toBe(500); expect(mockExpire).toHaveBeenCalled();
    expect(writes.filter(write => write.table === 'stripe_offer_instances')).toHaveLength(0);
  });
  it('does not expose provider errors or credentials', async () => {
    mockPrice.mockRejectedValue(new Error('sk_test_fake_provider_secret'));
    expect((await request()).statusCode).toBe(500); noPaymentSideEffects();
  });
});
