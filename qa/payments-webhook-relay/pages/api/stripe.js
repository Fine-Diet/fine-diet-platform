import { createHmac, timingSafeEqual } from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';

export const config = { api: { bodyParser: false } };

const MAX_BODY_BYTES = 1024 * 1024;
const SIGNATURE_TOLERANCE_SECONDS = 300;
const PROJECT_SLUG = 'fine-diet-payments-qa-target';
const TARGET_PATH = '/api/webhooks/stripe';
const ALLOWED_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.payment_action_required',
]);

function respond(res, status, code) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: code });
}

function validId(value, prefix) {
  return typeof value === 'string' && new RegExp('^' + prefix + '[A-Za-z0-9]+$').test(value);
}

function getId(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
  return null;
}

function eventReferences(event) {
  const object = event?.data?.object;
  if (!object || typeof object !== 'object') return { subscriptionId: null, customerId: null };
  const parentSubscription = object.parent?.subscription_details?.subscription;
  const subscriptionId = event.type?.startsWith('customer.subscription.')
    ? getId(object)
    : getId(object.subscription) || getId(parentSubscription);
  const parentCustomer = object.parent?.subscription_details?.customer;
  const customerId = getId(object.customer) || getId(parentCustomer);
  return { subscriptionId, customerId };
}

const TEMP_CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/;
const TEMP_SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]+$/;
const TEMP_CHECKOUT_SESSION_ID = /^cs_test_[A-Za-z0-9]+$/;
const TEMP_EXPIRES_AT = /^[1-9][0-9]{9}$/;
const TEMP_SLOT_MAX_SECONDS = 7 * 24 * 60 * 60;

function readSlotId(value, pattern) {
  if (value == null || value === '') return { kind: 'absent' };
  if (typeof value === 'string' && pattern.test(value)) return { kind: 'valid', value };
  return { kind: 'invalid' };
}

function readExpiry(value, nowSeconds) {
  if (value == null || value === '') return { kind: 'absent' };
  if (typeof value !== 'string' || !TEMP_EXPIRES_AT.test(value)) return { kind: 'invalid' };
  const expiresAt = Number(value);
  if (!Number.isSafeInteger(expiresAt)) return { kind: 'invalid' };
  if (expiresAt > nowSeconds + TEMP_SLOT_MAX_SECONDS) return { kind: 'invalid' };
  return { kind: 'valid', expiresAt, expired: expiresAt <= nowSeconds };
}

// HTTP 403 and HTTP 503 are both failed deliveries. Stripe sandbox retries of
// failed deliveries are limited, so neither status acknowledges the event.
// The historical allowlist is decided before temporary configuration is read.
// Before the synthetic subscription id is pinned, only the exact Checkout
// Session is forwarded. Eligible subscription and invoice events for that
// customer return 503. The slot requires a 10-digit Unix expiry no more than
// seven days ahead. After that instant the temporary customer closes.
function readTemporarySlot(env, primaryCustomer, primarySubscription, nowSeconds) {
  const customer = readSlotId(env.STRIPE_QA_TEMP_CUSTOMER_ID, TEMP_CUSTOMER_ID);
  const session = readSlotId(env.STRIPE_QA_TEMP_CHECKOUT_SESSION_ID, TEMP_CHECKOUT_SESSION_ID);
  const subscription = readSlotId(env.STRIPE_QA_TEMP_SUBSCRIPTION_ID, TEMP_SUBSCRIPTION_ID);
  const expiry = readExpiry(env.STRIPE_QA_TEMP_EXPIRES_AT, nowSeconds);
  if (customer.kind === 'invalid' || session.kind === 'invalid' ||
      subscription.kind === 'invalid' || expiry.kind === 'invalid') {
    return { error: true };
  }
  const identityConfigured = customer.kind === 'valid' || session.kind === 'valid' ||
    subscription.kind === 'valid' || expiry.kind === 'valid';
  if (!identityConfigured) return { slot: null };
  if (customer.kind !== 'valid' || session.kind !== 'valid' || expiry.kind !== 'valid') {
    return { error: true };
  }
  if (customer.value === primaryCustomer) return { error: true };
  if (subscription.kind === 'valid' && subscription.value === primarySubscription) return { error: true };
  return {
    slot: {
      customerId: customer.value,
      sessionId: session.value,
      subscriptionId: subscription.kind === 'valid' ? subscription.value : null,
      expired: expiry.expired,
    },
  };
}

function checkoutSessionId(event) {
  if (!event?.type?.startsWith('checkout.session.')) return null;
  const id = event.data?.object?.id;
  return typeof id === 'string' ? id : null;
}

function temporarySlotDecision(event, slot, primarySubscription) {
  if (!slot || slot.expired) return 'deny';
  const { subscriptionId, customerId } = eventReferences(event);
  if (customerId !== slot.customerId) return 'deny';
  if (subscriptionId === primarySubscription) return 'deny';
  if (subscriptionId && !validId(subscriptionId, 'sub_')) return 'deny';

  if (event.type.startsWith('checkout.session.')) {
    if (checkoutSessionId(event) !== slot.sessionId) return 'deny';
    if (slot.subscriptionId && subscriptionId && subscriptionId !== slot.subscriptionId) return 'deny';
    return 'allow';
  }

  if (!subscriptionId) return 'deny';
  if (!slot.subscriptionId) return 'retry';
  if (subscriptionId !== slot.subscriptionId) return 'deny';
  return 'allow';
}

function verifyStripeSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !secret) return false;

  const fields = header.split(',').map((part) => part.trim());
  const timestamps = fields.filter((part) => part.startsWith('t=')).map((part) => part.slice(2));
  const signatures = fields.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (timestamps.length !== 1 || !/^\d{1,12}$/.test(timestamps[0]) ||
      !signatures.length || signatures.some((value) => !/^[a-f0-9]{64}$/.test(value))) return false;

  const timestamp = Number(timestamps[0]);
  if (!Number.isSafeInteger(timestamp) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const signedPayload = Buffer.concat([Buffer.from(timestamps[0] + '.', 'utf8'), rawBody]);
  const expected = createHmac('sha256', secret).update(signedPayload).digest();
  return signatures.some((signature) => {
    const supplied = Buffer.from(signature, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

async function readRawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error('body_too_large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

function getFixedTargetUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const projectHost = host === PROJECT_SLUG + '.vercel.app' ||
      (host.startsWith(PROJECT_SLUG + '-') && host.endsWith('.vercel.app'));
    if (url.protocol !== 'https:' || !projectHost || url.username || url.password ||
        url.port || url.search || url.hash || url.pathname !== TARGET_PATH) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(res, 405, 'method_not_allowed');
  }

  const contentLength = req.headers['content-length'];
  if (contentLength !== undefined) {
    if (typeof contentLength !== 'string' || !/^\d+$/.test(contentLength)) {
      return respond(res, 400, 'invalid_content_length');
    }
    if (Number(contentLength) > MAX_BODY_BYTES) return respond(res, 413, 'payload_too_large');
  }

  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') return respond(res, 400, 'missing_signature');

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    if (error instanceof Error && error.message === 'body_too_large') {
      return respond(res, 413, 'payload_too_large');
    }
    console.warn('payments_qa_relay_rejected', { reason: 'body_read_failed' });
    return respond(res, 400, 'invalid_request');
  }

  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signingSecret || !verifyStripeSignature(rawBody, signature, signingSecret)) {
    console.warn('payments_qa_relay_rejected', { reason: signingSecret ? 'signature_invalid' : 'configuration_missing' });
    return respond(res, signingSecret ? 400 : 503, signingSecret ? 'invalid_signature' : 'temporarily_unavailable');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return respond(res, 400, 'invalid_signed_payload');
  }

  const expectedEventId = process.env.STRIPE_QA_CHECKOUT_EVENT_ID;
  const expectedSubscription = process.env.STRIPE_QA_SUBSCRIPTION_ID;
  const expectedCustomer = process.env.STRIPE_QA_CUSTOMER_ID;
  const expectedAccount = process.env.STRIPE_QA_ACCOUNT_ID;
  if (!validId(expectedEventId, 'evt_') || !validId(expectedSubscription, 'sub_') ||
      !validId(expectedCustomer, 'cus_') || !validId(expectedAccount, 'acct_')) {
    console.warn('payments_qa_relay_rejected', { reason: 'allowlist_missing' });
    return respond(res, 503, 'temporarily_unavailable');
  }

  if (event.livemode !== false || (event.account && event.account !== expectedAccount) ||
      !ALLOWED_EVENT_TYPES.has(event.type)) {
    return respond(res, 403, 'event_not_allowed');
  }

  const { subscriptionId, customerId } = eventReferences(event);
  const checkoutEventAllowed = event.id === expectedEventId &&
    event.type === 'checkout.session.completed' && customerId === expectedCustomer;
  const lifecycleEventAllowed = subscriptionId === expectedSubscription &&
    customerId === expectedCustomer;
  if (!checkoutEventAllowed && !lifecycleEventAllowed) {
    const temporarySlot = readTemporarySlot(
      process.env,
      expectedCustomer,
      expectedSubscription,
      Math.floor(Date.now() / 1000),
    );
    if (temporarySlot.error) {
      console.warn('payments_qa_relay_rejected', { reason: 'temporary_allowlist_invalid' });
      return respond(res, 503, 'temporarily_unavailable');
    }
    const temporaryDecision = temporarySlotDecision(
      event, temporarySlot.slot, expectedSubscription,
    );
    if (temporaryDecision === 'retry') {
      console.warn('payments_qa_relay_rejected', { reason: 'temporary_subscription_unpinned' });
      return respond(res, 503, 'temporarily_unavailable');
    }
    if (temporaryDecision !== 'allow') {
      return respond(res, 403, 'event_not_allowed');
    }
  }

  const targetUrl = getFixedTargetUrl(process.env.PAYMENTS_TARGET_URL);
  if (!targetUrl) {
    console.warn('payments_qa_relay_rejected', { reason: 'target_configuration_invalid' });
    return respond(res, 503, 'temporarily_unavailable');
  }

  let oidcToken;
  try {
    oidcToken = await getVercelOidcToken();
  } catch {
    console.warn('payments_qa_relay_rejected', { reason: 'oidc_unavailable' });
    return respond(res, 503, 'temporarily_unavailable');
  }
  if (!oidcToken) {
    console.warn('payments_qa_relay_rejected', { reason: 'oidc_unavailable' });
    return respond(res, 503, 'temporarily_unavailable');
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
        'x-vercel-trusted-oidc-idp-token': oidcToken,
      },
      body: rawBody,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    console.error('payments_qa_relay_delivery_failed', {
      event_id: event.id,
      event_type: event.type,
      reason: 'upstream_unavailable',
    });
    return respond(res, 502, 'delivery_failed');
  }

  if (upstream.status < 200 || upstream.status >= 300) {
    console.error('payments_qa_relay_delivery_failed', {
      event_id: event.id,
      event_type: event.type,
      target_status: upstream.status,
    });
    return respond(res, 502, 'delivery_failed');
  }

  console.info('payments_qa_relay_delivered', {
    event_id: event.id,
    event_type: event.type,
    target_status: upstream.status,
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(upstream.status).end();
}
