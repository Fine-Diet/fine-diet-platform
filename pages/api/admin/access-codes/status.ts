/**
 * POST /api/admin/access-codes/status
 *
 * Change an access code's status: activate / pause / expire / archive (or move
 * back to draft). This is the single endpoint for the admin manager's status
 * actions.
 *
 * Body: { id: string, status: 'draft' | 'active' | 'paused' | 'expired' | 'archived' }
 *
 * The digest is never returned.
 *
 * Protected: admin | editor
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

const STATUS_VALUES = ['draft', 'active', 'paused', 'expired', 'archived'] as const;

const statusSchema = z.object({
  id: z.string().uuid('id is required'),
  status: z.enum(STATUS_VALUES),
});

const RETURN_SELECT =
  'id, code_key, label, status, scope, start_page_slug, program_slug, product_slug, offer_key, max_redemptions, redemption_count, valid_from, expires_at, metadata, created_at, updated_at';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
  }
  const { id, status } = parsed.data;

  try {
    const { data: updated, error } = await supabaseAdmin
      .from('access_codes')
      .update({ status })
      .eq('id', id)
      .select(RETURN_SELECT)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Access code not found' });
      }
      console.error('[access-codes/status] error:', error);
      return res.status(500).json({ error: 'Failed to update status' });
    }

    return res.status(200).json({ code: updated });
  } catch (err) {
    console.error('[access-codes/status] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
