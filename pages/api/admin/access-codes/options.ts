/**
 * GET /api/admin/access-codes/options
 *
 * Frontend-safe slim list used to populate the Access Code Gate module
 * builder's access-code selector. Returns ONLY non-secret, editor-facing
 * fields: `code_key`, `label`, `status`, `offer_key`. No internal IDs, no
 * hashes, no redemption counts, no scoped slugs.
 *
 * Only `active` and `draft` codes are offered (paused / expired / archived are
 * intentionally hidden from the selector so editors cannot wire a gate to a
 * code that will not verify).
 *
 * Protected: editor | admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

export interface AccessCodeOption {
  code_key: string | null;
  label: string | null;
  status: string;
  offer_key: string | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  try {
    const { data, error } = await supabaseAdmin
      .from('access_codes')
      .select('code_key, label, status, offer_key')
      .in('status', ['active', 'draft'])
      .order('label', { ascending: true, nullsFirst: false })
      .order('code_key', { ascending: true });

    if (error) {
      console.error('[access-codes/options] error:', error);
      return res.status(500).json({ error: 'Failed to load access code options' });
    }

    // Drop any rows without a code_key — a gate cannot select a code with no
    // stable selector key. Keep the rest in admin-authored order.
    const options: AccessCodeOption[] = (data ?? [])
      .filter((row) => row && row.code_key)
      .map((row) => ({
        code_key: row.code_key,
        label: row.label,
        status: row.status,
        offer_key: row.offer_key ?? null,
      }));

    return res.status(200).json({ options });
  } catch (err) {
    console.error('[access-codes/options] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
