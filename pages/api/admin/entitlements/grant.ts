/**
 * GET  /api/admin/entitlements/grant?person_id=...
 *   List entitlements for a person.
 *
 * POST /api/admin/entitlements/grant
 *   Grant an entitlement to a person.
 *
 * Body (POST): {
 *   person_id: string,
 *   entitlement_key: string,
 *   starts_at?: string (ISO),
 *   ends_at?: string (ISO),
 *   source?: string,
 *   source_ref?: string,
 *   note?: string
 * }
 *
 * Protected: editor | admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { handleAdminEntitlementGrant as ensureProgramAssignmentFromAdminEntitlement } from '@/lib/plans/programAssignmentAutomationServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  /* ---- GET: list entitlements for a person ---- */
  if (req.method === 'GET') {
    const personId = typeof req.query.person_id === 'string' ? req.query.person_id : '';
    if (!personId) {
      return res.status(400).json({ error: 'person_id query param is required' });
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('person_entitlements')
        .select('*')
        .eq('person_id', personId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[entitlements/grant GET] query error:', error);
        return res.status(500).json({ error: 'Database error' });
      }

      return res.status(200).json({ entitlements: data ?? [] });
    } catch (err) {
      console.error('[entitlements/grant GET] error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  /* ---- POST: grant entitlement ---- */

  const {
    person_id,
    entitlement_key,
    starts_at,
    ends_at,
    source,
    source_ref,
    note,
  } = req.body ?? {};

  if (!person_id || typeof person_id !== 'string') {
    return res.status(400).json({ error: 'person_id is required' });
  }
  if (!entitlement_key || typeof entitlement_key !== 'string') {
    return res.status(400).json({ error: 'entitlement_key is required' });
  }

  try {
    const row: Record<string, unknown> = {
      person_id,
      entitlement_key: entitlement_key.trim().toLowerCase(),
      is_active: true,
      starts_at: starts_at || new Date().toISOString(),
      source: source || 'admin_grant',
      created_by: user.id,
      updated_by: user.id,
    };

    if (ends_at) row.ends_at = ends_at;
    if (source_ref) row.source_ref = source_ref;
    if (note) row.note = note;

    const { data, error } = await supabaseAdmin
      .from('person_entitlements')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('[entitlements/grant] insert error:', error);
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(409).json({ error: 'An active entitlement with this key already exists for this person' });
      }
      return res.status(500).json({ error: 'Database error' });
    }

    // Phase 9: auto-create program assignment when the entitlement
    // follows the 'program:<slug>' convention.
    let assignment_action: string | null = null;
    let assignment_reason: string | null = null;
    try {
      const asn = await ensureProgramAssignmentFromAdminEntitlement({
        personId: person_id,
        entitlementKey: (entitlement_key as string).trim().toLowerCase(),
        sourceRef: (source_ref as string | null) ?? null,
        source: (source as string | null) ?? 'admin_grant',
        createdByUserId: user.id ?? null,
      });
      assignment_action = asn.action;
      assignment_reason = asn.reason;
    } catch (autoErr) {
      console.error(
        '[entitlements/grant] program_assignments automation threw:',
        autoErr,
      );
    }

    return res.status(201).json({
      entitlement: data,
      assignment_action,
      assignment_reason,
    });
  } catch (err) {
    console.error('[entitlements/grant] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
