import { getStripeAccountContext } from '../stripeAccountContext';

const priorAccount = process.env.STRIPE_ACCOUNT_ID;
const priorKey = process.env.STRIPE_SECRET_KEY;
afterEach(() => {
  if (priorAccount === undefined) delete process.env.STRIPE_ACCOUNT_ID;
  else process.env.STRIPE_ACCOUNT_ID = priorAccount;
  if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = priorKey;
});

describe('Stripe account-scoped configuration', () => {
  it('distinguishes sandbox from live mode', () => {
    process.env.STRIPE_ACCOUNT_ID = 'acct_123ABC';
    process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
    expect(getStripeAccountContext()).toEqual({ accountId: 'acct_123ABC', livemode: false });
    process.env.STRIPE_SECRET_KEY = 'sk_live_placeholder';
    expect(getStripeAccountContext()).toEqual({ accountId: 'acct_123ABC', livemode: true });
    process.env.STRIPE_SECRET_KEY = 'rk_test_placeholder';
    expect(getStripeAccountContext()).toEqual({ accountId: 'acct_123ABC', livemode: false });
    process.env.STRIPE_SECRET_KEY = 'rkcs_test_placeholder';
    expect(getStripeAccountContext()).toEqual({ accountId: 'acct_123ABC', livemode: false });
  });

  it('fails closed when the account is missing or invalid', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
    delete process.env.STRIPE_ACCOUNT_ID;
    expect(() => getStripeAccountContext()).toThrow('STRIPE_ACCOUNT_ID');
    process.env.STRIPE_ACCOUNT_ID = 'not-an-account';
    expect(() => getStripeAccountContext()).toThrow('STRIPE_ACCOUNT_ID');
  });

  it('fails closed if key mode cannot be identified', () => {
    process.env.STRIPE_ACCOUNT_ID = 'acct_123ABC';
    process.env.STRIPE_SECRET_KEY = 'unknown';
    expect(() => getStripeAccountContext()).toThrow('STRIPE_SECRET_KEY');
  });
});
