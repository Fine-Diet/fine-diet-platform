/**
 * POST /api/checkout/create
 *
 * Creates a Stripe Checkout Session for the given offer.
 * Supports one_time, subscription, and installment billing models.
 *
 * Body: { offer_key: string }
 * Returns: { url: string } (the Stripe Checkout URL to redirect to)
 *
 * Auth required: must be a logged-in user with a linked person record.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { stripe, absoluteUrl } from '@/lib/stripe/stripeServer';
import { ensureStripeCustomerForPerson } from '@/lib/stripe/stripeCustomerService';

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

  // 2) Validate offer_key
  const { offer_key } = req.body ?? {};
  if (!offer_key || typeof offer_key !== 'string') {
    return res.status(400).json({ error: 'offer_key is required' });
  }

  const { data: offer, error: offerErr } = await supabaseAdmin
    .from('offers')
    .select(
      'offer_key, name, is_active, billing_model, stripe_price_id, stripe_phase_price_ids, stripe_phase_iterations, success_path, cancel_path'
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

  // 3) Validate billing config
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
    // 4) Ensure Stripe customer
    const stripeCustomerId = await ensureStripeCustomerForPerson(
      personId,
      personEmail
    );

    const successUrl = absoluteUrl(o.success_path || '/home') + '?checkout=success';
    const cancelUrl = absoluteUrl(o.cancel_path || '/shop') + '?checkout=canceled';

    const sharedMetadata = {
      person_id: personId,
      offer_key: o.offer_key,
      billing_model: billingModel,
    };

    let sessionUrl: string | null = null;
    let checkoutSessionId: string | null = null;
    let subscriptionId: string | undefined;

    // 5) Create Checkout Session based on billing model
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
        subscription_data: { metadata: sharedMetadata },
        metadata: sharedMetadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      sessionUrl = session.url;
      checkoutSessionId = session.id;
    } else if (billingModel === 'installment') {
      // Use subscription checkout with the first phase price.
      // The webhook will convert this subscription into a schedule with phases.
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

    // 6) Insert stripe_offer_instances row with status 'pending'
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
