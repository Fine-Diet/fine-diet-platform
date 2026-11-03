/**
 * POST /api/checkout/create
 * Authenticated, server-catalog checkout. Initial pre-live scope is one_time or
 * ordinary monthly/annual subscription only; schedules are blocked pre-charge.
 * Final commercial prices and public distribution remain separate approvals.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { stripe, absoluteUrl } from '@/lib/stripe/stripeServer';
import { ensureStripeCustomerForPerson } from '@/lib/stripe/stripeCustomerService';
import { assertCheckoutSafety, CheckoutSafetyError } from '@/lib/stripe/stripeCheckoutSafety';
import { getOrCreateSessionId } from '@/lib/tracking/sessionId';
import { resolveEffectiveOfferEntitlementMappings } from '@/lib/access/offerEntitlementMappings';
import { personHasEffectiveEntitlementKeys } from '@/lib/access/effectiveAccess';
import { getSafeRedirectTarget, isSafeRedirectTarget } from '@/lib/redirectHelpers';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { resolvePriceOptionBilling, type PriceOptionBilling } from '@/lib/access/priceOptionBillingService';

interface OfferRow {
  offer_key: string; name: string; is_active: boolean; billing_model: string;
  stripe_price_id: string | null; stripe_phase_price_ids: string[] | null;
  stripe_phase_iterations: number[] | null; success_path: string | null;
  cancel_path: string | null; trial_period_days: number | null;
}
function truncMeta(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let unpersistedSessionId: string | null = null;
  try {
    const user = await getCurrentUserWithRoleFromApi(req, res);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { data: personRow, error: personError } = await supabaseAdmin.from('people')
      .select('id, email').eq('auth_user_id', user.id).maybeSingle();
    if (personError) throw personError;
    if (!personRow) return res.status(400).json({ error: 'No person record linked to this account' });
    const personId: string = personRow.id, personEmail: string = personRow.email || user.email || '';
    const { offer_key, price_option_key, placement, source, utm_source, utm_medium,
      utm_campaign, utm_content, utm_term } = req.body ?? {};
    if (!offer_key || typeof offer_key !== 'string') return res.status(400).json({ error: 'offer_key is required' });
    const priceOptionKey = typeof price_option_key === 'string' && price_option_key.trim() ? price_option_key.trim() : null;
    const fdSid = getOrCreateSessionId(req, res);
    const { data: offer, error: offerError } = await supabaseAdmin.from('offers')
      .select('offer_key, name, is_active, billing_model, stripe_price_id, stripe_phase_price_ids, stripe_phase_iterations, success_path, cancel_path, trial_period_days')
      .eq('offer_key', offer_key).maybeSingle();
    if (offerError) throw offerError;
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    const o = offer as OfferRow;
    if (!o.is_active) return res.status(400).json({ error: 'This offer is no longer available' });

    const { data: mappings, error: mappingError } = await supabaseAdmin.from('offer_entitlements')
      .select('entitlement_key, duration_days, is_active').eq('offer_key', offer_key).eq('is_active', true);
    if (mappingError) throw mappingError;
    const entitlementMappings = resolveEffectiveOfferEntitlementMappings(offer_key, mappings);
    if (!entitlementMappings.length) throw new CheckoutSafetyError('checkout_access_not_configured');
    const coverage = await personHasEffectiveEntitlementKeys(personId, entitlementMappings.map(mapping => mapping.entitlement_key));
    if (coverage.covered) return res.status(409).json({ error: 'already_entitled',
      message: 'You already have access to everything in this offer.', grantSource: coverage.grantSource,
      redirect: `${APP_ROUTES.home}?msg=already_entitled` });

    // A selected option, not the parent offer or client metadata, is billing truth.
    let billing: PriceOptionBilling;
    if (priceOptionKey) {
      const resolution = await resolvePriceOptionBilling(offer_key, priceOptionKey);
      if (!resolution.ok) {
        if (resolution.error === 'not_found') return res.status(404).json({ error: 'Price option not found' });
        if (resolution.error === 'offer_mismatch') return res.status(400).json({ error: 'price_option_key does not belong to this offer' });
        return res.status(400).json({ error: 'This price option is no longer available' });
      }
      billing = resolution.billing;
    } else {
      billing = { priceOptionKey: '', offerKey: o.offer_key,
        billingModel: o.billing_model as PriceOptionBilling['billingModel'], stripePriceId: o.stripe_price_id,
        stripePhasePriceIds: o.stripe_phase_price_ids, stripePhaseIterations: o.stripe_phase_iterations,
        introPriceId: null, introIterations: null, renewalPriceId: null, trialPeriodDays: o.trial_period_days };
    }
    await assertCheckoutSafety(billing);
    // No customer/session creation or checkout-start business write precedes this boundary.
    const stripeCustomerId = await ensureStripeCustomerForPerson(personId, personEmail);
    const successPath = o.success_path && isSafeRedirectTarget(o.success_path)
      ? getSafeRedirectTarget(o.success_path, APP_ROUTES.onboarding) : APP_ROUTES.onboarding;
    const successUrlObj = new URL(absoluteUrl('/checkout/success'));
    successUrlObj.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
    successUrlObj.searchParams.set('returnTo', successPath);
    const successUrl = successUrlObj.toString().replace(encodeURIComponent('{CHECKOUT_SESSION_ID}'), '{CHECKOUT_SESSION_ID}');
    const cancelPath = o.cancel_path && isSafeRedirectTarget(o.cancel_path)
      ? getSafeRedirectTarget(o.cancel_path, '/start') : '/start';
    const cancelUrlObj = new URL(absoluteUrl(cancelPath));
    cancelUrlObj.searchParams.set('checkout', 'canceled');
    const metadata: Record<string, string> = {
      person_id: personId, offer_key: o.offer_key, price_option_key: truncMeta(priceOptionKey),
      billing_model: billing.billingModel, placement: truncMeta(placement), source: truncMeta(source),
      fd_sid: truncMeta(fdSid), utm_source: truncMeta(utm_source), utm_medium: truncMeta(utm_medium),
      utm_campaign: truncMeta(utm_campaign), utm_content: truncMeta(utm_content), utm_term: truncMeta(utm_term),
    };
    const { error: eventError } = await supabaseAdmin.from('checkout_events').insert({
      event_type: 'checkout_started', person_id: personId, offer_key: o.offer_key,
      placement: metadata.placement || null, source: metadata.source || null, session_id: fdSid,
      utm_source: metadata.utm_source || null, utm_medium: metadata.utm_medium || null,
      utm_campaign: metadata.utm_campaign || null, utm_content: metadata.utm_content || null,
      utm_term: metadata.utm_term || null, referrer: truncMeta(req.headers.referer) || null,
      user_agent: truncMeta(req.headers['user-agent']) || null,
    });
    if (eventError) throw eventError;
    const common = { customer: stripeCustomerId, line_items: [{ price: billing.stripePriceId!, quantity: 1 }],
      metadata, success_url: successUrl, cancel_url: cancelUrlObj.toString() };
    const trialDays = billing.trialPeriodDays && billing.trialPeriodDays > 0 ? billing.trialPeriodDays : null;
    const session = billing.billingModel === 'subscription'
      ? await stripe.checkout.sessions.create({ ...common, mode: 'subscription',
          subscription_data: { metadata, ...(trialDays ? { trial_period_days: trialDays } : {}) },
          ...(trialDays ? { payment_method_collection: 'always' as const } : {}) })
      : await stripe.checkout.sessions.create({ ...common, mode: 'payment' });
    unpersistedSessionId = session.id;
    if (!session.id || !session.url) throw new Error('Checkout session missing identity or URL');
    const { data: instance, error: instanceError } = await supabaseAdmin.from('stripe_offer_instances').insert({
      person_id: personId, offer_key: o.offer_key, price_option_key: priceOptionKey,
      stripe_customer_id: stripeCustomerId, stripe_checkout_session_id: session.id, status: 'pending',
    }).select('id').single();
    if (instanceError) throw instanceError;
    if (!instance?.id) throw new Error('Pending purchase was not confirmed');
    // A URL is returned only after the durable attribution row exists.
    unpersistedSessionId = null;
    return res.status(200).json({ url: session.url });
  } catch (error) {
    if (unpersistedSessionId) {
      try { await stripe.checkout.sessions.expire(unpersistedSessionId); }
      catch { console.error('[checkout/create] Unpersisted session expiry needs reconciliation'); }
    }
    if (error instanceof CheckoutSafetyError) return res.status(error.status).json({ error: error.code });
    // Do not expose provider errors, customer data, keys, or session URLs.
    console.error('[checkout/create] Checkout creation failed; no URL returned');
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
