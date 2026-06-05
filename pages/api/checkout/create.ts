/**
 * POST /api/checkout/create
 *
 * Creates a Stripe Checkout Session for the given offer.
 * Supports one_time, subscription, and installment billing models.
 *
 * Body: {
 *   offer_key: string,
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

  // 5) Validate billing config
  const billingModel = o.billing_model || 'one_time';

  if (
    (billingModel === 'one_time' || billingModel === 'subscription') &&
    !o.stripe_price_id
  ) {
    return res.status(500).json({ error: 'Offer is missing stripe_price_id configuration' });
  }

  if (billingModel === 'installment') {
    if (
      !o.stripe_phase_price_ids ||
      o.stripe_phase_price_ids.length < 1 ||
      !o.stripe_phase_iterations ||
      o.stripe_phase_iterations.length !== o.stripe_phase_price_ids.length
    ) {
      return res.status(500).json({
        error:
          'Installment offer must have aligned stripe_phase_price_ids and stripe_phase_iterations',
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
      typeof o.trial_period_days === 'number' && o.trial_period_days > 0
        ? o.trial_period_days
        : null;

    // Build metadata for Stripe (max 50 keys, 500 chars each)
    const sharedMetadata: Record<string, string> = {
      person_id: personId,
      offer_key: o.offer_key,
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
        line_items: [{ price: o.stripe_price_id!, quantity: 1 }],
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
        line_items: [{ price: o.stripe_price_id!, quantity: 1 }],
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
      const firstPriceId = o.stripe_phase_price_ids![0];
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
    }

    // 9) Insert stripe_offer_instances row with status 'pending'
    if (checkoutSessionId) {
      await supabaseAdmin.from('stripe_offer_instances').insert({
        person_id: personId,
        offer_key: o.offer_key,
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
