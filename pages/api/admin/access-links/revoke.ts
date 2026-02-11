/**
 * POST /api/admin/access-links/revoke
 *
 * Revoke an access link by setting is_active = false.
 *
 * Body: { access_link_id: string }
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

  const { access_link_id } = req.body ?? {};
  if (!access_link_id || typeof access_link_id !== 'string') {
    return res.status(400).json({ error: 'access_link_id is required' });
  }

  try {
    // Verify it exists and is active
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('person_access_links')
      .select('id, is_active')
      .eq('id', access_link_id)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Access link not found' });
    }

    if (!existing.is_active) {
      return res.status(400).json({ error: 'Access link is already revoked' });
    }

    const { data, error } = await supabaseAdmin
      .from('person_access_links')
      .update({ is_active: false, updated_by: user.id })
      .eq('id', access_link_id)
      .select()
      .single();

    if (error) {
      console.error('[access-links/revoke] update error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({ access_link: data });
  } catch (err) {
    console.error('[access-links/revoke] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
