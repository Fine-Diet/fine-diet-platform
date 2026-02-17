/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Billing Portal session for the authenticated user.
 * Returns { url } to redirect the user to Stripe's hosted portal
 * where they can manage subscriptions, payment methods, and invoices.
 *
 * Auth required: must be a logged-in user with a stripe_customers record.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { stripe, absoluteUrl } from '@/lib/stripe/stripeServer';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getCurrentUserWithRoleFromApi(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Resolve person
  const { data: personRow } = await supabaseAdmin
    .from('people')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!personRow) {
    return res.status(400).json({ error: 'No person record linked to this account' });
  }

  // Look up Stripe customer
  const { data: customerRow } = await supabaseAdmin
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('person_id', personRow.id)
    .maybeSingle();

  if (!customerRow?.stripe_customer_id) {
    return res.status(400).json({ error: 'No billing account found. Make a purchase first.' });
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerRow.stripe_customer_id,
      return_url: absoluteUrl('/account'),
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('[billing/portal] error:', err);
    return res.status(500).json({ error: 'Failed to create billing portal session' });
  }
}
