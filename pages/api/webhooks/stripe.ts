/**
 * Stripe webhook: verify signature/environment, claim a receipt, and reconcile
 * current Stripe objects with a server-created Fine Diet purchase.
 * Event snapshots route work; they are not current billing/access truth.
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
import {
  checkoutPaymentReady, readFineDietAttribution, stripeReferenceId,
  subscriptionAccessState, type PurchaseAccessState,
} from '@/lib/stripe/stripeLifecyclePolicy';

export const config = { api: { bodyParser: false } };
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

interface PurchaseInstance {
  id: string;
  person_id: string;
  offer_key: string;
  status: string;
  stripe_customer_id: string;
  stripe_checkout_session_id: string | null;
  stripe_subscription_id: string | null;
  stripe_payment_intent_id: string | null;
  price_option_key: string | null;
}
const INSTANCE_FIELDS = 'id, person_id, offer_key, status, stripe_customer_id, stripe_checkout_session_id, stripe_subscription_id, stripe_payment_intent_id, price_option_key';

async function findInstance(column: 'stripe_checkout_session_id' | 'stripe_subscription_id', value: string): Promise<PurchaseInstance | null> {
  const { data, error } = await supabaseAdmin.from('stripe_offer_instances')
    .select(INSTANCE_FIELDS).eq(column, value).maybeSingle();
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
  if (!instance.stripe_customer_id || stripeReferenceId(customer) !== instance.stripe_customer_id) {
    throw new Error('Stripe customer conflicts with the durable purchase');
  }
}

/** Preserve same-source grants and their original time limits during recovery. */
async function grantEntitlementsForOffer(personId: string, offerKey: string, sourceRef: string): Promise<void> {
  const { data: mappings, error: mappingError } = await supabaseAdmin.from('offer_entitlements')
    .select('entitlement_key, duration_days, is_active').eq('offer_key', offerKey).eq('is_active', true);
  if (mappingError) throw mappingError;
  const effective = resolveEffectiveOfferEntitlementMappings(offerKey, mappings);
  if (!effective.length) throw new Error(`No active entitlement mappings for purchased offer ${offerKey}`);
  const now = new Date();
  for (const mapping of effective) {
    const { data: existing, error: readError } = await supabaseAdmin.from('person_entitlements')
      .select('id, is_active, ends_at').eq('person_id', personId)
      .eq('entitlement_key', mapping.entitlement_key).eq('source', 'stripe').eq('source_ref', sourceRef).maybeSingle();
    if (readError) throw readError;
    if (existing) {
      // Recovery must not create a fresh duration or resurrect expired access.
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
      const endsAt = new Date(now); endsAt.setDate(endsAt.getDate() + mapping.duration_days);
      row.ends_at = endsAt.toISOString();
    }
    const { error } = await supabaseAdmin.from('person_entitlements').insert(row);
    // A conflict with a different purchase is not evidence of a successful grant.
    if (error) throw error;
  }
}
async function revokeEntitlementsBySourceRef(personId: string, sourceRef: string): Promise<void> {
  const { data: active, error: readError } = await supabaseAdmin.from('person_entitlements')
    .select('id').eq('person_id', personId).eq('source', 'stripe').eq('source_ref', sourceRef).eq('is_active', true);
  if (readError) throw readError;
  for (const entitlement of active || []) {
    const { data: updated, error } = await supabaseAdmin.from('person_entitlements')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', entitlement.id).select('id');
    if (error) throw error;
    if (!updated || updated.length !== 1) throw new Error('Entitlement revocation did not update the expected row');
  }
}

/**
 * Optimistic state guard catches a state change between read and update. It does
 * NOT fence every side effect after this update: cross-event serialization and
 * lease-expiry fencing remain explicit pre-live gates.
 */
async function applyPurchaseState(
  instance: PurchaseInstance, state: PurchaseAccessState, sourceRef: string,
  identifiers: Record<string, string | null> = {},
): Promise<void> {
  if (!['pending', 'active', 'canceled', 'ended'].includes(instance.status)) throw new Error('Unknown purchase state');
  const nextState = instance.status === 'ended' ? 'ended' : state;
  const { data: updated, error } = await supabaseAdmin.from('stripe_offer_instances')
    .update({ ...identifiers, status: nextState })
    .eq('id', instance.id).eq('person_id', instance.person_id).eq('offer_key', instance.offer_key)
    .eq('stripe_customer_id', instance.stripe_customer_id).eq('status', instance.status).select('id');
  if (error) throw error;
  if (!updated || updated.length !== 1) throw new Error('Purchase changed during reconciliation; retry required');
  if (nextState !== 'active') {
    await revokeEntitlementsBySourceRef(instance.person_id, sourceRef);
    return;
  }
  await grantEntitlementsForOffer(instance.person_id, instance.offer_key, sourceRef);
  const assignment = await ensureProgramAssignmentFromStripe({ personId: instance.person_id, offerKey: instance.offer_key, sourceRef });
  if (assignment.action === 'skipped_error') throw new Error(`Program assignment failed: ${assignment.reason}`);
}
async function retrieveSubscription(id: string, instance: PurchaseInstance): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(id, { expand: ['latest_invoice'] });
  if (subscription.id !== id) throw new Error('Retrieved subscription identity mismatch');
  assertObjectMode(subscription); assertCustomer(instance, subscription.customer);
  assertAttribution(instance, subscription.metadata);
  return subscription;
}
async function recordCompletedCheckout(session: Stripe.Checkout.Session, instance: PurchaseInstance): Promise<void> {
  const { data: existing, error: readError } = await supabaseAdmin.from('checkout_events')
    .select('id').eq('event_type', 'checkout_completed').eq('stripe_checkout_session_id', session.id).maybeSingle();
  if (readError) throw readError;
  if (existing) return;
  const metadata = session.metadata ?? {};
  const { error } = await supabaseAdmin.from('checkout_events').insert({
    event_type: 'checkout_completed', person_id: instance.person_id, offer_key: instance.offer_key,
    placement: metadata.placement || null, source: metadata.source || null, session_id: metadata.fd_sid || null,
    utm_source: metadata.utm_source || null, utm_medium: metadata.utm_medium || null,
    utm_campaign: metadata.utm_campaign || null, utm_content: metadata.utm_content || null, utm_term: metadata.utm_term || null,
    stripe_checkout_session_id: session.id, stripe_subscription_id: stripeReferenceId(session.subscription),
    stripe_payment_intent_id: stripeReferenceId(session.payment_intent),
  });
  if (error) throw error;
}
async function reconcileCheckout(snapshot: Stripe.Checkout.Session, eventType: string): Promise<void> {
  // Do not fall back to a paid event snapshot when Stripe retrieval is unavailable.
  const session = await stripe.checkout.sessions.retrieve(snapshot.id);
  if (session.id !== snapshot.id) throw new Error('Retrieved checkout identity mismatch');
  assertObjectMode(session);
  const attribution = readFineDietAttribution(session.metadata);
  const originalAttribution = readFineDietAttribution(snapshot.metadata);
  const instance = await findInstance('stripe_checkout_session_id', session.id);
  if (!instance) {
    if (!attribution && !originalAttribution) return; // Another service on the same Stripe account.
    throw new Error('Attributed checkout has no durable purchase instance yet');
  }
  assertAttribution(instance, session.metadata); assertAttribution(instance, snapshot.metadata);
  assertCustomer(instance, session.customer);
  const subscriptionId = stripeReferenceId(session.subscription);
  const paymentIntentId = stripeReferenceId(session.payment_intent);
  if (instance.stripe_subscription_id && instance.stripe_subscription_id !== subscriptionId) {
    throw new Error('Checkout subscription conflicts with the durable purchase');
  }
  if (instance.stripe_payment_intent_id && instance.stripe_payment_intent_id !== paymentIntentId) {
    throw new Error('Checkout payment conflicts with the durable purchase');
  }
  const sourceRef = subscriptionId || paymentIntentId || session.id;
  const identifiers = { stripe_subscription_id: subscriptionId, stripe_payment_intent_id: paymentIntentId };
  if (!checkoutPaymentReady(session)) {
    if (eventType === 'checkout.session.async_payment_failed') {
      await applyPurchaseState(instance, instance.status === 'ended' ? 'ended' : 'canceled', sourceRef, identifiers);
    }
    return; // No access merely because Checkout completed; await actual payment.
  }
  let state: PurchaseAccessState = instance.status === 'ended' ? 'ended' : 'active';
  if (session.mode === 'subscription') {
    if (!subscriptionId) throw new Error('Subscription checkout is missing a subscription');
    const subscription = await retrieveSubscription(subscriptionId, instance);
    state = subscriptionAccessState(subscription, instance.status);
  } else if (session.mode !== 'payment') {
    throw new Error('Unsupported checkout mode for purchased access');
  }
  await applyPurchaseState(instance, state, sourceRef, identifiers);
  if (state !== 'active') return;
  // Existing schedule behavior is preserved, but is not certified for live
  // activation; scheduled offers require a separate replay-safe rollout gate.
  const metadata = session.metadata ?? {};
  if (metadata.billing_model === 'installment' && subscriptionId) await createInstallmentSchedule(instance.offer_key, subscriptionId);
  if (metadata.billing_model === 'intro_then_subscription' && subscriptionId && metadata.price_option_key) {
    await createIntroThenSubscriptionSchedule(metadata.price_option_key, subscriptionId);
  }
  await recordCompletedCheckout(session, instance);
}
async function reconcileSubscription(subscriptionId: string, snapshotMetadata?: Stripe.Metadata | null): Promise<void> {
  // Read authoritative state even for invoice.paid: the event might describe an
  // older invoice, a recovered failure, or a now-canceled subscription.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
  if (subscription.id !== subscriptionId) throw new Error('Retrieved subscription identity mismatch');
  assertObjectMode(subscription);
  const attribution = readFineDietAttribution(subscription.metadata);
  const originalAttribution = readFineDietAttribution(snapshotMetadata);
  const instance = await findInstance('stripe_subscription_id', subscriptionId);
  if (!instance) {
    if (!attribution && !originalAttribution) return;
    // invoice.paid may precede checkout completion/linking. Retry, don't discard.
    throw new Error('Attributed subscription has no linked purchase instance yet');
  }
  assertCustomer(instance, subscription.customer);
  assertAttribution(instance, subscription.metadata); assertAttribution(instance, snapshotMetadata);
  await applyPurchaseState(instance, subscriptionAccessState(subscription, instance.status), subscriptionId);
}
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // Support the pinned SDK shape and historical webhook API versions.
  const legacy = invoice as Stripe.Invoice & { subscription?: unknown };
  return stripeReferenceId(invoice.parent?.subscription_details?.subscription ?? legacy.subscription);
}

/** Preserved legacy schedule behavior: not yet approved for live activation. */
async function createInstallmentSchedule(offerKey: string, subscriptionId: string): Promise<void> {
  try {
    const { data: offer } = await supabaseAdmin.from('offers')
      .select('stripe_phase_price_ids, stripe_phase_iterations').eq('offer_key', offerKey).maybeSingle();
    if (!offer?.stripe_phase_price_ids || !offer?.stripe_phase_iterations || offer.stripe_phase_price_ids.length < 1) {
      console.warn(`[stripe-webhook] No installment config for offer ${offerKey}`); return;
    }
    const priceIds: string[] = offer.stripe_phase_price_ids;
    const iterations: number[] = offer.stripe_phase_iterations;
    const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
    const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = priceIds.map((priceId, i) => ({ items: [{ price: priceId, quantity: 1 }], iterations: iterations[i] }));
    await stripe.subscriptionSchedules.update(schedule.id, { end_behavior: 'cancel', phases });
  } catch (error) {
    console.error(`[stripe-webhook] Failed to create installment schedule for ${subscriptionId}:`, error);
  }
}
async function createIntroThenSubscriptionSchedule(priceOptionKey: string, subscriptionId: string): Promise<void> {
  try {
    const { data: option } = await supabaseAdmin.from('price_options')
      .select('intro_price_id, intro_iterations, renewal_price_id, stripe_price_id').eq('price_option_key', priceOptionKey).maybeSingle();
    const introPriceId: string | null = option?.intro_price_id ?? null;
    const introIterations: number | null = option?.intro_iterations ?? null;
    const renewalPriceId: string | null = option?.renewal_price_id ?? option?.stripe_price_id ?? null;
    if (!introPriceId || !introIterations || !renewalPriceId) {
      console.warn(`[stripe-webhook] Incomplete intro_then_subscription config for ${priceOptionKey}`); return;
    }
    const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
    const introPhase = { items: [{ price: introPriceId, quantity: 1 }], iterations: introIterations };
    const renewalPhase = { items: [{ price: renewalPriceId, quantity: 1 }] };
    const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [introPhase, renewalPhase];
    await stripe.subscriptionSchedules.update(schedule.id, { end_behavior: 'release', phases });
  } catch (error) {
    console.error(`[stripe-webhook] Failed to create intro_then_subscription schedule for ${subscriptionId}:`, error);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST'); return res.status(405).end('Method Not Allowed');
  }
  if (!webhookSecret) return res.status(500).json({ error: 'Webhook secret not configured' });
  let rawBody: Buffer;
  try { rawBody = await buffer(req); } catch { return res.status(400).json({ error: 'Failed to read request body' }); }
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing stripe-signature header' });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret); }
  catch { return res.status(400).json({ error: 'Webhook signature verification failed' }); }
  let context: ReturnType<typeof getStripeAccountContext>;
  try { context = getStripeAccountContext(); }
  catch { return res.status(503).json({ error: 'Stripe deployment context unavailable' }); }
  if (event.livemode !== context.livemode || (event.account && event.account !== context.accountId)) {
    return res.status(400).json({ error: 'Stripe event does not match this deployment' });
  }
  let token: string;
  try {
    const claim = await claimStripeEvent(event);
    if (claim.status === 'processed') return res.status(200).json({ received: true, duplicate: true });
    token = claim.token;
  } catch (error) {
    console.error('[stripe-webhook] Could not claim event:', error);
    return res.status(503).json({ error: 'Stripe event temporarily unavailable' });
  }
  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
        await reconcileCheckout(event.data.object as Stripe.Checkout.Session, event.type); break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        const subscription = event.data.object as Stripe.Subscription;
        await reconcileSubscription(subscription.id, subscription.metadata); break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'invoice.payment_action_required': {
        const subscriptionId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
        if (subscriptionId) await reconcileSubscription(subscriptionId);
        break;
      }
      default: break;
    }
    await completeStripeEvent(event.id, token);
  } catch (error) {
    console.error(`[stripe-webhook] Error processing ${event.type}:`, error);
    try { await releaseStripeEvent(event.id, token); }
    catch (releaseError) { console.error('[stripe-webhook] Event lease release failed:', releaseError); }
    return res.status(500).json({ error: 'Stripe event processing failed' });
  }
  return res.status(200).json({ received: true });
}
