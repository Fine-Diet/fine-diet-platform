/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook endpoint. Verifies signature using the raw request body,
 * processes events idempotently, and grants/revokes entitlements accordingly.
 *
 * Handled events:
 *   - checkout.session.completed  -> grant entitlements, activate instance
 *   - customer.subscription.deleted -> revoke entitlements, end instance
 *   - invoice.payment_failed       -> revoke entitlements (auto-revoke v1)
 *
 * Body parsing is DISABLED (raw body required for Stripe signature verification).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { buffer } from 'micro';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/stripeServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { handleStripeCheckoutCompleted as ensureProgramAssignmentFromStripe } from '@/lib/plans/programAssignmentAutomationServerService';
import { resolveEffectiveOfferEntitlementMappings } from '@/lib/access/offerEntitlementMappings';

// Disable Next.js body parser so we get the raw buffer for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Record event for idempotency. Returns true if this is a NEW event
 * that should be processed. Returns false if already processed (duplicate).
 */
async function recordEventIdempotent(event: Stripe.Event): Promise<boolean> {
  const { error } = await supabaseAdmin.from('stripe_events').insert({
    stripe_event_id: event.id,
    type: event.type,
    created_at: new Date(event.created * 1000).toISOString(),
    processed_at: new Date().toISOString(),
  });

  if (error) {
    // 23505 = unique_violation -> already processed
    if (error.code === '23505') {
      console.log(`[stripe-webhook] Duplicate event ${event.id}, skipping`);
      return false;
    }
    console.error('[stripe-webhook] Error recording event:', error);
    // Still process even if logging fails (better to double-grant than miss)
  }

  return true;
}

/**
 * Grant entitlements for an offer to a person.
 * Follows the same pattern as admin/offers/grant-to-person but with
 * source='stripe' and source_ref = subscription/payment ID.
 */
async function grantEntitlementsForOffer(
  personId: string,
  offerKey: string,
  sourceRef: string
): Promise<void> {
  const { data: mappings } = await supabaseAdmin
    .from('offer_entitlements')
    .select('entitlement_key, duration_days, is_active')
    .eq('offer_key', offerKey)
    .eq('is_active', true);
  const entitlementMappings = resolveEffectiveOfferEntitlementMappings(
    offerKey,
    mappings,
  );

  if (entitlementMappings.length === 0) {
    console.warn(`[stripe-webhook] No active entitlement mappings for offer ${offerKey}`);
    return;
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

    // Idempotent: check if an active entitlement with this source_ref already exists
    const { data: existingEnt } = await supabaseAdmin
      .from('person_entitlements')
      .select('id')
      .eq('person_id', personId)
      .eq('entitlement_key', mapping.entitlement_key)
      .eq('source', 'stripe')
      .eq('source_ref', sourceRef)
      .eq('is_active', true)
      .maybeSingle();

    if (existingEnt) {
      console.log(
        `[stripe-webhook] Entitlement ${mapping.entitlement_key} already active for person ${personId}, skipping`
      );
      continue;
    }

    const { error } = await supabaseAdmin
      .from('person_entitlements')
      .insert(row);

    if (error && error.code !== '23505') {
      console.error(
        `[stripe-webhook] Failed to grant ${mapping.entitlement_key}:`,
        error
      );
    }
  }
}

/**
 * Revoke entitlements tied to a specific Stripe source_ref (subscription ID).
 */
async function revokeEntitlementsBySourceRef(
  personId: string,
  sourceRef: string
): Promise<void> {
  const { data: activeEnts } = await supabaseAdmin
    .from('person_entitlements')
    .select('id, ends_at')
    .eq('person_id', personId)
    .eq('source', 'stripe')
    .eq('source_ref', sourceRef)
    .eq('is_active', true);

  if (!activeEnts || activeEnts.length === 0) return;

  const now = new Date().toISOString();

  for (const ent of activeEnts) {
    if (!ent.ends_at) {
      // Perpetual entitlement: deactivate immediately
      await supabaseAdmin
        .from('person_entitlements')
        .update({ is_active: false, updated_at: now })
        .eq('id', ent.id);
    } else {
      // Time-limited: expire now
      await supabaseAdmin
        .from('person_entitlements')
        .update({ ends_at: now, updated_at: now })
        .eq('id', ent.id);
    }
  }

  console.log(
    `[stripe-webhook] Revoked ${activeEnts.length} entitlement(s) for person ${personId}, source_ref ${sourceRef}`
  );
}

/* ------------------------------------------------------------------ */
/*  Event handlers                                                     */
/* ------------------------------------------------------------------ */

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const metadata = session.metadata ?? {};
  const personId = metadata.person_id;
  const offerKey = metadata.offer_key;
  const priceOptionKey = metadata.price_option_key || null;
  const billingModel = metadata.billing_model || 'one_time';

  if (!personId || !offerKey) {
    console.warn('[stripe-webhook] checkout.session.completed missing metadata', {
      personId,
      offerKey,
    });
    return;
  }

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null;

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // The source_ref for entitlements: subscription ID if recurring, else payment intent
  const sourceRef = subscriptionId || paymentIntentId || session.id;

  // Upsert stripe_offer_instances -> active. Backfill price_option_key
  // defensively in case the row predates the column or the create path.
  await supabaseAdmin
    .from('stripe_offer_instances')
    .update({
      status: 'active',
      stripe_subscription_id: subscriptionId,
      stripe_payment_intent_id: paymentIntentId,
      ...(priceOptionKey ? { price_option_key: priceOptionKey } : {}),
    })
    .eq('stripe_checkout_session_id', session.id);

  // Grant entitlements
  await grantEntitlementsForOffer(personId, offerKey, sourceRef);

  // Phase 9: auto-create program assignment if the offer opts in via
  // offers.assigns_program_slug. Non-fatal on failure or on missing mapping.
  try {
    const asn = await ensureProgramAssignmentFromStripe({
      personId,
      offerKey,
      sourceRef,
    });
    if (asn.action !== 'skipped_unmapped' && asn.action !== 'unchanged') {
      console.log(
        `[stripe-webhook] program_assignments ${asn.action} for ${offerKey} → ${personId}`,
      );
    }
    if (asn.action === 'skipped_error') {
      console.error(
        `[stripe-webhook] program_assignments automation error: ${asn.reason}`,
      );
    }
  } catch (autoErr) {
    console.error(
      '[stripe-webhook] program_assignments automation threw:',
      autoErr,
    );
  }

  // For installment billing: create a subscription schedule with phases
  if (billingModel === 'installment' && subscriptionId) {
    await createInstallmentSchedule(offerKey, subscriptionId);
  }

  // For intro_then_subscription: convert into a schedule with an intro phase
  // (fixed iterations) followed by a renewal phase that runs until canceled.
  if (
    billingModel === 'intro_then_subscription' &&
    subscriptionId &&
    priceOptionKey
  ) {
    await createIntroThenSubscriptionSchedule(priceOptionKey, subscriptionId);
  }

  // Log checkout_completed event (idempotent: skip if already logged for this session)
  const { data: existingEvt } = await supabaseAdmin
    .from('checkout_events')
    .select('id')
    .eq('event_type', 'checkout_completed')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle();

  if (!existingEvt) {
    await supabaseAdmin.from('checkout_events').insert({
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
      stripe_subscription_id: subscriptionId || null,
      stripe_payment_intent_id: paymentIntentId || null,
    }).then(({ error: evtErr }) => {
      if (evtErr) console.error('[stripe-webhook] checkout_completed insert error:', evtErr);
    });
  }

  console.log(
    `[stripe-webhook] checkout.session.completed: granted entitlements for ${offerKey} to ${personId}`
  );
}

/**
 * For installment offers, convert the subscription into a schedule with phases.
 * Each phase uses a different price for a set number of iterations.
 */
async function createInstallmentSchedule(
  offerKey: string,
  subscriptionId: string
): Promise<void> {
  try {
    const { data: offer } = await supabaseAdmin
      .from('offers')
      .select('stripe_phase_price_ids, stripe_phase_iterations')
      .eq('offer_key', offerKey)
      .maybeSingle();

    if (
      !offer?.stripe_phase_price_ids ||
      !offer?.stripe_phase_iterations ||
      offer.stripe_phase_price_ids.length < 1
    ) {
      console.warn(`[stripe-webhook] No installment config for offer ${offerKey}`);
      return;
    }

    const priceIds: string[] = offer.stripe_phase_price_ids;
    const iterations: number[] = offer.stripe_phase_iterations;

    // Create a subscription schedule from the existing subscription.
    // The first phase is already in progress via checkout.
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });

    // Build phases: the first phase is already running (from checkout),
    // so we rebuild all phases with the correct prices and iterations.
    const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = priceIds.map(
      (priceId, i) => ({
        items: [{ price: priceId, quantity: 1 }],
        iterations: iterations[i],
      })
    );

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'cancel',
      phases,
    });

    console.log(
      `[stripe-webhook] Created installment schedule ${schedule.id} for subscription ${subscriptionId}`
    );
  } catch (err) {
    // Log but don't fail the webhook -- entitlements are already granted
    console.error(
      `[stripe-webhook] Failed to create installment schedule for ${subscriptionId}:`,
      err
    );
  }
}

/**
 * For intro_then_subscription price options, convert the subscription into a
 * schedule: an intro phase that runs for `intro_iterations` cycles on the intro
 * price, then a renewal phase on the normal recurring price that continues until
 * the customer cancels (`end_behavior: 'release'`).
 *
 * Billing truth is read server-side from `price_options`. This is the durable
 * spine for the model; the checkout already started the subscription on the
 * intro price, so this rebuilds the schedule around it.
 */
async function createIntroThenSubscriptionSchedule(
  priceOptionKey: string,
  subscriptionId: string
): Promise<void> {
  try {
    const { data: option } = await supabaseAdmin
      .from('price_options')
      .select('intro_price_id, intro_iterations, renewal_price_id, stripe_price_id')
      .eq('price_option_key', priceOptionKey)
      .maybeSingle();

    const introPriceId: string | null = option?.intro_price_id ?? null;
    const introIterations: number | null = option?.intro_iterations ?? null;
    const renewalPriceId: string | null =
      option?.renewal_price_id ?? option?.stripe_price_id ?? null;

    if (!introPriceId || !introIterations || !renewalPriceId) {
      console.warn(
        `[stripe-webhook] Incomplete intro_then_subscription config for ${priceOptionKey}`
      );
      return;
    }

    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });

    // Built as separate phase objects (intro -> renewal). Passing via a
    // variable keeps the runtime-valid `iterations` field without tripping the
    // object-literal excess-property check, matching createInstallmentSchedule.
    const introPhase = {
      items: [{ price: introPriceId, quantity: 1 }],
      iterations: introIterations,
    };
    const renewalPhase = {
      items: [{ price: renewalPriceId, quantity: 1 }],
      // No iterations -> renewal phase continues until canceled.
    };
    const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [
      introPhase,
      renewalPhase,
    ];

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      phases,
    });

    console.log(
      `[stripe-webhook] Created intro_then_subscription schedule ${schedule.id} for subscription ${subscriptionId}`
    );
  } catch (err) {
    // Non-fatal: entitlements are already granted; schedule can be repaired.
    console.error(
      `[stripe-webhook] Failed to create intro_then_subscription schedule for ${subscriptionId}:`,
      err
    );
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const subscriptionId = subscription.id;

  // Find the stripe_offer_instance
  const { data: instance } = await supabaseAdmin
    .from('stripe_offer_instances')
    .select('person_id, offer_key')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!instance) {
    console.warn(
      `[stripe-webhook] No stripe_offer_instance for subscription ${subscriptionId}`
    );
    return;
  }

  // Update instance status
  await supabaseAdmin
    .from('stripe_offer_instances')
    .update({ status: 'ended' })
    .eq('stripe_subscription_id', subscriptionId);

  // Revoke entitlements tied to this subscription
  await revokeEntitlementsBySourceRef(instance.person_id, subscriptionId);

  console.log(
    `[stripe-webhook] subscription.deleted: revoked entitlements for subscription ${subscriptionId}`
  );
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  // In Stripe SDK v20, subscription is nested under parent.subscription_details
  const subRef = invoice.parent?.subscription_details?.subscription ?? null;
  const subscriptionId =
    typeof subRef === 'string'
      ? subRef
      : subRef?.id ?? null;

  if (!subscriptionId) {
    console.log('[stripe-webhook] invoice.payment_failed without subscription, ignoring');
    return;
  }

  // Find the stripe_offer_instance
  const { data: instance } = await supabaseAdmin
    .from('stripe_offer_instances')
    .select('person_id, offer_key')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!instance) {
    console.warn(
      `[stripe-webhook] No stripe_offer_instance for subscription ${subscriptionId}`
    );
    return;
  }

  // v1 policy: revoke immediately on payment failure
  await supabaseAdmin
    .from('stripe_offer_instances')
    .update({ status: 'canceled' })
    .eq('stripe_subscription_id', subscriptionId);

  await revokeEntitlementsBySourceRef(instance.person_id, subscriptionId);

  console.log(
    `[stripe-webhook] invoice.payment_failed: revoked entitlements for subscription ${subscriptionId}`
  );
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Read raw body for signature verification
  let rawBody: Buffer;
  try {
    rawBody = await buffer(req);
  } catch (err) {
    console.error('[stripe-webhook] Failed to read raw body:', err);
    return res.status(400).json({ error: 'Failed to read request body' });
  }

  // Verify signature
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Idempotency check
  const isNew = await recordEventIdempotent(event);
  if (!isNew) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  // Route event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice
        );
        break;

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error processing ${event.type}:`, err);
    // Return 200 anyway to prevent Stripe from retrying indefinitely.
    // The event is already recorded for idempotency; we can reprocess manually.
  }

  return res.status(200).json({ received: true });
}
