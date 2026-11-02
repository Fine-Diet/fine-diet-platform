/**
 * POST /api/webhooks/stripe
 *
 * Verifies the raw-body signature and environment, claims a recoverable receipt,
 * and grants/revokes entitlements. Required database failures must reach the
 * retryable response; a completed receipt is not just an attempt log.
 *
 * Handled events:
 *   - checkout.session.completed
 *   - customer.subscription.deleted
 *   - invoice.payment_failed (existing immediate-revoke policy)
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

export const config = { api: { bodyParser: false } };
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/** Grant each mapped entitlement, preserving an already-applied same-source grant on retry. */
async function grantEntitlementsForOffer(
  personId: string,
  offerKey: string,
  sourceRef: string
): Promise<void> {
  const { data: mappings, error: mappingError } = await supabaseAdmin
    .from('offer_entitlements')
    .select('entitlement_key, duration_days, is_active')
    .eq('offer_key', offerKey)
    .eq('is_active', true);
  if (mappingError) throw mappingError;
  const entitlementMappings = resolveEffectiveOfferEntitlementMappings(offerKey, mappings);
  if (entitlementMappings.length === 0) {
    throw new Error(`No active entitlement mappings for purchased offer ${offerKey}`);
  }

  const now = new Date();
  for (const mapping of entitlementMappings) {
    const row: Record<string, unknown> = {
      person_id: personId,
      entitlement_key: mapping.entitlement_key,
      is_active: true,
      starts_at: now.toISOString(),
      source: 'stripe',
      source_ref: sourceRef,
      note: `Granted via Stripe checkout for offer: ${offerKey}`,
    };
    if (mapping.duration_days && mapping.duration_days > 0) {
      const endsAt = new Date(now);
      endsAt.setDate(endsAt.getDate() + mapping.duration_days);
      row.ends_at = endsAt.toISOString();
    }

    const { data: existingEnt, error: existingError } = await supabaseAdmin
      .from('person_entitlements')
      .select('id')
      .eq('person_id', personId)
      .eq('entitlement_key', mapping.entitlement_key)
      .eq('source', 'stripe')
      .eq('source_ref', sourceRef)
      .eq('is_active', true)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingEnt) continue;

    const { error } = await supabaseAdmin.from('person_entitlements').insert(row);
    // A uniqueness conflict with a DIFFERENT purchase is not a successful grant.
    if (error) throw error;
  }
}

/** Revoke only the Stripe grants belonging to this purchase. */
async function revokeEntitlementsBySourceRef(personId: string, sourceRef: string): Promise<void> {
  const { data: activeEnts, error: activeEntsError } = await supabaseAdmin
    .from('person_entitlements')
    .select('id, ends_at')
    .eq('person_id', personId)
    .eq('source', 'stripe')
    .eq('source_ref', sourceRef)
    .eq('is_active', true);
  if (activeEntsError) throw activeEntsError;
  if (!activeEnts || activeEnts.length === 0) return;

  const now = new Date().toISOString();
  for (const ent of activeEnts) {
    const { data: updated, error } = await supabaseAdmin
      .from('person_entitlements')
      .update({ is_active: false, ...(ent.ends_at ? { ends_at: now } : {}), updated_at: now })
      .eq('id', ent.id)
      .select('id');
    if (error) throw error;
    if (!updated || updated.length !== 1) {
      throw new Error('Entitlement revocation did not update the expected row');
    }
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const metadata = session.metadata ?? {};
  const personId = metadata.person_id;
  const offerKey = metadata.offer_key;
  const priceOptionKey = metadata.price_option_key || null;
  const billingModel = metadata.billing_model || 'one_time';
  if (!personId || !offerKey) {
    throw new Error('Checkout session is missing required attribution metadata');
  }

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription : session.subscription?.id ?? null;
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent : session.payment_intent?.id ?? null;
  const sourceRef = subscriptionId || paymentIntentId || session.id;

  // Require a durable purchase row, not merely a syntactically valid update.
  // Attribution must match the server-created instance before any access grant.
  const { data: updatedInstances, error: instanceError } = await supabaseAdmin
    .from('stripe_offer_instances')
    .update({
      status: 'active',
      stripe_subscription_id: subscriptionId,
      stripe_payment_intent_id: paymentIntentId,
      ...(priceOptionKey ? { price_option_key: priceOptionKey } : {}),
    })
    .eq('stripe_checkout_session_id', session.id)
    .eq('person_id', personId)
    .eq('offer_key', offerKey)
    .select('id');
  if (instanceError) throw instanceError;
  if (!updatedInstances || updatedInstances.length !== 1) {
    throw new Error('Checkout instance is missing or does not match attribution');
  }

  await grantEntitlementsForOffer(personId, offerKey, sourceRef);

  // Unmapped offers intentionally do nothing. A mapped assignment error is
  // required work that must be retried, not logged as checkout success.
  const assignment = await ensureProgramAssignmentFromStripe({ personId, offerKey, sourceRef });
  if (assignment.action === 'skipped_error') {
    throw new Error(`Program assignment failed: ${assignment.reason}`);
  }

  // Schedule helpers remain a separate pre-live review gate: their Stripe
  // side effects require replay-safe idempotency and failure propagation.
  if (billingModel === 'installment' && subscriptionId) {
    await createInstallmentSchedule(offerKey, subscriptionId);
  }
  if (billingModel === 'intro_then_subscription' && subscriptionId && priceOptionKey) {
    await createIntroThenSubscriptionSchedule(priceOptionKey, subscriptionId);
  }

  const { data: existingEvent, error: eventReadError } = await supabaseAdmin
    .from('checkout_events')
    .select('id')
    .eq('event_type', 'checkout_completed')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle();
  if (eventReadError) throw eventReadError;
  if (!existingEvent) {
    const { error: eventInsertError } = await supabaseAdmin.from('checkout_events').insert({
      event_type: 'checkout_completed',
      person_id: personId,
      offer_key: offerKey,
      placement: metadata.placement || null,
      source: metadata.source || null,
      session_id: metadata.fd_sid || null,
      utm_source: metadata.utm_source || null,
      utm_medium: metadata.utm_medium || null,
      utm_campaign: metadata.utm_campaign || null,
      utm_content: metadata.utm_content || null,
      utm_term: metadata.utm_term || null,
      stripe_checkout_session_id: session.id,
      stripe_subscription_id: subscriptionId,
      stripe_payment_intent_id: paymentIntentId,
    });
    if (eventInsertError) throw eventInsertError;
  }
}

/** Existing installment behavior; replay-safe schedule handling is not certified by this PR yet. */
async function createInstallmentSchedule(offerKey: string, subscriptionId: string): Promise<void> {
  try {
    const { data: offer } = await supabaseAdmin
      .from('offers')
      .select('stripe_phase_price_ids, stripe_phase_iterations')
      .eq('offer_key', offerKey)
      .maybeSingle();
    if (!offer?.stripe_phase_price_ids || !offer?.stripe_phase_iterations || offer.stripe_phase_price_ids.length < 1) {
      console.warn(`[stripe-webhook] No installment config for offer ${offerKey}`);
      return;
    }
    const priceIds: string[] = offer.stripe_phase_price_ids;
    const iterations: number[] = offer.stripe_phase_iterations;
    const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
    const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = priceIds.map((priceId, i) => ({
      items: [{ price: priceId, quantity: 1 }],
      iterations: iterations[i],
    }));
    await stripe.subscriptionSchedules.update(schedule.id, { end_behavior: 'cancel', phases });
    console.log(`[stripe-webhook] Created installment schedule ${schedule.id} for subscription ${subscriptionId}`);
  } catch (err) {
    console.error(`[stripe-webhook] Failed to create installment schedule for ${subscriptionId}:`, err);
  }
}

/** Existing introductory-price behavior; not yet approved for live rollout. */
async function createIntroThenSubscriptionSchedule(priceOptionKey: string, subscriptionId: string): Promise<void> {
  try {
    const { data: option } = await supabaseAdmin
      .from('price_options')
      .select('intro_price_id, intro_iterations, renewal_price_id, stripe_price_id')
      .eq('price_option_key', priceOptionKey)
      .maybeSingle();
    const introPriceId: string | null = option?.intro_price_id ?? null;
    const introIterations: number | null = option?.intro_iterations ?? null;
    const renewalPriceId: string | null = option?.renewal_price_id ?? option?.stripe_price_id ?? null;
    if (!introPriceId || !introIterations || !renewalPriceId) {
      console.warn(`[stripe-webhook] Incomplete intro_then_subscription config for ${priceOptionKey}`);
      return;
    }
    const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId });
    const introPhase = { items: [{ price: introPriceId, quantity: 1 }], iterations: introIterations };
    const renewalPhase = { items: [{ price: renewalPriceId, quantity: 1 }] };
    const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [introPhase, renewalPhase];
    await stripe.subscriptionSchedules.update(schedule.id, { end_behavior: 'release', phases });
    console.log(`[stripe-webhook] Created intro_then_subscription schedule ${schedule.id} for subscription ${subscriptionId}`);
  } catch (err) {
    console.error(`[stripe-webhook] Failed to create intro_then_subscription schedule for ${subscriptionId}:`, err);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const subscriptionId = subscription.id;
  const { data: instance, error: instanceReadError } = await supabaseAdmin
    .from('stripe_offer_instances')
    .select('person_id, offer_key')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();
  if (instanceReadError) throw instanceReadError;
  if (!instance) {
    console.warn(`[stripe-webhook] No stripe_offer_instance for subscription ${subscriptionId}`);
    return;
  }
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('stripe_offer_instances')
    .update({ status: 'ended' })
    .eq('stripe_subscription_id', subscriptionId)
    .select('id');
  if (updateError) throw updateError;
  if (!updated || updated.length !== 1) throw new Error('Subscription termination did not update the expected instance');
  await revokeEntitlementsBySourceRef(instance.person_id, subscriptionId);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  // Stripe SDK v20 nests the subscription under parent.subscription_details.
  const subRef = invoice.parent?.subscription_details?.subscription ?? null;
  const subscriptionId = typeof subRef === 'string' ? subRef : subRef?.id ?? null;
  if (!subscriptionId) return;

  const { data: instance, error: instanceReadError } = await supabaseAdmin
    .from('stripe_offer_instances')
    .select('person_id, offer_key')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();
  if (instanceReadError) throw instanceReadError;
  if (!instance) {
    console.warn(`[stripe-webhook] No stripe_offer_instance for subscription ${subscriptionId}`);
    return;
  }
  // Preserve the existing immediate-revoke policy; payment recovery is a
  // separate lifecycle requirement and is not implied by this error fix.
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('stripe_offer_instances')
    .update({ status: 'canceled' })
    .eq('stripe_subscription_id', subscriptionId)
    .select('id');
  if (updateError) throw updateError;
  if (!updated || updated.length !== 1) throw new Error('Payment failure did not update the expected instance');
  await revokeEntitlementsBySourceRef(instance.person_id, subscriptionId);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }
  if (!webhookSecret) return res.status(500).json({ error: 'Webhook secret not configured' });

  let rawBody: Buffer;
  try {
    rawBody = await buffer(req);
  } catch {
    return res.status(400).json({ error: 'Failed to read request body' });
  }
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch {
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // A valid signature is necessary but must not allow test events into a live
  // deployment. Direct-account events may omit account; signing-secret/account
  // provenance must also be verified operationally before production cutover.
  let context: ReturnType<typeof getStripeAccountContext>;
  try {
    context = getStripeAccountContext();
  } catch {
    return res.status(503).json({ error: 'Stripe deployment context unavailable' });
  }
  if (event.livemode !== context.livemode || (event.account && event.account !== context.accountId)) {
    return res.status(400).json({ error: 'Stripe event does not match this deployment' });
  }

  let token: string;
  try {
    const claim = await claimStripeEvent(event);
    if (claim.status === 'processed') return res.status(200).json({ received: true, duplicate: true });
    token = claim.token;
  } catch (err) {
    console.error('[stripe-webhook] Could not claim event:', err);
    return res.status(503).json({ error: 'Stripe event temporarily unavailable' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
    await completeStripeEvent(event.id, token);
  } catch (err) {
    console.error(`[stripe-webhook] Error processing ${event.type}:`, err);
    try {
      await releaseStripeEvent(event.id, token);
    } catch (releaseError) {
      console.error('[stripe-webhook] Event lease release failed:', releaseError);
    }
    return res.status(500).json({ error: 'Stripe event processing failed' });
  }
  return res.status(200).json({ received: true });
}
