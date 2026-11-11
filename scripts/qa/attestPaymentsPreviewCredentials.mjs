
import { pathToFileURL } from 'node:url';

export const QA_PROJECT_ID = 'prj_dhm3g8xGGRQaPbpcgQmQwnSe7qU2';
export const QA_BRANCH = 'codex/payments-release-integration-20261109';
export const QA_SUPABASE_URL = 'https://ikvkqpbwlpevqlshdkdz.supabase.co';
export const QA_STRIPE_ACCOUNT_ID = 'acct_1UXS1WPXTq5u2TLw';
// Independently verified TEST subscription owned by QA_STRIPE_ACCOUNT_ID.
// The subscription object has no parent account id. Binding is that Stripe
// authenticates the key as its own account, and another account is reachable
// only by sending a Stripe-Account header. This request must not send one.
export const QA_STRIPE_SUBSCRIPTION_ID = 'sub_1UXdxePXTq5u2TLwUlI41ksK';
export const QA_MARKER = 'PAYMENTS_QA_CREDENTIAL_ATTESTATION_REQUIRED';

export class AttestationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AttestationError';
    this.code = code;
  }
}

const fail = (code) => { throw new AttestationError(code); };

function requireContext(env) {
  const marker = env[QA_MARKER];
  const projectId = env.VERCEL_PROJECT_ID || '';
  const deploymentEnv = env.VERCEL_ENV || '';
  const branch = env.VERCEL_GIT_COMMIT_REF || '';

  // Recognize the QA project even if its marker is accidentally removed. Also
  // recognize this exact preview branch if a system variable is unavailable.
  const recognizedQaContext = projectId === QA_PROJECT_ID ||
    (deploymentEnv === 'preview' && branch === QA_BRANCH);
  if (!marker && !recognizedQaContext) return false;
  if (marker !== '1') fail('MARKER');
  if (projectId !== QA_PROJECT_ID) fail('PROJECT');
  if (deploymentEnv !== 'preview') fail('ENVIRONMENT');
  if (branch !== QA_BRANCH) fail('BRANCH');
  return true;
}

function validateSupabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('SUPABASE_URL'); }
  if (url.protocol !== 'https:' || url.hostname !== 'ikvkqpbwlpevqlshdkdz.supabase.co' ||
      url.origin !== QA_SUPABASE_URL || url.port !== '' ||
      (url.pathname !== '' && url.pathname !== '/') || url.search || url.hash ||
      url.username || url.password) fail('SUPABASE_URL');
  return QA_SUPABASE_URL;
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}

export async function attestPaymentsPreviewCredentials(env = process.env, fetchImpl = fetch) {
  if (!requireContext(env)) return { status: 'skipped_non_qa' };

  const supabaseUrl = validateSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL || '');
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseKey) fail('SUPABASE_CREDENTIAL');
  if ((env.STRIPE_ACCOUNT_ID || '') !== QA_STRIPE_ACCOUNT_ID) fail('STRIPE_ACCOUNT');
  const stripeKey = env.STRIPE_SECRET_KEY || '';
  if (!/^(sk_test_|rk_test_)[A-Za-z0-9_]+$/.test(stripeKey)) fail('STRIPE_CREDENTIAL');

  const timeout = () => AbortSignal.timeout(8000);
  let supabaseResponse;
  try {
    supabaseResponse = await fetchImpl(supabaseUrl + '/rest/v1/rpc/fd_expire_stripe_fulfillment', {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        authorization: 'Bearer ' + supabaseKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ p_limit: 0 }),
      cache: 'no-store',
      redirect: 'error',
      signal: timeout(),
    });
  } catch { fail('SUPABASE_IDENTITY'); }
  if (supabaseResponse.status !== 400) fail('SUPABASE_IDENTITY');
  const supabaseError = await safeJson(supabaseResponse);
  if (!supabaseError || supabaseError.code !== '22023') fail('SUPABASE_IDENTITY');

  let stripeResponse;
  try {
    stripeResponse = await fetchImpl(
      'https://api.stripe.com/v1/subscriptions/' + QA_STRIPE_SUBSCRIPTION_ID,
      {
        method: 'GET',
        headers: { authorization: 'Bearer ' + stripeKey, accept: 'application/json' },
        cache: 'no-store',
        redirect: 'error',
        signal: timeout(),
      },
    );
  } catch { fail('STRIPE_IDENTITY'); }
  if (!stripeResponse.ok) fail('STRIPE_IDENTITY');
  const subscription = await safeJson(stripeResponse);
  // Pass only the exact verified TEST subscription. A 2xx status, the id, or
  // livemode alone is not sufficient. No /v1/account fallback.
  if (!subscription ||
      subscription.id !== QA_STRIPE_SUBSCRIPTION_ID ||
      subscription.object !== 'subscription' ||
      subscription.livemode !== false) fail('STRIPE_IDENTITY');
  return { status: 'passed' };
}

async function run() {
  try {
    const result = await attestPaymentsPreviewCredentials();
    console.info(result.status === 'passed'
      ? 'Payments QA credential attestation PASS'
      : 'Payments QA credential attestation skipped for non-QA build');
  } catch (error) {
    const code = error instanceof AttestationError ? error.code : 'UNEXPECTED';
    console.error('Payments QA credential attestation FAIL [' + code + ']');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
