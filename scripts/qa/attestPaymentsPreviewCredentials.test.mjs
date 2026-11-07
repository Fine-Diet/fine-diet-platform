
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
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function goodFetch(calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes('/rest/v1/rpc/')) return response(400, { code: '22023', message: 'do not log' });
    if (String(url) === 'https://api.stripe.com/v1/account') return response(200, { id: QA_STRIPE_ACCOUNT_ID });
    throw new Error('unexpected URL');
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

test('recognized QA Preview passes using Stripe Account response without livemode', async () => {
  const calls = [];
  const result = await attest(validEnv(), goodFetch(calls));
  assert.deepEqual(result, { status: 'passed' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, QA_SUPABASE_URL + '/rest/v1/rpc/fd_expire_stripe_fulfillment');
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_limit: 0 });
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[1].url, 'https://api.stripe.com/v1/account');
  assert.equal(calls[1].init.redirect, 'error');
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
  await rejectsCode(attest(validEnv(), async (url) => String(url).includes('/rest/v1/rpc/')
    ? response(400, { code: '22023' }) : response(200, { id: 'acct_wrong' })), 'STRIPE_IDENTITY');
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
