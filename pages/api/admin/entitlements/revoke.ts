/**
 * POST /api/admin/entitlements/revoke
 *
 * Revoke an entitlement.
 *   - If ends_at is null (perpetual): set is_active = false
 *   - If ends_at is set (time-limited): set ends_at = now()
 *
 * Body: { entitlement_id: string }
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

  const { entitlement_id } = req.body ?? {};
  if (!entitlement_id || typeof entitlement_id !== 'string') {
    return res.status(400).json({ error: 'entitlement_id is required' });
  }

  try {
    // Fetch the current row
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('person_entitlements')
      .select('id, ends_at, is_active')
      .eq('id', entitlement_id)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Entitlement not found' });
    }

    if (!existing.is_active) {
      return res.status(400).json({ error: 'Entitlement is already revoked' });
    }

    // Determine update strategy
    const update: Record<string, unknown> = { updated_by: user.id };
    if (existing.ends_at === null) {
      // Perpetual → deactivate
      update.is_active = false;
    } else {
      // Time-limited → expire now
      update.ends_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('person_entitlements')
      .update(update)
      .eq('id', entitlement_id)
      .select()
      .single();

    if (error) {
      console.error('[entitlements/revoke] update error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({ entitlement: data });
  } catch (err) {
    console.error('[entitlements/revoke] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
