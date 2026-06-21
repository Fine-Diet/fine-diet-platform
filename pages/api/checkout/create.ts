/**
 * POST /api/checkout/create
 *
 * Creates a Stripe Checkout Session for the given offer.
 * Supports one_time, subscription, installment, and intro_then_subscription
 * billing models.
 *
 * Body: {
 *   offer_key: string,
 *   price_option_key?: string, // how to pay (resolves billing truth server-side)
 *   placement?: string,      // e.g. 'home', 'journal_waitlist', 'programs', 'email'
 *   source?: string,         // 'button' | 'buy_link'
 *   utm_source?: string,
 *   utm_medium?: string,
 *   utm_campaign?: string,
 *   utm_content?: string,
 *   utm_term?: string,
 * }
 * Returns: { url: string } (the Stripe Checkout URL to redirect to)
 *
 * Auth required: must be a logged-in user with a linked person record.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { stripe, absoluteUrl } from '@/lib/stripe/stripeServer';
import { ensureStripeCustomerForPerson } from '@/lib/stripe/stripeCustomerService';
import { getOrCreateSessionId } from '@/lib/tracking/sessionId';
import { resolveEffectiveOfferEntitlementMappings } from '@/lib/access/offerEntitlementMappings';
import {
  resolvePriceOptionBilling,
  type PriceOptionBilling,
} from '@/lib/access/priceOptionBillingService';

interface OfferRow {
  offer_key: string;
  name: string;
  is_active: boolean;
  billing_model: string;
  stripe_price_id: string | null;
  stripe_phase_price_ids: string[] | null;
  stripe_phase_iterations: number[] | null;
  success_path: string | null;
  cancel_path: string | null;
  trial_period_days: number | null;
}

/** Stripe metadata values max 500 chars each */
function truncMeta(v: string | undefined | null, max = 500): string {
  if (!v) return '';
  return v.slice(0, max);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) Auth + resolve person
  const user = await getCurrentUserWithRoleFromApi(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: personRow } = await supabaseAdmin
    .from('people')
    .select('id, email')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!personRow) {
    return res.status(400).json({ error: 'No person record linked to this account' });
  }

  const personId: string = personRow.id;
  const personEmail: string = personRow.email || user.email || '';

  // 2) Parse body
  const {
    offer_key,
    price_option_key,
    placement,
    source,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
  } = req.body ?? {};

  if (!offer_key || typeof offer_key !== 'string') {
    return res.status(400).json({ error: 'offer_key is required' });
  }

  const priceOptionKey =
    typeof price_option_key === 'string' && price_option_key.trim()
      ? price_option_key.trim()
      : null;

  // Session ID cookie for tracking correlation
  const fdSid = getOrCreateSessionId(req, res);

  // 3) Load & validate offer
  const { data: offer, error: offerErr } = await supabaseAdmin
    .from('offers')
    .select(
      'offer_key, name, is_active, billing_model, stripe_price_id, stripe_phase_price_ids, stripe_phase_iterations, success_path, cancel_path, trial_period_days'
    )
    .eq('offer_key', offer_key)
    .maybeSingle();

  if (offerErr || !offer) {
    return res.status(404).json({ error: 'Offer not found' });
  }

  const o = offer as OfferRow;
  if (!o.is_active) {
    return res.status(400).json({ error: 'This offer is no longer available' });
  }

  // 4) Check if user already entitled for this offer's keys
  const { data: mappings } = await supabaseAdmin
    .from('offer_entitlements')
    .select('entitlement_key, duration_days, is_active')
    .eq('offer_key', offer_key)
    .eq('is_active', true);
  const entitlementMappings = resolveEffectiveOfferEntitlementMappings(
    offer_key,
    mappings,
  );

  if (entitlementMappings.length > 0) {
    const entKeys = entitlementMappings.map((m) => m.entitlement_key);
    const now = new Date().toISOString();
    const { data: existingEnts } = await supabaseAdmin
      .from('person_entitlements')
      .select('entitlement_key')
      .eq('person_id', personId)
      .eq('is_active', true)
      .lte('starts_at', now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .in('entitlement_key', entKeys);

    const coveredKeys = new Set((existingEnts || []).map((e) => e.entitlement_key));
    if (entKeys.every((k) => coveredKeys.has(k))) {
      return res.status(409).json({
        error: 'already_entitled',
        message: 'You already have access to everything in this offer.',
        redirect: '/home?msg=already_entitled',
      });
    }
  }

  // 5) Resolve the BILLING SOURCE (server-side truth).
  // When a price_option_key is supplied, billing comes from the price_options
  // row (validated to belong to this offer + active). Otherwise we fall back to
  // the legacy offer-row billing so existing offer_key-only checkout keeps
  // working unchanged. Either way, no Stripe IDs come from the client.
  let billing: PriceOptionBilling;

  if (priceOptionKey) {
    const resolution = await resolvePriceOptionBilling(offer_key, priceOptionKey);
    if (!resolution.ok) {
      if (resolution.error === 'not_found') {
        return res.status(404).json({ error: 'Price option not found' });
      }
      if (resolution.error === 'offer_mismatch') {
        return res
          .status(400)
          .json({ error: 'price_option_key does not belong to this offer' });
      }
      // inactive
      return res
        .status(400)
        .json({ error: 'This price option is no longer available' });
    }
    billing = resolution.billing;
  } else {
    billing = {
      priceOptionKey: '',
      offerKey: o.offer_key,
      billingModel: (o.billing_model || 'one_time') as PriceOptionBilling['billingModel'],
      stripePriceId: o.stripe_price_id,
      stripePhasePriceIds: o.stripe_phase_price_ids,
      stripePhaseIterations: o.stripe_phase_iterations,
      introPriceId: null,
      introIterations: null,
      renewalPriceId: null,
      trialPeriodDays: o.trial_period_days,
    };
  }

  const billingModel = billing.billingModel;

  // Validate billing config per model.
  if (
    (billingModel === 'one_time' || billingModel === 'subscription') &&
    !billing.stripePriceId
  ) {
    return res
      .status(500)
      .json({ error: 'Offer is missing stripe_price_id configuration' });
  }

  if (billingModel === 'installment') {
    if (
      !billing.stripePhasePriceIds ||
      billing.stripePhasePriceIds.length < 1 ||
      !billing.stripePhaseIterations ||
      billing.stripePhaseIterations.length !== billing.stripePhasePriceIds.length
    ) {
      return res.status(500).json({
        error:
          'Installment offer must have aligned stripe_phase_price_ids and stripe_phase_iterations',
      });
    }
  }

  if (billingModel === 'intro_then_subscription') {
    const renewalPriceId = billing.renewalPriceId || billing.stripePriceId;
    if (
      !billing.introPriceId ||
      !billing.introIterations ||
      billing.introIterations < 1 ||
      !renewalPriceId
    ) {
      return res.status(500).json({
        error:
          'intro_then_subscription requires intro_price_id, intro_iterations, and a renewal price (renewal_price_id or stripe_price_id)',
      });
    }
  }

  try {
    // 6) Ensure Stripe customer
    const stripeCustomerId = await ensureStripeCustomerForPerson(
      personId,
      personEmail
    );

    // App subscription offers return into the onboarding/start surface, never
    // /home or /shop (/shop is reserved for the later physical-commerce track).
    // Entitlements are granted server-side by the Stripe webhook
    // (checkout.session.completed), so the success page needs no session
    // verification and can land directly on onboarding.
    const successUrl = absoluteUrl(o.success_path || '/app/onboarding') + '?checkout=success';
    const cancelUrl = absoluteUrl(o.cancel_path || '/start') + '?checkout=canceled';

    // Offer-level, card-required free trial (Supabase truth). Only applies to
    // subscription offers; NULL/0 = charge immediately. Stripe still collects a
    // payment method up front for trialing subscriptions (card-required trial).
    const trialPeriodDays =
      typeof billing.trialPeriodDays === 'number' && billing.trialPeriodDays > 0
        ? billing.trialPeriodDays
        : null;

    // Build metadata for Stripe (max 50 keys, 500 chars each)
    const sharedMetadata: Record<string, string> = {
      person_id: personId,
      offer_key: o.offer_key,
      price_option_key: truncMeta(priceOptionKey),
      billing_model: billingModel,
      placement: truncMeta(placement),
      source: truncMeta(source),
      fd_sid: truncMeta(fdSid),
      utm_source: truncMeta(utm_source),
      utm_medium: truncMeta(utm_medium),
      utm_campaign: truncMeta(utm_campaign),
      utm_content: truncMeta(utm_content),
      utm_term: truncMeta(utm_term),
    };

    // 7) Log checkout_started event
    await supabaseAdmin.from('checkout_events').insert({
      event_type: 'checkout_started',
      person_id: personId,
      offer_key: o.offer_key,
      placement: placement || null,
      source: source || null,
      session_id: fdSid,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_content: utm_content || null,
      utm_term: utm_term || null,
      referrer: req.headers.referer || null,
      user_agent: req.headers['user-agent'] || null,
    }).then(({ error: evtErr }) => {
      if (evtErr) console.error('[checkout/create] checkout_started insert error:', evtErr);
    });

    let sessionUrl: string | null = null;
    let checkoutSessionId: string | null = null;

    // 8) Create Checkout Session based on billing model
    if (billingModel === 'one_time') {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: stripeCustomerId,
        line_items: [{ price: billing.stripePriceId!, quantity: 1 }],
        metadata: sharedMetadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      sessionUrl = session.url;
      checkoutSessionId = session.id;
    } else if (billingModel === 'subscription') {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [{ price: billing.stripePriceId!, quantity: 1 }],
        subscription_data: {
          metadata: sharedMetadata,
          ...(trialPeriodDays ? { trial_period_days: trialPeriodDays } : {}),
        },
        // Always require a card, including for trialing subscriptions.
        ...(trialPeriodDays
          ? { payment_method_collection: 'always' as const }
          : {}),
        metadata: sharedMetadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      sessionUrl = session.url;
      checkoutSessionId = session.id;
    } else if (billingModel === 'installment') {
      const firstPriceId = billing.stripePhasePriceIds![0];
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [{ price: firstPriceId, quantity: 1 }],
        subscription_data: { metadata: sharedMetadata },
        metadata: sharedMetadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      sessionUrl = session.url;
      checkoutSessionId = session.id;
    } else if (billingModel === 'intro_then_subscription') {
      // Start the subscription on the INTRO price. The webhook converts this
      // into a subscription schedule (intro phase -> renewal phase that runs
      // until canceled). The full schedule build is a follow-up; starting on
      // the intro price keeps the model unblocked and the buyer correctly
      // charged the intro rate first.
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [{ price: billing.introPriceId!, quantity: 1 }],
        subscription_data: {
          metadata: sharedMetadata,
          ...(trialPeriodDays ? { trial_period_days: trialPeriodDays } : {}),
        },
        ...(trialPeriodDays
          ? { payment_method_collection: 'always' as const }
          : {}),
        metadata: sharedMetadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      sessionUrl = session.url;
      checkoutSessionId = session.id;
    }

    // 9) Insert stripe_offer_instances row with status 'pending'
    if (checkoutSessionId) {
      await supabaseAdmin.from('stripe_offer_instances').insert({
        person_id: personId,
        offer_key: o.offer_key,
        price_option_key: priceOptionKey,
        stripe_customer_id: stripeCustomerId,
        stripe_checkout_session_id: checkoutSessionId,
        status: 'pending',
      });
    }

    if (!sessionUrl) {
      return res.status(500).json({ error: 'Failed to create checkout session' });
    }

    return res.status(200).json({ url: sessionUrl });
  } catch (err) {
    console.error('[checkout/create] error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
