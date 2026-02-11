/**
 * GET  /api/admin/access-links/create?granter_person_id=...&grantee_person_id=...
 *   List access links filtered by granter and/or grantee.
 *
 * POST /api/admin/access-links/create
 *   Create a person-to-person access link (e.g. staff viewing a client's journal).
 *
 * Body (POST): {
 *   granter_person_id: string,   // the client
 *   grantee_person_id: string,   // the staff/coach
 *   scope?: string,              // defaults to 'journal_read'
 *   starts_at?: string,
 *   ends_at?: string,
 *   note?: string
 * }
 *
 * Protected: editor | admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  /* ---- GET: list access links ---- */
  if (req.method === 'GET') {
    const granterId = typeof req.query.granter_person_id === 'string' ? req.query.granter_person_id : '';
    const granteeId = typeof req.query.grantee_person_id === 'string' ? req.query.grantee_person_id : '';

    if (!granterId && !granteeId) {
      return res.status(400).json({ error: 'At least one of granter_person_id or grantee_person_id is required' });
    }

    try {
      let query = supabaseAdmin
        .from('person_access_links')
        .select('*')
        .order('created_at', { ascending: false });

      if (granterId) query = query.eq('granter_person_id', granterId);
      if (granteeId) query = query.eq('grantee_person_id', granteeId);

      const { data, error } = await query;

      if (error) {
        console.error('[access-links/create GET] query error:', error);
        return res.status(500).json({ error: 'Database error' });
      }

      return res.status(200).json({ access_links: data ?? [] });
    } catch (err) {
      console.error('[access-links/create GET] error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  /* ---- POST: create access link ---- */
  const {
    granter_person_id,
    grantee_person_id,
    scope,
    starts_at,
    ends_at,
    note,
  } = req.body ?? {};

  if (!granter_person_id || typeof granter_person_id !== 'string') {
    return res.status(400).json({ error: 'granter_person_id is required' });
  }
  if (!grantee_person_id || typeof grantee_person_id !== 'string') {
    return res.status(400).json({ error: 'grantee_person_id is required' });
  }
  if (granter_person_id === grantee_person_id) {
    return res.status(400).json({ error: 'Granter and grantee cannot be the same person' });
  }

  try {
    const row: Record<string, unknown> = {
      granter_person_id,
      grantee_person_id,
      scope: scope || 'journal_read',
      is_active: true,
      starts_at: starts_at || new Date().toISOString(),
      created_by: user.id,
      updated_by: user.id,
    };

    if (ends_at) row.ends_at = ends_at;
    if (note) row.note = note;

    const { data, error } = await supabaseAdmin
      .from('person_access_links')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('[access-links/create] insert error:', error);
      if (error.code === '23505') {
        return res.status(409).json({ error: 'An active access link with this scope already exists between these people' });
      }
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(201).json({ access_link: data });
  } catch (err) {
    console.error('[access-links/create] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
