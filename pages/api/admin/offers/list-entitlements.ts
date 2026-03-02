/**
 * GET /api/admin/offers/list-entitlements?offer_key=xxx
 *
 * Read-only: returns all offer_entitlements rows for a given offer_key
 * (active + inactive, no side effects).
 *
 * Protected: editor | admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const offerKey = req.query.offer_key;
  if (!offerKey || typeof offerKey !== 'string') {
    return res.status(400).json({ error: 'offer_key query param is required' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('offer_entitlements')
      .select('*')
      .eq('offer_key', offerKey)
      .order('entitlement_key', { ascending: true });

    if (error) {
      console.error('[offers/list-entitlements] error:', error);
      return res.status(500).json({ error: 'Failed to load entitlements' });
    }

    return res.status(200).json({ entitlements: data ?? [] });
  } catch (err) {
    console.error('[offers/list-entitlements] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
