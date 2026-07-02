/**
 * GET /api/admin/access-codes/redemptions
 *
 * List redemptions for a single access code, for admin reporting.
 *
 * Query params:
 *   id        — access_codes.id (preferred)
 *   code_key  — alternative selector if id is not known
 *   limit     — optional cap (default 100, max 500)
 *
 * Returns redemption rows plus a lightweight `people` map (id -> email/name)
 * for the person_ids referenced in the redemptions. People rows are never
 * created by access-code verification; person_id is linked only when the
 * submitted email already matched a person.
 *
 * Protected: admin | editor
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface RedemptionRow {
  id: string;
  access_code_id: string;
  person_id: string | null;
  email: string | null;
  source: string | null;
  context: Record<string, unknown> | null;
  redeemed_at: string;
}

interface PersonRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id, code_key, limit } = req.query;

  let accessCodeId: string | undefined = typeof id === 'string' ? id : undefined;

  if (!accessCodeId) {
    if (typeof code_key !== 'string' || !code_key.trim()) {
      return res.status(400).json({ error: 'id or code_key query param is required' });
    }
    const { data: codeRow, error: codeErr } = await supabaseAdmin
      .from('access_codes')
      .select('id')
      .eq('code_key', code_key.trim())
      .maybeSingle();
    if (codeErr) {
      console.error('[access-codes/redemptions] code lookup error:', codeErr);
      return res.status(500).json({ error: 'Failed to resolve code' });
    }
    if (!codeRow) {
      return res.status(404).json({ error: 'Access code not found' });
    }
    accessCodeId = codeRow.id;
  }

  const cap = Math.min(Math.max(parseInt(typeof limit === 'string' ? limit : '100', 10) || 100, 1), 500);

  try {
    const { data: redemptions, error } = await supabaseAdmin
      .from('access_code_redemptions')
      .select('id, access_code_id, person_id, email, source, context, redeemed_at')
      .eq('access_code_id', accessCodeId)
      .order('redeemed_at', { ascending: false })
      .limit(cap);

    if (error) {
      console.error('[access-codes/redemptions] error:', error);
      return res.status(500).json({ error: 'Failed to load redemptions' });
    }

    const rows = (redemptions ?? []) as RedemptionRow[];
    const personIds = Array.from(
      new Set(rows.map((r) => r.person_id).filter((p): p is string => Boolean(p))),
    );

    let people: PersonRow[] = [];
    if (personIds.length > 0) {
      const { data: peopleRows, error: peopleErr } = await supabaseAdmin
        .from('people')
        .select('id, email, first_name, last_name')
        .in('id', personIds);
      if (peopleErr) {
        console.error('[access-codes/redemptions] people lookup error:', peopleErr);
      }
      people = (peopleRows ?? []) as PersonRow[];
    }

    return res.status(200).json({ redemptions: rows, people });
  } catch (err) {
    console.error('[access-codes/redemptions] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
