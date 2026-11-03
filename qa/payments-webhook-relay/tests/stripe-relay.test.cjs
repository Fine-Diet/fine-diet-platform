// Run with: node --experimental-vm-modules --test qa/payments-webhook-relay/tests/stripe-relay.test.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const RELAY_SOURCE = fs.readFileSync(path.join(__dirname, '../pages/api/stripe.js'), 'utf8');
const SIGNING_SECRET = 'local-only-synthetic-signing-secret';
const EVENT_ID = 'evt_local123';
const CUSTOMER_ID = 'cus_local123';
const SUBSCRIPTION_ID = 'sub_local123';
const ACCOUNT_ID = 'acct_local123';

async function createHarness(envOverrides = {}) {
  const state = {
    oidcCalls: 0,
    forwarded: [],
    mockedFulfillmentWrites: 0,
  };
  const env = {
    STRIPE_WEBHOOK_SECRET: SIGNING_SECRET,
    STRIPE_QA_CHECKOUT_EVENT_ID: EVENT_ID,
    STRIPE_QA_SUBSCRIPTION_ID: SUBSCRIPTION_ID,
    STRIPE_QA_CUSTOMER_ID: CUSTOMER_ID,
    STRIPE_QA_ACCOUNT_ID: ACCOUNT_ID,
    PAYMENTS_TARGET_URL: 'https://fine-diet-payments-qa-target-localtest.vercel.app/api/webhooks/stripe',
    ...envOverrides,
  };
  const context = vm.createContext({
    AbortSignal,
    Buffer,
    Date,
    URL,
    process: { env },
    console: { warn() {}, error() {}, info() {} },
    fetch: async (url, init) => {
      state.forwarded.push({ url, init });
      state.mockedFulfillmentWrites += 1;
      return { status: 200 };
    },
  });
  const cryptoModule = new vm.SyntheticModule(
    ['createHmac', 'timingSafeEqual'],
    function () {
      this.setExport('createHmac', crypto.createHmac);
      this.setExport('timingSafeEqual', crypto.timingSafeEqual);
    },
    { context },
  );
  const oidcModule = new vm.SyntheticModule(
    ['getVercelOidcToken'],
    function () {
      this.setExport('getVercelOidcToken', async () => {
        state.oidcCalls += 1;
        return 'synthetic-oidc-token';
      });
    },
    { context },
  );
  const route = new vm.SourceTextModule(RELAY_SOURCE, {
    context,
    identifier: 'qa-payments-relay-under-test',
  });
  await route.link((specifier) => {
    if (specifier === 'node:crypto') return cryptoModule;
    if (specifier === '@vercel/oidc') return oidcModule;
    throw new Error('Unexpected import in relay test: ' + specifier);
  });
  await route.evaluate();
  return { handler: route.namespace.default, state };
}

function makeEvent(overrides = {}) {
  const base = {
    id: EVENT_ID,
    type: 'checkout.session.completed',
    livemode: false,
    account: ACCOUNT_ID,
    data: {
      object: {
        id: 'cs_local123',
        customer: CUSTOMER_ID,
        subscription: SUBSCRIPTION_ID,
      },
    },
  };
  return {
    ...base,
    ...overrides,
    data: {
      ...base.data,
      ...(overrides.data || {}),
      object: {
        ...base.data.object,
        ...(overrides.data && overrides.data.object ? overrides.data.object : {}),
      },
    },
  };
}

function rawPayload(event = makeEvent()) {
  return JSON.stringify(event);
}

function signatureFor(body, timestamp = Math.floor(Date.now() / 1000), secret = SIGNING_SECRET) {
  const digest = crypto.createHmac('sha256', secret)
    .update(String(timestamp) + '.')
    .update(body)
    .digest('hex');
  return 't=' + timestamp + ',v1=' + digest;
}

function makeRequest(body, signature, extraHeaders = {}) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return {
    method: 'POST',
    headers: {
      ...(signature ? { 'stripe-signature': signature } : {}),
      ...extraHeaders,
    },
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
}

async function invoke(handler, req) {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value; return this; },
  };
  await handler(req, res);
  return res;
}

function assertNoForwardOrFulfillment(state) {
  assert.equal(state.oidcCalls, 0, 'rejected request must not request an OIDC token');
  assert.equal(state.forwarded.length, 0, 'rejected request must not reach the target handler');
  assert.equal(state.mockedFulfillmentWrites, 0, 'rejected request must not change mocked fulfillment state');
}

test('missing signature is rejected before OIDC, forwarding, or fulfillment', async () => {
  const { handler, state } = await createHarness();
  const res = await invoke(handler, makeRequest(rawPayload(), null));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'missing_signature');
  assertNoForwardOrFulfillment(state);
});

test('invalid HMAC signature is rejected before OIDC, forwarding, or fulfillment', async () => {
  const { handler, state } = await createHarness();
  const body = rawPayload();
  const timestamp = Math.floor(Date.now() / 1000);
  const badSignature = signatureFor(body, timestamp, 'different-local-only-secret');
  const res = await invoke(handler, makeRequest(body, badSignature));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'invalid_signature');
  assertNoForwardOrFulfillment(state);
});

test('valid HMAC with an expired timestamp is rejected before OIDC, forwarding, or fulfillment', async () => {
  const { handler, state } = await createHarness();
  const body = rawPayload();
  const expiredTimestamp = Math.floor(Date.now() / 1000) - 301;
  const res = await invoke(handler, makeRequest(body, signatureFor(body, expiredTimestamp)));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'invalid_signature');
  assertNoForwardOrFulfillment(state);
});

test('oversized streamed body is rejected before OIDC, forwarding, or fulfillment', async () => {
  const { handler, state } = await createHarness();
  const oversized = Buffer.alloc(1024 * 1024 + 1, 0x61);
  const signature = 't=' + Math.floor(Date.now() / 1000) + ',v1=' + '0'.repeat(64);
  const res = await invoke(handler, makeRequest(oversized, signature));
  assert.equal(res.statusCode, 413);
  assert.equal(res.body.error, 'payload_too_large');
  assertNoForwardOrFulfillment(state);
});

test('disallowed event type is rejected before OIDC, forwarding, or fulfillment', async () => {
  const { handler, state } = await createHarness();
  const body = rawPayload(makeEvent({ type: 'charge.refunded' }));
  const res = await invoke(handler, makeRequest(body, signatureFor(body)));
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'event_not_allowed');
  assertNoForwardOrFulfillment(state);
});

test('event outside the checkout/customer allowlist is rejected before forwarding', async () => {
  const { handler, state } = await createHarness();
  const body = rawPayload(makeEvent({
    id: 'evt_other123',
    data: { object: { customer: 'cus_other123' } },
  }));
  const res = await invoke(handler, makeRequest(body, signatureFor(body)));
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'event_not_allowed');
  assertNoForwardOrFulfillment(state);
});

test('target URL with the wrong path fails closed before OIDC or forwarding', async () => {
  const { handler, state } = await createHarness({
    PAYMENTS_TARGET_URL: 'https://fine-diet-payments-qa-target-localtest.vercel.app',
  });
  const body = rawPayload();
  const res = await invoke(handler, makeRequest(body, signatureFor(body)));
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'temporarily_unavailable');
  assertNoForwardOrFulfillment(state);
});

test('valid synthetic event forwards unchanged body and signature with mocked OIDC', async () => {
  const { handler, state } = await createHarness();
  const body = rawPayload();
  const signature = signatureFor(body);
  const res = await invoke(handler, makeRequest(body, signature));
  assert.equal(res.statusCode, 200);
  assert.equal(state.oidcCalls, 1);
  assert.equal(state.forwarded.length, 1);
  assert.equal(state.mockedFulfillmentWrites, 1);
  const forward = state.forwarded[0];
  assert.equal(forward.url, 'https://fine-diet-payments-qa-target-localtest.vercel.app/api/webhooks/stripe');
  assert.equal(forward.init.method, 'POST');
  assert.equal(forward.init.body.toString('utf8'), body);
  assert.equal(forward.init.headers['stripe-signature'], signature);
  assert.equal(forward.init.headers['x-vercel-trusted-oidc-idp-token'], 'synthetic-oidc-token');
});
