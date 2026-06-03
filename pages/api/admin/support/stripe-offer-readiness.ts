/**
 * GET /api/admin/support/stripe-offer-readiness
 *
 * Packet C — admin-only, read-only Stripe live offer readiness report.
 *
 * Surfaces the previously test-only readiness helpers in the app so launch
 * readiness is verifiable without running the SQL audit by hand. This route
 * performs NO mutations: it never rotates keys, switches env vars, or changes
 * offer/Stripe configuration. It only reads `offers` + `offer_entitlements`.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getStripeOfferReadinessReport,
  type StripeOfferReadinessReport,
} from '@/lib/admin/stripeOfferReadinessService';

type ResponseBody = StripeOfferReadinessReport | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const report = await getStripeOfferReadinessReport();
    return res.status(200).json(report);
  } catch (err) {
    console.error('[admin/support/stripe-offer-readiness] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
