/**
 * Stripe webhook: signed events route work; current provider objects determine
 * access. The atomic path commits business writes and the receipt together.
 * Legacy sandbox behavior remains for staged migration, never for live mode.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { buffer } from 'micro';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/stripeServer';
import { getStripeAccountContext } from '@/lib/stripe/stripeAccountContext';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { handleStripeCheckoutCompleted as ensureProgramAssignmentFromStripe } from '@/lib/plans/programAssignmentAutomationServerService';
import { resolveEffectiveOfferEntitlementMappings } from '@/lib/access/offerEntitlementMappings';
import { claimStripeEvent, completeStripeEvent, releaseStripeEvent } from '@/lib/stripe/stripeWebhookEventStore';
import { atomicFulfillmentEnabled, commitStripeFulfillment, type FulfillmentInstance, type FulfillmentReceipt } from '@/lib/stripe/stripeAtomicFulfillment';
import { checkoutPaymentReady, readFineDietAttribution, stripeReferenceId, subscriptionAccessState, type PurchaseAccessState } from '@/lib/stripe/stripeLifecyclePolicy';
import { resolveRenewalAccess, type RenewalAccessDecision } from '@/lib/stripe/stripeRenewalCoverage';

export const config = { api: { bodyParser: false } };
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
interface PurchaseInstance extends FulfillmentInstance {
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_subscription_id: string | null;
  stripe_payment_intent_id: string | null;
}
interface Attempt {
  receipt: FulfillmentReceipt;
  context: ReturnType<typeof getStripeAccountContext>;
  atomic: boolean;
}
const INSTANCE_FIELDS = 'id, person_id, offer_key, status, stripe_customer_id, stripe_checkout_session_id, stripe_subscription_id, stripe_payment_intent_id, price_option_key';
async function findInstance(column: 'stripe_checkout_session_id' | 'stripe_subscription_id' | 'stripe_payment_intent_id', value: string, atomic: boolean): Promise<PurchaseInstance | null> {
  const fields = atomic ? `${INSTANCE_FIELDS}, fulfillment_revision` : INSTANCE_FIELDS;
  const { data, error } = await supabaseAdmin.from('stripe_offer_instances').select(fields).eq(column, value).maybeSingle();
  if (error) throw error;
  return data as PurchaseInstance | null;
}
function assertObjectMode(object: { livemode: boolean }): void {
  if (object.livemode !== getStripeAccountContext().livemode) throw new Error('Retrieved Stripe object mode mismatch');
}
function assertAttribution(instance: PurchaseInstance, metadata: Stripe.Metadata | null | undefined): void {
  const attribution = readFineDietAttribution(metadata);
  if (attribution && (attribution.personId !== instance.person_id || attribution.offerKey !== instance.offer_key)) {
    throw new Error('Stripe attribution conflicts with the durable purchase');
  }
}
function assertCustomer(instance: PurchaseInstance, customer: unknown): void {
  if (!instance.stripe_customer_id || stripeReferenceId(customer) !== instance.stripe_customer_id) throw new Error('Stripe customer conflicts with the durable purchase');
}

/** Legacy sandbox path only; atomic fulfillment performs these writes in SQL. */
async function grantEntitlementsForOffer(personId: string, offerKey: string, sourceRef: string): Promise<void> {
  const { data: mappings, error: mappingError } = await supabaseAdmin.from('offer_entitlements')
    .select('entitlement_key, duration_days, is_active').eq('offer_key', offerKey).eq('is_active', true);
  if (mappingError) throw mappingError;
  const effective = resolveEffectiveOfferEntitlementMappings(offerKey, mappings);
  if (!effective.length) throw new Error(`No active entitlement mappings for purchased offer ${offerKey}`);
  const now = new Date();
  for (const mapping of effective) {
    const { data: existing, error: readError } = await supabaseAdmin.from('person_entitlements')
      .select('id, is_active, ends_at').eq('person_id', personId).eq('entitlement_key', mapping.entitlement_key)
      .eq('source', 'stripe').eq('source_ref', sourceRef).maybeSingle();
    if (readError) throw readError;
    if (existing) {
      if (existing.ends_at && new Date(existing.ends_at).getTime() <= now.getTime()) continue;
      if (existing.is_active) continue;
      const { data: updated, error } = await supabaseAdmin.from('person_entitlements')
        .update({ is_active: true, updated_at: now.toISOString() }).eq('id', existing.id).select('id');
      if (error) throw error;
      if (!updated || updated.length !== 1) throw new Error('Entitlement recovery did not update the expected row');
      continue;
    }
    const row: Record<string, unknown> = {
      person_id: personId, entitlement_key: mapping.entitlement_key, is_active: true,
      starts_at: now.toISOString(), source: 'stripe', source_ref: sourceRef,
      note: `Granted via Stripe checkout for offer: ${offerKey}`,
    };
    if (mapping.duration_days && mapping.duration_days > 0) {
      const endsAt = new Date(now); endsAt.setDate(endsAt.getDate() + mapping.duration_days); row.ends_at = endsAt.toISOString();
    }
    const { error } = await supabaseAdmin.from('person_entitlements').insert(row);
    if (error) throw error;
  }
}
async function revokeEntitlementsBySourceRef(personId: string, sourceRef: string): Promise<void> {
  const { data: active, error: readError } = await supabaseAdmin.from('person_entitlements')
    .select('id').eq('person_id', personId).eq('source', 'stripe').eq('source_ref', sourceRef).eq('is_active', true);
  if (readError) throw readError;
  for (const entitlement of active || []) {
    const { data: updated, error } = await supabaseAdmin.from('person_entitlements')
      .update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', entitlement.id).select('id');
    if (error) throw error;
    if (!updated || updated.length !== 1) throw new Error('Entitlement revocation did not update the expected row');
  }
}

/** Returns true only if the atomic RPC also completed the delivery receipt. */
async function applyPurchaseState(
  instance: PurchaseInstance, state: PurchaseAccessState, sourceRef: string, attempt: Attempt,
  identifiers: Record<string, string | null> = {}, checkoutRecord: Record<string, string | null> | null = null,
  paidThrough: string | null = null,
): Promise<boolean> {
  if (!['pending', 'active', 'canceled', 'ended'].includes(instance.status)) throw new Error('Unknown purchase state');
  const nextState = instance.status === 'ended' ? 'ended' : state;
  if (attempt.atomic) {
    await commitStripeFulfillment({ instance, state: nextState, sourceRef, identifiers,
      paidThrough: nextState === 'active' ? paidThrough : null,
      checkoutRecord: nextState === 'active' ? checkoutRecord : null, context: attempt.context, receipt: attempt.receipt });
    return true;
  }
  const { data: updated, error } = await supabaseAdmin.from('stripe_offer_instances')
    .update({ ...identifiers, status: nextState }).eq('id', instance.id).eq('person_id', instance.person_id)
    .eq('offer_key', instance.offer_key).eq('stripe_customer_id', instance.stripe_customer_id).eq('status', instance.status).select('id');
  if (error) throw error;
  if (!updated || updated.length !== 1) throw new Error('Purchase changed during reconciliation; retry required');
  if (nextState !== 'active') {
    await revokeEntitlementsBySourceRef(instance.person_id, sourceRef); return false;
  }
  await grantEntitlementsForOffer(instance.person_id, instance.offer_key, sourceRef);
  const assignment = await ensureProgramAssignmentFromStripe({ personId: instance.person_id, offerKey: instance.offer_key, sourceRef });
  if (assignment.action === 'skipped_error') throw new Error(`Program assignment failed: ${assignment.reason}`);
  return false;
}
async function retrieveSubscription(id: string, instance: PurchaseInstance): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(id, { expand: ['latest_invoice'] });
  if (subscription.id !== id) throw new Error('Retrieved subscription identity mismatch');
  assertObjectMode(subscription); assertCustomer(instance, subscription.customer); assertAttribution(instance, subscription.metadata);
  return subscription;
}
async function currentAccessState(subscription: Stripe.Subscription, instance: PurchaseInstance, attempt: Attempt): Promise<RenewalAccessDecision> {
  // Every invoice read happens after the purchase revision was captured. A
  // concurrent commit invalidates it; failed evidence reads never imply revoke.
  if (attempt.atomic) return resolveRenewalAccess(subscription, instance.status);
  return { state: subscriptionAccessState(subscription, instance.status), paidThrough: null };
}
function checkoutRecord(session: Stripe.Checkout.Session): Record<string, string | null> {
  const metadata = session.metadata ?? {};
  return {
    stripe_checkout_session_id: session.id, placement: metadata.placement || null, source: metadata.source || null,
    session_id: metadata.fd_sid || null, utm_source: metadata.utm_source || null, utm_medium: metadata.utm_medium || null,
    utm_campaign: metadata.utm_campaign || null, utm_content: metadata.utm_content || null, utm_term: metadata.utm_term || null,
  };
}
async function recordCompletedCheckout(session: Stripe.Checkout.Session, instance: PurchaseInstance): Promise<void> {
  const { data: existing, error: readError } = await supabaseAdmin.from('checkout_events')
    .select('id').eq('event_type', 'checkout_completed').eq('stripe_checkout_session_id', session.id).maybeSingle();
  if (readError) throw readError;
  if (existing) return;
  const { error } = await supabaseAdmin.from('checkout_events').insert({
    ...checkoutRecord(session), event_type: 'checkout_completed', person_id: instance.person_id, offer_key: instance.offer_key,
    stripe_subscription_id: stripeReferenceId(session.subscription), stripe_payment_intent_id: stripeReferenceId(session.payment_intent),
  });
  if (error) throw error;
}
async function reconcileCheckout(snapshot: Stripe.Checkout.Session, eventType: string, attempt: Attempt): Promise<boolean> {
  // Capture the database revision BEFORE the provider read. Reversing this order
  // can apply stale provider data after a competing event has already committed.
  const instance = await findInstance('stripe_checkout_session_id', snapshot.id, attempt.atomic);
  const session = await stripe.checkout.sessions.retrieve(snapshot.id);
  if (session.id !== snapshot.id) throw new Error('Retrieved checkout identity mismatch');
  assertObjectMode(session);
  const attribution = readFineDietAttribution(session.metadata), originalAttribution = readFineDietAttribution(snapshot.metadata);
  if (!instance) {
    if (!attribution && !originalAttribution) return false;
    throw new Error('Attributed checkout has no durable purchase instance yet');
  }
  assertAttribution(instance, session.metadata); assertAttribution(instance, snapshot.metadata); assertCustomer(instance, session.customer);
  const subscriptionId = stripeReferenceId(session.subscription), paymentIntentId = stripeReferenceId(session.payment_intent);
  if (instance.stripe_subscription_id && instance.stripe_subscription_id !== subscriptionId) throw new Error('Checkout subscription conflicts with the durable purchase');
  if (instance.stripe_payment_intent_id && instance.stripe_payment_intent_id !== paymentIntentId) throw new Error('Checkout payment conflicts with the durable purchase');
  const sourceRef = subscriptionId || paymentIntentId || session.id;
  const identifiers = { stripe_subscription_id: subscriptionId, stripe_payment_intent_id: paymentIntentId };
  if (!checkoutPaymentReady(session)) {
    if (eventType === 'checkout.session.async_payment_failed') {
      return applyPurchaseState(instance, instance.status === 'ended' ? 'ended' : 'canceled', sourceRef, attempt, identifiers);
    }
    return false;
  }
  let state: PurchaseAccessState = instance.status === 'ended' ? 'ended' : 'active';
  let paidThrough: string | null = null;
  if (session.mode === 'subscription') {
    if (!subscriptionId) throw new Error('Subscription checkout is missing a subscription');
    const decision = await currentAccessState(await retrieveSubscription(subscriptionId, instance), instance, attempt);
    state = decision.state; paidThrough = decision.paidThrough;
  } else if (session.mode !== 'payment') throw new Error('Unsupported checkout mode for purchased access');
  const committed = await applyPurchaseState(instance, state, sourceRef, attempt, identifiers,
    state === 'active' ? checkoutRecord(session) : null, paidThrough);
  if (committed || state !== 'active') return committed;
  // The atomic path commits its receipt together with access. Legacy sandbox
  // completion keeps the historical attribution record only; schedule APIs
  // are deliberately disabled for unsupported billing models.
  await recordCompletedCheckout(session, instance);
  return false;
}
async function reconcileSubscription(subscriptionId: string, attempt: Attempt, snapshotMetadata?: Stripe.Metadata | null): Promise<boolean> {
  const instance = await findInstance('stripe_subscription_id', subscriptionId, attempt.atomic);
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
  if (subscription.id !== subscriptionId) throw new Error('Retrieved subscription identity mismatch');
  assertObjectMode(subscription);
  const attribution = readFineDietAttribution(subscription.metadata), originalAttribution = readFineDietAttribution(snapshotMetadata);
  if (!instance) {
    if (!attribution && !originalAttribution) return false;
    throw new Error('Attributed subscription has no linked purchase instance yet');
  }
  assertCustomer(instance, subscription.customer); assertAttribution(instance, subscription.metadata); assertAttribution(instance, snapshotMetadata);
  const decision = await currentAccessState(subscription, instance, attempt);
  return applyPurchaseState(instance, decision.state, subscriptionId, attempt, {}, null, decision.paidThrough);
}
async function recordStripeRiskEvent(event: Stripe.Event, attempt: Attempt): Promise<boolean> {
  const eventObject = event.data.object as unknown as Record<string, unknown>;
  const riskKind = event.type === 'charge.refunded' ? 'refund'
    : event.type === 'charge.dispute.created' ? 'dispute' : 'early_fraud_warning';
  const chargeRef = riskKind === 'refund' ? eventObject.id
    : riskKind === 'dispute' ? stripeReferenceId(eventObject.charge)
      : stripeReferenceId(eventObject.charge);
  if (typeof chargeRef !== 'string' || !/^ch_[A-Za-z0-9]+$/.test(chargeRef)) {
    throw new Error('Risk event has no valid charge reference');
  }
  const charge = await stripe.charges.retrieve(chargeRef, { expand: ['invoice'] }) as unknown as Stripe.Charge & { invoice?: Stripe.Invoice | string | null };
  if (charge.id !== chargeRef) throw new Error('Retrieved risk charge identity mismatch');
  assertObjectMode(charge);
  const customerId = stripeReferenceId(charge.customer);
  if (!customerId) throw new Error('Risk charge has no customer');
  const paymentIntentId = stripeReferenceId(charge.payment_intent);
  const invoice = typeof charge.invoice === 'object' && charge.invoice ? charge.invoice as Stripe.Invoice : null;
  const subscriptionId = invoice ? invoiceSubscriptionId(invoice) : null;
  let instance = subscriptionId
    ? await findInstance('stripe_subscription_id', subscriptionId, attempt.atomic)
    : null;
  if (!instance && paymentIntentId) instance = await findInstance('stripe_payment_intent_id', paymentIntentId, attempt.atomic);
  if (instance) assertCustomer(instance, customerId);
  const sourceRef = instance?.stripe_subscription_id || subscriptionId || paymentIntentId || chargeRef;
  const { data, error } = await supabaseAdmin.rpc('fd_record_stripe_risk_review', { p_input: {
    event_id: event.id, token: attempt.receipt.token,
    account_id: attempt.context.accountId, livemode: attempt.context.livemode,
    risk_kind: riskKind, source_ref: sourceRef,
    instance_id: instance?.id ?? null, person_id: instance?.person_id ?? null,
    customer_id: instance?.stripe_customer_id ?? null,
  } });
  if (error) throw error;
  if (!data || data.receipt_completed !== true ||
      (data.status !== 'committed' && data.status !== 'already_processed')) {
    throw new Error('Risk review event was not durably recorded');
  }
  return true;
}
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = invoice as Stripe.Invoice & { subscription?: unknown };
  return stripeReferenceId(invoice.parent?.subscription_details?.subscription ?? legacy.subscription);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end('Method Not Allowed'); }
  if (!webhookSecret) return res.status(500).json({ error: 'Webhook secret not configured' });
  let rawBody: Buffer;
  try { rawBody = await buffer(req); } catch { return res.status(400).json({ error: 'Failed to read request body' }); }
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing stripe-signature header' });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret); }
  catch { return res.status(400).json({ error: 'Webhook signature verification failed' }); }
  let context: ReturnType<typeof getStripeAccountContext>;
  try { context = getStripeAccountContext(); } catch { return res.status(503).json({ error: 'Stripe deployment context unavailable' }); }
  if (event.livemode !== context.livemode || (event.account && event.account !== context.accountId)) return res.status(400).json({ error: 'Stripe event does not match this deployment' });
  let atomic: boolean;
  try { atomic = atomicFulfillmentEnabled(context.livemode); }
  catch { return res.status(503).json({ error: 'Atomic Stripe fulfillment is required before live activation' }); }
  let token: string;
  try {
    const claim = await claimStripeEvent(event);
    if (claim.status === 'processed') return res.status(200).json({ received: true, duplicate: true });
    token = claim.token;
  } catch (error) {
    console.error('[stripe-webhook] Could not claim event:', error); return res.status(503).json({ error: 'Stripe event temporarily unavailable' });
  }
  const attempt: Attempt = { context, atomic, receipt: { eventId: event.id, token } };
  try {
    let committed = false;
    switch (event.type) {
      case 'charge.refunded':
      case 'charge.dispute.created':
      case 'radar.early_fraud_warning.created':
        committed = await recordStripeRiskEvent(event, attempt); break;
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
        committed = await reconcileCheckout(event.data.object as Stripe.Checkout.Session, event.type, attempt); break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        const subscription = event.data.object as Stripe.Subscription;
        committed = await reconcileSubscription(subscription.id, attempt, subscription.metadata); break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'invoice.payment_action_required': {
        const subscriptionId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
        if (subscriptionId) committed = await reconcileSubscription(subscriptionId, attempt); break;
      }
      default: break;
    }
    // The SQL path completed this marker in the SAME transaction as access.
    if (!committed) await completeStripeEvent(event.id, token);
  } catch (error) {
    console.error(`[stripe-webhook] Error processing ${event.type}:`, error);
    try { await releaseStripeEvent(event.id, token); } catch (releaseError) { console.error('[stripe-webhook] Event lease release failed:', releaseError); }
    return res.status(500).json({ error: 'Stripe event processing failed' });
  }
  return res.status(200).json({ received: true });
}
