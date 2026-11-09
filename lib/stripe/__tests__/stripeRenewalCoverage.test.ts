/** Paid-period evidence tests: synthetic Stripe objects; no Stripe requests. */
import type Stripe from 'stripe';
const mockInvoices = jest.fn(), mockLines = jest.fn(), mockClock = jest.fn();
jest.mock('../stripeServer', () => ({ stripe: {
  invoices: {
    list: (...args: unknown[]) => mockInvoices(...args),
    listLineItems: (...args: unknown[]) => mockLines(...args),
  },
  testHelpers: { testClocks: { retrieve: (...args: unknown[]) => mockClock(...args) } },
} }));
import { resolveRenewalAccess, resolveRenewalAccessState } from '../stripeRenewalCoverage';
const NOW = 1800000000;
function line(overrides: Record<string, unknown> = {}) {
  return { id: 'il_current', amount: 2499, currency: 'usd', livemode: false, quantity: 1,
    parent: { type: 'subscription_item_details', subscription_item_details: {
      subscription: 'sub_fixture', subscription_item: 'si_fixture', proration: false,
    } }, pricing: { price_details: { price: 'price_Fixture' } },
    period: { start: NOW - 100, end: NOW + 100 }, ...overrides };
}
function invoice(overrides: Record<string, unknown> = {}) {
  return { id: 'in_current', status: 'paid', amount_remaining: 0, currency: 'usd', livemode: false,
    customer: 'cus_fixture', parent: { subscription_details: { subscription: 'sub_fixture' } },
    post_payment_credit_notes_amount: 0, status_transitions: { paid_at: NOW - 100 },
    lines: { data: [line()], has_more: false }, ...overrides };
}
function subscription(overrides: Record<string, unknown> = {}) {
  return { id: 'sub_fixture', customer: 'cus_fixture', status: 'active', livemode: false,
    schedule: null, pause_collection: null, pending_update: null,
    items: { data: [{ id: 'si_fixture', quantity: 1,
      price: { id: 'price_Fixture', currency: 'usd', recurring: { usage_type: 'licensed' } } }], has_more: false },
    latest_invoice: invoice(), ...overrides } as unknown as Stripe.Subscription;
}
async function resolve(value: Stripe.Subscription, previous = 'active') {
  return resolveRenewalAccessState(value, previous, () => NOW);
}
beforeEach(() => {
  jest.resetAllMocks();
  mockInvoices.mockResolvedValue({ data: [], has_more: false });
  mockLines.mockResolvedValue({ data: [], has_more: false });
});
describe('verified paid service periods', () => {
  it('accepts current paid service coverage, not just a paid header', async () => {
    expect(await resolve(subscription())).toBe('active'); expect(mockInvoices).not.toHaveBeenCalled();
  });
  it('returns the exact verified invoice-line end as a paid-through cutoff', async () => {
    const decision = await resolveRenewalAccess(subscription(), 'active', () => NOW);
    expect(decision).toEqual({ state: 'active', paidThrough: new Date((NOW + 100) * 1000).toISOString() });
  });
  it.each(['draft', 'open'])('preserves still-paid access when newest invoice is %s', async status => {
    mockInvoices.mockResolvedValue({ data: [invoice({ id: 'in_prior' })], has_more: false });
    expect(await resolve(subscription({ latest_invoice: invoice({ status }) }))).toBe('active');
    expect(mockInvoices).toHaveBeenCalledWith({ customer: 'cus_fixture', subscription: 'sub_fixture', status: 'paid', limit: 20 }, { timeout: 5000 });
  });
  it('preserves paid coverage even if provider has entered past_due', async () => {
    expect(await resolve(subscription({ status: 'past_due' }))).toBe('active');
  });
  it('restores a recoverable purchase after payment covers the present period', async () => {
    expect(await resolve(subscription(), 'canceled')).toBe('active');
  });
  it.each(['canceled', 'incomplete_expired'])('does not reopen terminal provider status %s', async status => {
    expect(await resolve(subscription({ status }))).toBe('ended'); expect(mockInvoices).not.toHaveBeenCalled();
  });
  it('does not reopen a locally ended purchase', async () => {
    expect(await resolve(subscription(), 'ended')).toBe('ended');
  });
  it.each(['unpaid', 'paused', 'incomplete'])('does not enable a %s subscription', async status => {
    expect(await resolve(subscription({ status }))).toBe('canceled');
  });
  it('supports a valid free trial without manufacturing paid coverage', async () => {
    expect(await resolve(subscription({ status: 'trialing', trial_end: NOW + 60, latest_invoice: null }))).toBe('active');
    expect(mockInvoices).not.toHaveBeenCalled();
  });
  it('returns trial_end as the bounded paid-through-style access cutoff', async () => {
    await expect(resolveRenewalAccess(subscription({ status: 'trialing', trial_end: NOW + 60 }), 'active', () => NOW))
      .resolves.toEqual({ state: 'active', paidThrough: new Date((NOW + 60) * 1000).toISOString() });
  });
  it('does not extend an expired trial', async () => {
    expect(await resolve(subscription({ status: 'trialing', trial_end: NOW }))).toBe('canceled');
  });
  it('retains paid access for cancellation scheduled at period end', async () => {
    expect(await resolve(subscription({ cancel_at_period_end: true }))).toBe('active');
  });
  it.each([
    ['expired', NOW - 200, NOW], ['future', NOW + 1, NOW + 100], ['invalid', NOW, NOW - 1],
  ])('does not count %s periods as present paid access', async (_label, start, end) => {
    expect(await resolve(subscription({ latest_invoice: invoice({ lines: { data: [line({ period: { start, end } })], has_more: false } }) }))).toBe('canceled');
  });
  it('accepts the exact start boundary', async () => {
    expect(await resolve(subscription({ latest_invoice: invoice({ lines: { data: [line({ period: { start: NOW, end: NOW + 1 } })], has_more: false } }) }))).toBe('active');
  });
  it('does not use invoice header or current_period_end as payment proof', async () => {
    expect(await resolve(subscription({ current_period_end: NOW + 1000,
      latest_invoice: invoice({ period_start: NOW - 10, period_end: NOW + 1000, lines: { data: [], has_more: false } }) }))).toBe('canceled');
  });
  it('does not use prior payment for a period that has ended', async () => {
    mockInvoices.mockResolvedValue({ data: [invoice({ lines: { data: [line({ period: { start: NOW - 1000, end: NOW } })], has_more: false } })], has_more: false });
    expect(await resolve(subscription({ latest_invoice: invoice({ status: 'open' }) }))).toBe('canceled');
  });
  it.each(['customer', 'livemode', 'currency', 'subscription'])('rejects invoice %s mismatch without inferring revocation', async field => {
    const bad: any = invoice();
    if (field === 'subscription') bad.parent.subscription_details.subscription = 'sub_other';
    else bad[field] = field === 'livemode' ? true : 'wrong';
    await expect(resolve(subscription({ latest_invoice: bad }))).rejects.toThrow('does not match');
  });
  it.each([
    ['proration', { parent: { type: 'subscription_item_details', subscription_item_details: { subscription: 'sub_fixture', subscription_item: 'si_fixture', proration: true } } }],
    ['another item', { parent: { type: 'subscription_item_details', subscription_item_details: { subscription: 'sub_fixture', subscription_item: 'si_other', proration: false } } }],
    ['another price', { pricing: { price_details: { price: 'price_Other' } } }],
    ['negative credit', { amount: -100 }], ['another mode', { livemode: true }],
    ['another currency', { currency: 'eur' }], ['another quantity', { quantity: 2 }],
  ])('does not treat %s lines as matching service coverage', async (_label, overrides) => {
    expect(await resolve(subscription({ latest_invoice: invoice({ lines: { data: [line(overrides as Record<string, unknown>)], has_more: false } }) }))).toBe('canceled');
  });
  it('supports historical subscription invoice/line shapes', async () => {
    const legacy: any = line(); delete legacy.parent; delete legacy.pricing;
    Object.assign(legacy, { type: 'subscription', subscription: 'sub_fixture', subscription_item: 'si_fixture', proration: false, price: { id: 'price_Fixture' } });
    const old: any = invoice({ subscription: 'sub_fixture', lines: { data: [legacy], has_more: false } }); delete old.parent;
    expect(await resolve(subscription({ latest_invoice: old }))).toBe('active');
  });
  it.each([1, 100])('does not infer coverage from an invoice credited by %s cents', async credit => {
    expect(await resolve(subscription({ latest_invoice: invoice({ post_payment_credit_notes_amount: credit }) }))).toBe('canceled');
  });
  it('rejects invalid settlement timestamps', async () => {
    await expect(resolve(subscription({ latest_invoice: invoice({ status_transitions: { paid_at: NOW + 1 } }) }))).rejects.toThrow('timestamp');
  });
  it('requires an expanded latest invoice', async () => {
    await expect(resolve(subscription({ latest_invoice: 'in_unexpanded' }))).rejects.toThrow('expanded');
  });
  it.each(['schedule', 'pause_collection', 'pending_update'])('requires review of %s instead of inferring coverage', async field => {
    await expect(resolve(subscription({ [field]: {} }))).rejects.toThrow('require review');
  });
  it.each(['schedule', 'pause_collection', 'pending_update'])('rejects trial access when %s is present', async field => {
    await expect(resolve(subscription({ status: 'trialing', trial_end: NOW + 60, [field]: {} })))
      .rejects.toThrow('require review');
  });
  it('rejects multi-item subscriptions', async () => {
    const value = subscription(); (value.items.data as unknown[]).push({ id: 'si_other' });
    await expect(resolve(value)).rejects.toThrow('single-item');
  });
  it('rejects incomplete item evidence', async () => {
    const value = subscription(); value.items.has_more = true;
    await expect(resolve(value)).rejects.toThrow('single-item');
  });
  it('fetches complete invoice lines instead of assuming the embedded page is complete', async () => {
    mockLines.mockResolvedValueOnce({ data: [line({ id: 'il_one', period: { start: 1, end: 2 } })], has_more: true })
      .mockResolvedValueOnce({ data: [line({ id: 'il_two' })], has_more: false });
    expect(await resolve(subscription({ latest_invoice: invoice({ lines: { data: [], has_more: true } }) }))).toBe('active');
    expect(mockLines).toHaveBeenLastCalledWith('in_current', { limit: 100, starting_after: 'il_one' }, { timeout: 5000 });
  });
  it('requires full pagination even if the first truncated page looks paid', async () => {
    mockLines.mockResolvedValue({ data: [line()], has_more: true });
    await expect(resolve(subscription({ latest_invoice: invoice({ lines: { data: [line()], has_more: true } }) }))).rejects.toThrow('Incomplete');
  });
  it('checks invoice line ownership', async () => {
    await expect(resolve(subscription({ latest_invoice: invoice({ lines: { data: [line({ invoice: 'in_wrong' })], has_more: false } }) }))).rejects.toThrow('ownership');
  });
  it('follows paid invoice pagination', async () => {
    mockInvoices.mockResolvedValueOnce({ data: [invoice({ id: 'in_old', lines: { data: [], has_more: false } })], has_more: true })
      .mockResolvedValueOnce({ data: [invoice({ id: 'in_covering' })], has_more: false });
    expect(await resolve(subscription({ latest_invoice: invoice({ status: 'open' }) }))).toBe('active');
    expect(mockInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ starting_after: 'in_old' }), { timeout: 5000 });
  });
  it('does not interpret exhausted history limits as proof of nonpayment', async () => {
    mockInvoices.mockImplementation(async () => ({ data: [invoice({ id: `in_${mockInvoices.mock.calls.length}`, lines: { data: [], has_more: false } })], has_more: true }));
    await expect(resolve(subscription({ latest_invoice: invoice({ status: 'open' }) }))).rejects.toThrow('bounded');
    expect(mockInvoices).toHaveBeenCalledTimes(3);
  });
  it('propagates provider errors instead of applying old event state', async () => {
    mockInvoices.mockRejectedValue(new Error('provider unavailable'));
    await expect(resolve(subscription({ latest_invoice: invoice({ status: 'open' }) }))).rejects.toThrow('provider unavailable');
  });
  it('rejects malformed evidence pages', async () => {
    mockInvoices.mockResolvedValue({ data: [], has_more: undefined });
    await expect(resolve(subscription({ latest_invoice: invoice({ status: 'open' }) }))).rejects.toThrow('Malformed');
  });
  it('checks coverage again after slow reads cross the paid boundary', async () => {
    let now = NOW;
    mockLines.mockImplementation(async () => { now = NOW + 101; return { data: [line()], has_more: false }; });
    expect(await resolveRenewalAccessState(subscription({ latest_invoice: invoice({ lines: { data: [], has_more: true } }) }), 'active', () => now)).toBe('canceled');
    expect(mockClock).not.toHaveBeenCalled();
  });
  it('uses verified test-clock time for a genuine future simulated service period', async () => {
    const start = NOW + 10_000, end = NOW + 20_000, frozen = start + 50;
    mockClock.mockResolvedValue({ id: 'clock_fixture', livemode: false, status: 'ready', frozen_time: frozen });
    const decision = await resolveRenewalAccess(subscription({
      test_clock: 'clock_fixture',
      latest_invoice: invoice({
        status_transitions: { paid_at: frozen - 10 },
        lines: { data: [line({ period: { start, end } })], has_more: false },
      }),
    }), 'active', () => NOW);
    expect(decision).toEqual({ state: 'active', paidThrough: new Date(end * 1000).toISOString() });
    expect(mockClock).toHaveBeenCalledWith('clock_fixture', {}, { timeout: 5000 });
    expect(mockInvoices).not.toHaveBeenCalled();
  });
  it('does not trust an embedded clock time without retrieving the ready TEST clock', async () => {
    mockClock.mockResolvedValue({ id: 'clock_fixture', livemode: false, status: 'ready', frozen_time: NOW });
    expect(await resolve(subscription({ test_clock: { id: 'clock_fixture', frozen_time: NOW + 50_000 } }))).toBe('active');
    expect(mockClock).toHaveBeenCalledWith('clock_fixture', {}, { timeout: 5000 });
  });
  it('does not treat an unpaid simulated period as coverage', async () => {
    mockClock.mockResolvedValue({ id: 'clock_fixture', livemode: false, status: 'ready', frozen_time: NOW + 15_000 });
    expect(await resolve(subscription({
      test_clock: 'clock_fixture',
      latest_invoice: invoice({ status: 'open', lines: { data: [line({ period: { start: NOW + 10_000, end: NOW + 20_000 } })], has_more: false } }),
    }))).toBe('canceled');
  });
  it('does not treat a prorated simulated line as service coverage', async () => {
    const frozen = NOW + 15_000;
    mockClock.mockResolvedValue({ id: 'clock_fixture', livemode: false, status: 'ready', frozen_time: frozen });
    expect(await resolve(subscription({
      test_clock: 'clock_fixture',
      latest_invoice: invoice({
        status_transitions: { paid_at: frozen - 5 },
        lines: { data: [line({
          period: { start: NOW + 10_000, end: NOW + 20_000 },
          parent: { type: 'subscription_item_details', subscription_item_details: {
            subscription: 'sub_fixture', subscription_item: 'si_fixture', proration: true,
          } },
        })], has_more: false },
      }),
    }))).toBe('canceled');
  });
  it.each([
    ['a mismatched id', { id: 'clock_other', livemode: false, status: 'ready', frozen_time: NOW }],
    ['a live clock', { id: 'clock_fixture', livemode: true, status: 'ready', frozen_time: NOW }],
    ['an advancing clock', { id: 'clock_fixture', livemode: false, status: 'advancing', frozen_time: NOW }],
    ['a missing frozen time', { id: 'clock_fixture', livemode: false, status: 'ready', frozen_time: null }],
  ])('rejects %s instead of inferring coverage', async (_label, evidence) => {
    mockClock.mockResolvedValue(evidence);
    await expect(resolve(subscription({ test_clock: 'clock_fixture' }))).rejects.toThrow('test clock');
    expect(mockInvoices).not.toHaveBeenCalled();
  });
  it('rejects a malformed clock id before calling Stripe', async () => {
    await expect(resolve(subscription({ test_clock: 'not-a-clock' }))).rejects.toThrow('test clock');
    expect(mockClock).not.toHaveBeenCalled();
    expect(mockInvoices).not.toHaveBeenCalled();
  });
  it('rejects a live subscription that carries a test clock', async () => {
    await expect(resolve(subscription({ livemode: true, test_clock: 'clock_fixture' }))).rejects.toThrow('test clock');
    expect(mockClock).not.toHaveBeenCalled();
  });
  it('leaves an unavailable test clock retryable', async () => {
    mockClock.mockRejectedValue(new Error('clock unavailable'));
    await expect(resolve(subscription({ test_clock: 'clock_fixture' }))).rejects.toThrow('clock unavailable');
    expect(mockInvoices).not.toHaveBeenCalled();
  });
  it('keeps real reconciliation time for an ordinary unclocked subscription', async () => {
    expect(await resolve(subscription({
      latest_invoice: invoice({ lines: { data: [line({ period: { start: NOW + 10, end: NOW + 20 } })], has_more: false } }),
    }))).toBe('canceled');
    expect(mockClock).not.toHaveBeenCalled();
  });
});
