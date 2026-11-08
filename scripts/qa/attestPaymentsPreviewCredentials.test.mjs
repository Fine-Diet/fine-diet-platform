
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attestPaymentsPreviewCredentials as attest,
  AttestationError,
  QA_MARKER,
  QA_PROJECT_ID,
  QA_BRANCH,
  QA_SUPABASE_URL,
  QA_STRIPE_ACCOUNT_ID,
  QA_STRIPE_SUBSCRIPTION_ID,
} from './attestPaymentsPreviewCredentials.mjs';

const validEnv = () => ({
  [QA_MARKER]: '1',
  VERCEL_PROJECT_ID: QA_PROJECT_ID,
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: QA_BRANCH,
  NEXT_PUBLIC_SUPABASE_URL: QA_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: 'qa-service-role-placeholder',
  STRIPE_ACCOUNT_ID: QA_STRIPE_ACCOUNT_ID,
  STRIPE_SECRET_KEY: 'sk_test_placeholder',
});
const STRIPE_SUBSCRIPTION_URL = 'https://api.stripe.com/v1/subscriptions/' + QA_STRIPE_SUBSCRIPTION_ID;
const verifiedSubscription = () => ({
  id: QA_STRIPE_SUBSCRIPTION_ID,
  object: 'subscription',
  livemode: false,
});
const response = (status, body, jsonImpl) => ({
  status,
  ok: status >= 200 && status < 300,
  json: jsonImpl || (async () => body),
});
function goodFetch(calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes('/rest/v1/rpc/')) return response(400, { code: '22023', message: 'do not log' });
    if (String(url) === STRIPE_SUBSCRIPTION_URL) return response(200, verifiedSubscription());
    throw new Error('unexpected URL');
  };
}
function supabaseThenStripe(stripeResult) {
  return async (url, init) => {
    if (String(url).includes('/rest/v1/rpc/')) return response(400, { code: '22023' });
    if (String(url) !== STRIPE_SUBSCRIPTION_URL) throw new Error('unexpected URL ' + url);
    if (typeof stripeResult === 'function') return stripeResult(url, init);
    return stripeResult;
  };
}
async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof AttestationError && error.code === code);
}

test('non-QA local/Production build skips provider calls when no QA marker is present', async () => {
  let called = false;
  const result = await attest({ VERCEL_PROJECT_ID: 'prj_customer', VERCEL_ENV: 'production' }, async () => { called = true; });
  assert.deepEqual(result, { status: 'skipped_non_qa' });
  assert.equal(called, false);
});

test('recognized QA Preview passes by retrieving the verified TEST subscription', async () => {
  const calls = [];
  const env = { ...validEnv(), STRIPE_SECRET_KEY: 'rk_test_placeholder' };
  const result = await attest(env, goodFetch(calls));
  assert.deepEqual(result, { status: 'passed' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, QA_SUPABASE_URL + '/rest/v1/rpc/fd_expire_stripe_fulfillment');
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_limit: 0 });
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[1].url, STRIPE_SUBSCRIPTION_URL);
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].init.cache, 'no-store');
  assert.equal(calls[1].init.redirect, 'error');
  assert.equal(Object.hasOwn(calls[1].init.headers, 'Stripe-Account'), false);
  assert.equal(Object.hasOwn(calls[1].init.headers, 'stripe-account'), false);
  assert.equal(calls[1].init.body, undefined);
  assert.equal(calls[1].init.headers.authorization === 'Bearer rk_test_placeholder', true);
  assert.equal(calls.some((call) => String(call.url).includes('/v1/account')), false);
  assert.equal(JSON.stringify(result).includes('rk_test_placeholder'), false);
});

test('recognized QA project fails closed if the marker is missing', async () => {
  const env = validEnv(); delete env[QA_MARKER];
  await rejectsCode(attest(env, goodFetch()), 'MARKER');
});

test('QA marker on another project fails closed', async () => {
  await rejectsCode(attest({ ...validEnv(), VERCEL_PROJECT_ID: 'prj_wrong' }, goodFetch()), 'PROJECT');
});

test('wrong environment or branch fails closed before network access', async () => {
  await rejectsCode(attest({ ...validEnv(), VERCEL_ENV: 'production' }, goodFetch()), 'ENVIRONMENT');
  await rejectsCode(attest({ ...validEnv(), VERCEL_GIT_COMMIT_REF: 'main' }, goodFetch()), 'BRANCH');
});

test('the expected QA branch fails closed when project system identity is absent', async () => {
  const env = validEnv(); delete env.VERCEL_PROJECT_ID;
  await rejectsCode(attest(env, goodFetch()), 'PROJECT');
});

test('rejects wrong Supabase project URL and missing service credential', async () => {
  await rejectsCode(attest({ ...validEnv(), NEXT_PUBLIC_SUPABASE_URL: 'https://wrong.supabase.co' }, goodFetch()), 'SUPABASE_URL');
  await rejectsCode(attest({ ...validEnv(), NEXT_PUBLIC_SUPABASE_URL: QA_SUPABASE_URL + ':8443' }, goodFetch()), 'SUPABASE_URL');
  await rejectsCode(attest({ ...validEnv(), SUPABASE_SERVICE_ROLE_KEY: '' }, goodFetch()), 'SUPABASE_CREDENTIAL');
});

test('requires authenticated Supabase QA RPC to return expected non-mutating SQLSTATE probe', async () => {
  await rejectsCode(attest(validEnv(), async () => response(401, { message: 'secret-redacted' })), 'SUPABASE_IDENTITY');
  await rejectsCode(attest(validEnv(), async () => response(400, { code: '42501', message: 'sensitive response' })), 'SUPABASE_IDENTITY');
  await rejectsCode(attest(validEnv(), async () => response(200, { expired_purchases: 0 })), 'SUPABASE_IDENTITY');
});

test('rejects missing, live, malformed, or mismatched Stripe credentials/account', async () => {
  await rejectsCode(attest({ ...validEnv(), STRIPE_SECRET_KEY: '' }, goodFetch()), 'STRIPE_CREDENTIAL');
  await rejectsCode(attest({ ...validEnv(), STRIPE_SECRET_KEY: 'sk_live_placeholder' }, goodFetch()), 'STRIPE_CREDENTIAL');
  await rejectsCode(attest({ ...validEnv(), STRIPE_SECRET_KEY: 'rk_live_placeholder' }, goodFetch()), 'STRIPE_CREDENTIAL');
  await rejectsCode(attest({ ...validEnv(), STRIPE_SECRET_KEY: 'unknown' }, goodFetch()), 'STRIPE_CREDENTIAL');
  await rejectsCode(attest({ ...validEnv(), STRIPE_ACCOUNT_ID: 'acct_wrong' }, goodFetch()), 'STRIPE_ACCOUNT');
  await rejectsCode(attest(validEnv(), supabaseThenStripe(response(200, {
    id: 'sub_other', object: 'subscription', livemode: false,
  }))), 'STRIPE_IDENTITY');
});

test('subscription identity fails closed without echoing provider bodies or credentials', async () => {
  const secret = 'sk_test_private_example';
  const env = { ...validEnv(), STRIPE_SECRET_KEY: secret };
  const cases = [
    response(401, { error: { message: 'bad key ' + secret } }),
    response(403, { error: { message: 'missing subscription_read ' + secret } }),
    response(404, { error: { code: 'resource_missing', message: 'No such subscription ' + secret } }),
    response(500, { error: { message: 'upstream ' + secret } }),
    response(200, { id: QA_STRIPE_ACCOUNT_ID, object: 'account' }),
    response(200, { id: QA_STRIPE_SUBSCRIPTION_ID, object: 'customer', livemode: false }),
    response(200, { id: QA_STRIPE_SUBSCRIPTION_ID, object: 'subscription', livemode: true }),
    response(200, { id: QA_STRIPE_SUBSCRIPTION_ID, object: 'subscription' }),
    response(200, { id: QA_STRIPE_SUBSCRIPTION_ID, object: 'subscription', livemode: 'false' }),
    response(200, null, async () => { throw new Error('malformed ' + secret); }),
  ];
  for (const stripeResult of cases) {
    await assert.rejects(attest(env, supabaseThenStripe(stripeResult)), (error) => {
      assert.equal(error instanceof AttestationError && error.code === 'STRIPE_IDENTITY', true);
      assert.equal(error.message.includes(secret), false);
      assert.equal(error.message.includes('subscription'), false);
      assert.equal(JSON.stringify(error).includes(secret), false);
      return true;
    });
  }
  await assert.rejects(attest(env, async (url) => {
    if (String(url).includes('/rest/v1/rpc/')) return response(400, { code: '22023' });
    throw new Error('network timeout ' + secret);
  }), (error) => {
    assert.equal(error.code, 'STRIPE_IDENTITY');
    assert.equal(error.message.includes(secret), false);
    assert.equal(error.message.includes('timeout'), false);
    return true;
  });
});

test('provider/network failures return safe codes without credentials or provider text', async () => {
  const secret = 'sk_test_private_example';
  const env = { ...validEnv(), STRIPE_SECRET_KEY: secret };
  await assert.rejects(attest(env, async () => { throw new Error('leaked ' + secret); }), (error) => {
    assert.equal(error.code, 'SUPABASE_IDENTITY');
    assert.equal(error.message.includes(secret), false);
    assert.equal(error.message.includes('leaked'), false);
    return true;
  });
});
