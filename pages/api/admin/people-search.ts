/**
 * GET /api/admin/people-search?q=term&limit=10
 *
 * Lightweight person search for admin UIs (entitlements, access-links, offers).
 * Searches people.email, people.first_name, people.last_name via ilike.
 *
 * Protected: editor | admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface PersonResult {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) {
    return res.status(200).json({ people: [] });
  }

  const limitParam = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 10;
  const limit = Math.min(Math.max(limitParam || 10, 1), 50);

  try {
    const escaped = q.replace(/[%_]/g, '\\$&');
    const pattern = `%${escaped}%`;

    const { data, error } = await supabaseAdmin
      .from('people')
      .select('id, email, first_name, last_name, status')
      .or(`email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`)
      .order('email', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[people-search] query error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({ people: (data ?? []) as PersonResult[] });
  } catch (err) {
    console.error('[people-search] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
