/**
 * Explicitly scope Stripe customer identities to an account and environment.
 *
 * There is no safe global Stripe customer ID per Fine Diet person: the platform
 * sandbox and the live account are different accounts. Never silently infer an
 * account from an existing customer row or select an arbitrary environment.
 */
export interface StripeAccountContext {
  accountId: string;
  livemode: boolean;
}

export function getStripeAccountContext(): StripeAccountContext {
  const accountId = (process.env.STRIPE_ACCOUNT_ID || '').trim();
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  // rkcs_ is the secret key issued for a claimable Stripe sandbox.
  const mode = /^(?:sk|rk|rkcs)_(test|live)_/.exec(secretKey)?.[1];

  if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) {
    throw new Error('STRIPE_ACCOUNT_ID must identify the intended Stripe account');
  }
  if (mode !== 'test' && mode !== 'live') {
    throw new Error('STRIPE_SECRET_KEY must be an identifiable test or live Stripe key');
  }

  return { accountId, livemode: mode === 'live' };
}
