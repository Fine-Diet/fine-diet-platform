/**
 * GET /api/admin/access-codes/list
 *
 * List access codes for the admin Access Codes Manager. Returns admin-safe
 * metadata ONLY — never `code_hash`, never the raw code (which is never
 * stored). Admin/editor may see internal `id` (needed to act on a row), status,
 * scope, scoped slugs, offer attachment, limits, dates, and counts.
 *
 * Query params (all optional):
 *   status  — filter by status (draft | active | paused | expired | archived)
 *   scope   — filter by scope
 *   q       — case-insensitive substring on label / code_key / offer_key
 *
 * Protected: editor | admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

/**
 * Columns returned to the admin UI. `code_hash` is deliberately excluded —
 * the digest is server-only and must never reach any client, admin included.
 */
const ADMIN_SELECT =
  'id, code_key, label, status, scope, start_page_slug, program_slug, product_slug, offer_key, max_redemptions, redemption_count, valid_from, expires_at, metadata, created_at, updated_at';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { status, scope, q } = req.query;

  try {
    let query = supabaseAdmin
      .from('access_codes')
      .select(ADMIN_SELECT)
      .order('created_at', { ascending: false });

    if (typeof status === 'string' && status.trim()) {
      query = query.eq('status', status.trim());
    }
    if (typeof scope === 'string' && scope.trim()) {
      query = query.eq('scope', scope.trim());
    }

    const { data, error } = await query;

    if (error) {
      console.error('[access-codes/list] error:', error);
      return res.status(500).json({ error: 'Failed to load access codes' });
    }

    let rows = data ?? [];

    // Substring filter across label / code_key / offer_key (client-safe fields).
    if (typeof q === 'string' && q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((row) => {
        const haystack = [row.label, row.code_key, row.offer_key]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      });
    }

    return res.status(200).json({ codes: rows });
  } catch (err) {
    console.error('[access-codes/list] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
