import { checkoutPaymentReady, readFineDietAttribution, stripeReferenceId, subscriptionAccessState } from '../stripeLifecyclePolicy';

describe('current Stripe payment access policy', () => {
  it.each(['paid', 'no_payment_required'])('accepts complete checkout with %s', payment_status => {
    expect(checkoutPaymentReady({ status: 'complete', payment_status })).toBe(true);
  });
  it.each(['open', 'expired', null])('rejects paid checkout with status %s', status => {
    expect(checkoutPaymentReady({ status, payment_status: 'paid' })).toBe(false);
  });
  it('does not grant just because unpaid checkout completed', () => {
    expect(checkoutPaymentReady({ status: 'complete', payment_status: 'unpaid' })).toBe(false);
  });
  it('requires the current paid invoice for an active subscription', () => {
    expect(subscriptionAccessState({ status: 'active', latest_invoice: { status: 'paid' } }, 'canceled')).toBe('active');
    expect(subscriptionAccessState({ status: 'active', latest_invoice: { status: 'open' } }, 'active')).toBe('canceled');
    expect(subscriptionAccessState({ status: 'active', latest_invoice: null }, 'pending')).toBe('canceled');
  });
  it('refuses to infer payment from an unexpanded invoice id', () => {
    expect(() => subscriptionAccessState({ status: 'active', latest_invoice: 'in_fixture' }, 'pending')).toThrow('not expanded');
  });
  it('does not reopen a locally ended purchase', () => {
    expect(subscriptionAccessState({ status: 'active', latest_invoice: { status: 'paid' } }, 'ended')).toBe('ended');
  });
  it.each(['canceled', 'incomplete_expired'])('ends access for %s even with an old paid invoice', status => {
    expect(subscriptionAccessState({ status, latest_invoice: { status: 'paid' } }, 'active')).toBe('ended');
  });
  it.each(['paused', 'unpaid', 'past_due', 'incomplete', 'unknown'])('does not activate %s', status => {
    expect(subscriptionAccessState({ status, latest_invoice: { status: 'paid' } }, 'active')).toBe('canceled');
  });
  it('requires a currently valid trial', () => {
    expect(subscriptionAccessState({ status: 'trialing', latest_invoice: null, trial_end: 200 }, 'pending', 100)).toBe('active');
    expect(subscriptionAccessState({ status: 'trialing', latest_invoice: null, trial_end: 100 }, 'active', 100)).toBe('canceled');
    expect(subscriptionAccessState({ status: 'trialing', latest_invoice: null }, 'pending', 100)).toBe('canceled');
  });
  it('ignores wholly unrelated metadata, but rejects partial app attribution', () => {
    expect(readFineDietAttribution({ campaign: 'other-service' })).toBeNull();
    expect(() => readFineDietAttribution({ person_id: 'person_fixture' })).toThrow('Incomplete');
    expect(() => readFineDietAttribution({ offer_key: 'fine-diet-method' })).toThrow('Incomplete');
    expect(readFineDietAttribution({ person_id: 'person_fixture', offer_key: 'fine-diet-method' })).toEqual({ personId: 'person_fixture', offerKey: 'fine-diet-method' });
  });
  it('reads string and expanded object references without inventing ids', () => {
    expect(stripeReferenceId('sub_fixture')).toBe('sub_fixture');
    expect(stripeReferenceId({ id: 'sub_fixture' })).toBe('sub_fixture');
    expect(stripeReferenceId(null)).toBeNull();
    expect(stripeReferenceId({})).toBeNull();
  });
});
