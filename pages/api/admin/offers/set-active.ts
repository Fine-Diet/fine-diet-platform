/**
 * POST /api/admin/offers/set-active
 *
 * Toggle offer active status.
 *
 * Body: { offer_key: string, is_active: boolean }
 *
 * Protected: editor | admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { offer_key, is_active } = req.body ?? {};

  if (!offer_key || typeof offer_key !== 'string') {
    return res.status(400).json({ error: 'offer_key is required' });
  }
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active (boolean) is required' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('offers')
      .update({ is_active, updated_by: user.id })
      .eq('offer_key', offer_key)
      .select()
      .single();

    if (error) {
      console.error('[offers/set-active] error:', error);
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Offer not found' });
      }
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({ offer: data });
  } catch (err) {
    console.error('[offers/set-active] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
