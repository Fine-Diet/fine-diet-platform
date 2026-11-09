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

const TEMP_CUSTOMER = 'cus_renewal123';
const TEMP_SESSION = 'cs_test_renewal123';
const TEMP_SUBSCRIPTION = 'sub_renewal123';
const OTHER_SUBSCRIPTION = 'sub_other999';
const TEMP_SLOT_MAX_SECONDS = 7 * 24 * 60 * 60;

function unixSeconds(offset = 0) {
  return Math.floor(Date.now() / 1000) + offset;
}

function tempSlotEnv(subscriptionId, expiresAt = String(unixSeconds(3600))) {
  return {
    STRIPE_QA_TEMP_CUSTOMER_ID: TEMP_CUSTOMER,
    STRIPE_QA_TEMP_CHECKOUT_SESSION_ID: TEMP_SESSION,
    STRIPE_QA_TEMP_EXPIRES_AT: expiresAt,
    ...(subscriptionId ? { STRIPE_QA_TEMP_SUBSCRIPTION_ID: subscriptionId } : {}),
  };
}

function knownInvoice(eventId = 'evt_knownrenewal') {
  return makeEvent({
    id: eventId,
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_known1',
        customer: CUSTOMER_ID,
        subscription: null,
        parent: { subscription_details: { subscription: SUBSCRIPTION_ID, customer: CUSTOMER_ID } },
      },
    },
  });
}

function tempCheckout(type = 'checkout.session.completed', object = {}, eventId = 'evt_temprenewal1') {
  return makeEvent({
    id: eventId,
    type,
    data: {
      object: {
        id: TEMP_SESSION,
        customer: TEMP_CUSTOMER,
        subscription: TEMP_SUBSCRIPTION,
        ...object,
      },
    },
  });
}

function tempInvoice(subscriptionId, eventId = 'evt_tempinvoice1') {
  return makeEvent({
    id: eventId,
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_tempinvoice1',
        customer: null,
        subscription: null,
        parent: {
          subscription_details: {
            customer: TEMP_CUSTOMER,
            subscription: subscriptionId,
          },
        },
      },
    },
  });
}

function tempSubscriptionEvent(subscriptionId, type = 'customer.subscription.created') {
  return makeEvent({
    id: 'evt_tempsub1',
    type,
    data: {
      object: {
        id: subscriptionId,
        customer: { id: TEMP_CUSTOMER },
        subscription: null,
      },
    },
  });
}

async function deliver(handler, event) {
  const body = rawPayload(event);
  const res = await invoke(handler, makeRequest(body, signatureFor(body)));
  return res;
}

test('absent temporary slot preserves the single known-good allowlist', async () => {
  const { handler, state } = await createHarness();
  const earlyInvoice = await deliver(handler, tempInvoice(TEMP_SUBSCRIPTION));
  assert.equal(earlyInvoice.statusCode, 403);
  assert.equal(earlyInvoice.body.error, 'event_not_allowed');
  const knownGood = await deliver(handler, makeEvent());
  assert.equal(knownGood.statusCode, 200);
  assert.equal(state.forwarded.length, 1);
  assert.equal(state.mockedFulfillmentWrites, 1);
});

test('ordering keeps the unpinned slot on the exact Checkout Session until the subscription is pinned', async () => {
  const earlyInvoice = tempInvoice(TEMP_SUBSCRIPTION, 'evt_orderinvoice');
  const otherInvoice = tempInvoice(OTHER_SUBSCRIPTION, 'evt_orderother');
  const checkout = tempCheckout();
  const unpinned = await createHarness(tempSlotEnv());
  const invoiceFirst = await deliver(unpinned.handler, earlyInvoice);
  const subscriptionSecond = await deliver(unpinned.handler, tempSubscriptionEvent(TEMP_SUBSCRIPTION));
  const otherSubscription = await deliver(unpinned.handler, otherInvoice);
  const checkoutLast = await deliver(unpinned.handler, checkout);
  const asyncPayment = await deliver(unpinned.handler, tempCheckout(
    'checkout.session.async_payment_succeeded', {}, 'evt_tempasync1',
  ));
  const otherSession = await deliver(unpinned.handler, tempCheckout('checkout.session.completed', {
    id: 'cs_test_other123',
  }, 'evt_tempothersession'));
  const carriesPrimary = await deliver(unpinned.handler, tempCheckout('checkout.session.completed', {
    subscription: SUBSCRIPTION_ID,
  }, 'evt_tempcarriesprimary'));
  const otherCustomer = await deliver(unpinned.handler, makeEvent({
    id: 'evt_tempothercus',
    type: 'invoice.paid',
    data: { object: { id: 'in_other', customer: 'cus_other123', subscription: TEMP_SUBSCRIPTION } },
  }));
  assert.equal(invoiceFirst.statusCode, 503);
  assert.equal(invoiceFirst.body.error, 'temporarily_unavailable');
  assert.equal(subscriptionSecond.statusCode, 503);
  assert.equal(otherSubscription.statusCode, 503);
  assert.equal(checkoutLast.statusCode, 200);
  assert.equal(asyncPayment.statusCode, 200);
  assert.equal(otherSession.statusCode, 403);
  assert.equal(carriesPrimary.statusCode, 403);
  assert.equal(otherCustomer.statusCode, 403);
  assert.equal(unpinned.state.forwarded.length, 2);
  assert.equal(unpinned.state.oidcCalls, 2);
  assert.equal(unpinned.state.forwarded[0].init.body.toString('utf8'), rawPayload(checkout));
  assert.equal(unpinned.state.mockedFulfillmentWrites, 2);

  const pinned = await createHarness(tempSlotEnv(TEMP_SUBSCRIPTION));
  const retriedInvoice = await deliver(pinned.handler, earlyInvoice);
  const rejectedOther = await deliver(pinned.handler, otherInvoice);
  const sessionStill = await deliver(pinned.handler, checkout);
  assert.equal(retriedInvoice.statusCode, 200);
  assert.equal(rejectedOther.statusCode, 403);
  assert.equal(sessionStill.statusCode, 200);
  assert.equal(pinned.state.forwarded.length, 2);
  assert.equal(pinned.state.forwarded[0].init.body.toString('utf8'), rawPayload(earlyInvoice));
  assert.equal(pinned.state.oidcCalls, 2);
});

test('historical events stay accepted with absent, partial, malformed, or expired temporary configuration', async () => {
  const now = unixSeconds();
  const states = [
    { name: 'absent', env: {}, blocked: 403 },
    {
      name: 'partial',
      env: {
        STRIPE_QA_TEMP_CUSTOMER_ID: TEMP_CUSTOMER,
        STRIPE_QA_TEMP_CHECKOUT_SESSION_ID: TEMP_SESSION,
      },
      blocked: 503,
    },
    {
      name: 'malformed',
      env: { ...tempSlotEnv(), STRIPE_QA_TEMP_EXPIRES_AT: 'not-a-timestamp' },
      blocked: 503,
    },
    {
      name: 'expired',
      env: tempSlotEnv(TEMP_SUBSCRIPTION, String(now - 5)),
      blocked: 403,
    },
  ];
  for (const entry of states) {
    const { handler, state } = await createHarness(entry.env);
    const checkout = await deliver(handler, makeEvent());
    const renewal = await deliver(handler, knownInvoice(`evt_known${entry.name}`));
    const synthetic = await deliver(handler, tempCheckout('checkout.session.completed', {}, `evt_${entry.name}session`));
    assert.equal(checkout.statusCode, 200, entry.name);
    assert.equal(renewal.statusCode, 200, entry.name);
    assert.equal(synthetic.statusCode, entry.blocked, entry.name);
    assert.equal(state.forwarded.length, 2, entry.name);
    assert.equal(state.oidcCalls, 2, entry.name);
    assert.equal(state.mockedFulfillmentWrites, 2, entry.name);
  }
});

test('historical allowlist is preserved while the temporary slot is open, unpinned, and expired', async () => {
  const open = await createHarness(tempSlotEnv());
  const historicalCheckout = await deliver(open.handler, makeEvent());
  const historicalRenewal = await deliver(open.handler, knownInvoice());
  const syntheticInvoice = await deliver(open.handler, tempInvoice(TEMP_SUBSCRIPTION, 'evt_histtemp'));
  const unrelatedCheckout = await deliver(open.handler, makeEvent({
    id: 'evt_secondknown',
    data: { object: { id: 'cs_test_secondknown', subscription: 'sub_notprimary1' } },
  }));
  assert.equal(historicalCheckout.statusCode, 200);
  assert.equal(historicalRenewal.statusCode, 200);
  assert.equal(syntheticInvoice.statusCode, 503);
  assert.equal(unrelatedCheckout.statusCode, 403);
  assert.equal(open.state.forwarded.length, 2);
  assert.equal(open.state.mockedFulfillmentWrites, 2);

  const expired = await createHarness(tempSlotEnv(TEMP_SUBSCRIPTION, String(unixSeconds(-5))));
  const stillHistorical = await deliver(expired.handler, makeEvent());
  const closedCheckout = await deliver(expired.handler, tempCheckout());
  const closedInvoice = await deliver(expired.handler, tempInvoice(TEMP_SUBSCRIPTION, 'evt_closedinvoice'));
  assert.equal(stillHistorical.statusCode, 200);
  assert.equal(closedCheckout.statusCode, 403);
  assert.equal(closedInvoice.statusCode, 403);
  assert.equal(expired.state.forwarded.length, 1);
  assert.equal(expired.state.oidcCalls, 1);
});

test('pinning the temporary subscription rejects every other subscription for that customer', async () => {
  const { handler, state } = await createHarness(tempSlotEnv(TEMP_SUBSCRIPTION));
  const earlyInvoice = await deliver(handler, tempInvoice(TEMP_SUBSCRIPTION));
  const checkoutAfter = await deliver(handler, tempCheckout());
  const failedWithoutSubscription = await deliver(handler, tempCheckout(
    'checkout.session.async_payment_failed', { subscription: null }, 'evt_tempfailed',
  ));
  const otherSubscription = await deliver(handler, tempInvoice(OTHER_SUBSCRIPTION, 'evt_tempother'));
  const otherOnCheckout = await deliver(handler, tempCheckout('checkout.session.completed', {
    subscription: OTHER_SUBSCRIPTION,
  }, 'evt_tempothercheckout'));
  assert.equal(earlyInvoice.statusCode, 200);
  assert.equal(checkoutAfter.statusCode, 200);
  assert.equal(failedWithoutSubscription.statusCode, 200);
  assert.equal(otherSubscription.statusCode, 403);
  assert.equal(otherOnCheckout.statusCode, 403);
  assert.equal(state.forwarded.length, 3);
});

test('temporary slot rejects live mode, the wrong account, and event types outside the existing set', async () => {
  const valid = await createHarness(tempSlotEnv(TEMP_SUBSCRIPTION));
  const live = await deliver(valid.handler, { ...tempCheckout(), livemode: true });
  const wrongAccount = await deliver(valid.handler, { ...tempCheckout(), account: 'acct_wrong123' });
  const refund = await deliver(valid.handler, { ...tempCheckout(), type: 'charge.refunded' });
  assert.equal(live.statusCode, 403);
  assert.equal(wrongAccount.statusCode, 403);
  assert.equal(refund.statusCode, 403);
  assertNoForwardOrFulfillment(valid.state);

  const malformed = await createHarness({
    ...tempSlotEnv(TEMP_SUBSCRIPTION),
    STRIPE_QA_TEMP_EXPIRES_AT: 'not-a-timestamp',
  });
  const liveHistorical = await deliver(malformed.handler, { ...makeEvent(), livemode: true });
  const wrongHistoricalAccount = await deliver(malformed.handler, { ...makeEvent(), account: 'acct_wrong123' });
  const historicalRefund = await deliver(malformed.handler, { ...makeEvent(), type: 'charge.refunded' });
  assert.equal(liveHistorical.statusCode, 403);
  assert.equal(wrongHistoricalAccount.statusCode, 403);
  assert.equal(historicalRefund.statusCode, 403);
  assertNoForwardOrFulfillment(malformed.state);
});

test('temporary slot expiry is mandatory and strictly bounded', async () => {
  const now = unixSeconds();
  const cases = [
    { STRIPE_QA_TEMP_CUSTOMER_ID: TEMP_CUSTOMER, STRIPE_QA_TEMP_CHECKOUT_SESSION_ID: TEMP_SESSION },
    { ...tempSlotEnv(), STRIPE_QA_TEMP_EXPIRES_AT: new Date((now + 3600) * 1000).toISOString() },
    { ...tempSlotEnv(), STRIPE_QA_TEMP_EXPIRES_AT: String(now + 3600) + '000' },
    { ...tempSlotEnv(), STRIPE_QA_TEMP_EXPIRES_AT: ' ' + String(now + 3600) },
    { ...tempSlotEnv(), STRIPE_QA_TEMP_EXPIRES_AT: String(now + TEMP_SLOT_MAX_SECONDS + 1) },
    { STRIPE_QA_TEMP_EXPIRES_AT: String(now + 3600) },
    { STRIPE_QA_TEMP_CUSTOMER_ID: CUSTOMER_ID, STRIPE_QA_TEMP_CHECKOUT_SESSION_ID: TEMP_SESSION, STRIPE_QA_TEMP_EXPIRES_AT: String(now + 3600) },
    { ...tempSlotEnv(SUBSCRIPTION_ID) },
    { STRIPE_QA_TEMP_CUSTOMER_ID: TEMP_CUSTOMER },
    { STRIPE_QA_TEMP_CHECKOUT_SESSION_ID: 'cs_live_renewal123', STRIPE_QA_TEMP_EXPIRES_AT: String(now + 3600) },
    { STRIPE_QA_TEMP_SUBSCRIPTION_ID: TEMP_SUBSCRIPTION, STRIPE_QA_TEMP_EXPIRES_AT: String(now + 3600) },
  ];
  for (const envOverrides of cases) {
    const { handler, state } = await createHarness(envOverrides);
    const historical = await deliver(handler, makeEvent());
    const renewal = await deliver(handler, knownInvoice());
    const synthetic = await deliver(handler, tempCheckout());
    assert.equal(historical.statusCode, 200);
    assert.equal(renewal.statusCode, 200);
    assert.equal(synthetic.statusCode, 503);
    assert.equal(synthetic.body.error, 'temporarily_unavailable');
    assert.equal(state.forwarded.length, 2);
    assert.equal(state.oidcCalls, 2);
    assert.equal(state.mockedFulfillmentWrites, 2);
  }

  const justInside = await createHarness(tempSlotEnv(undefined, String(now + TEMP_SLOT_MAX_SECONDS)));
  const allowedCheckout = await deliver(justInside.handler, tempCheckout());
  const boundaryInvoice = await deliver(justInside.handler, tempInvoice(TEMP_SUBSCRIPTION, 'evt_boundary'));
  assert.equal(allowedCheckout.statusCode, 200);
  assert.equal(boundaryInvoice.statusCode, 503);
  assert.equal(justInside.state.forwarded.length, 1);

  const atNow = await createHarness(tempSlotEnv(TEMP_SUBSCRIPTION, String(now)));
  const expiredCheckout = await deliver(atNow.handler, tempCheckout());
  const historical = await deliver(atNow.handler, makeEvent());
  assert.equal(expiredCheckout.statusCode, 403);
  assert.equal(historical.statusCode, 200);
  assert.equal(atNow.state.forwarded.length, 1);
});

test('duplicate delivery repeats the same allowlist decision without forwarding a retryable event', async () => {
  const checkout = tempCheckout();
  const checkoutBody = rawPayload(checkout);
  const invoice = tempInvoice(TEMP_SUBSCRIPTION, 'evt_dupinvoice');
  const invoiceBody = rawPayload(invoice);
  const unpinned = await createHarness(tempSlotEnv());
  const checkoutSignature = signatureFor(checkoutBody);
  const firstCheckout = await invoke(unpinned.handler, makeRequest(checkoutBody, checkoutSignature));
  const secondCheckout = await invoke(unpinned.handler, makeRequest(checkoutBody, checkoutSignature));
  const invoiceSignature = signatureFor(invoiceBody);
  const firstInvoice = await invoke(unpinned.handler, makeRequest(invoiceBody, invoiceSignature));
  const secondInvoice = await invoke(unpinned.handler, makeRequest(invoiceBody, invoiceSignature));
  assert.equal(firstCheckout.statusCode, 200);
  assert.equal(secondCheckout.statusCode, 200);
  assert.equal(firstInvoice.statusCode, 503);
  assert.equal(secondInvoice.statusCode, 503);
  assert.equal(unpinned.state.forwarded.length, 2);
  assert.equal(unpinned.state.oidcCalls, 2);
  assert.equal(unpinned.state.forwarded[0].init.body.toString('utf8'), checkoutBody);
  assert.equal(unpinned.state.forwarded[1].init.body.toString('utf8'), checkoutBody);
  assert.equal(unpinned.state.mockedFulfillmentWrites, 2);

  const pinned = await createHarness(tempSlotEnv(TEMP_SUBSCRIPTION));
  const pinnedSignature = signatureFor(invoiceBody);
  const firstPinned = await invoke(pinned.handler, makeRequest(invoiceBody, pinnedSignature));
  const secondPinned = await invoke(pinned.handler, makeRequest(invoiceBody, pinnedSignature));
  assert.equal(firstPinned.statusCode, 200);
  assert.equal(secondPinned.statusCode, 200);
  assert.equal(pinned.state.forwarded.length, 2);
  assert.equal(pinned.state.forwarded[0].init.body.toString('utf8'), invoiceBody);
  assert.equal(pinned.state.forwarded[1].init.body.toString('utf8'), invoiceBody);
});

test('upstream timeout, signature verification, and OIDC forwarding stay in place', () => {
  assert.match(RELAY_SOURCE, /AbortSignal\.timeout\(12000\)/);
  assert.match(RELAY_SOURCE, /function verifyStripeSignature/);
  assert.match(RELAY_SOURCE, /x-vercel-trusted-oidc-idp-token/);
  assert.match(RELAY_SOURCE, /event\.livemode !== false/);
  assert.match(RELAY_SOURCE, /event\.account !== expectedAccount/);
});
