/**
 * POST /api/admin/offers/grant-to-person
 *
 * Grant an offer to a person: resolves the offer's entitlement mappings
 * and creates person_entitlements for each.
 *
 * Body: { person_id: string, offer_key: string }
 *
 * Protected: editor | admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { handleAdminOfferGrant as ensureProgramAssignmentFromAdminOffer } from '@/lib/plans/programAssignmentAutomationServerService';
import { resolveEffectiveOfferEntitlementMappings } from '@/lib/access/offerEntitlementMappings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { person_id, offer_key } = req.body ?? {};

  if (!person_id || typeof person_id !== 'string') {
    return res.status(400).json({ error: 'person_id is required' });
  }
  if (!offer_key || typeof offer_key !== 'string') {
    return res.status(400).json({ error: 'offer_key is required' });
  }

  try {
    // Fetch active entitlement mappings for this offer
    const { data: mappings, error: mapErr } = await supabaseAdmin
      .from('offer_entitlements')
      .select('entitlement_key, duration_days, is_active')
      .eq('offer_key', offer_key)
      .eq('is_active', true);

    if (mapErr) {
      console.error('[offers/grant-to-person] fetch mappings error:', mapErr);
      return res.status(500).json({ error: 'Database error' });
    }

    const entitlementMappings = resolveEffectiveOfferEntitlementMappings(
      offer_key,
      mappings,
    );

    if (entitlementMappings.length === 0) {
      return res.status(400).json({ error: 'No active entitlement mappings found for this offer' });
    }

    const now = new Date();
    const granted: Record<string, unknown>[] = [];

    for (const mapping of entitlementMappings) {
      const row: Record<string, unknown> = {
        person_id,
        entitlement_key: mapping.entitlement_key,
        is_active: true,
        starts_at: now.toISOString(),
        source: 'offer',
        source_ref: offer_key,
        created_by: user.id,
        updated_by: user.id,
      };

      if (mapping.duration_days && mapping.duration_days > 0) {
        const endsAt = new Date(now);
        endsAt.setDate(endsAt.getDate() + mapping.duration_days);
        row.ends_at = endsAt.toISOString();
      }

      const { data, error } = await supabaseAdmin
        .from('person_entitlements')
        .insert(row)
        .select()
        .single();

      if (error) {
        console.error('[offers/grant-to-person] grant error for', mapping.entitlement_key, ':', error);
        // If duplicate, skip but don't fail the whole operation
        if (error.code !== '23505') {
          return res.status(500).json({ error: `Failed to grant ${mapping.entitlement_key}` });
        }
      } else if (data) {
        granted.push(data);
      }
    }

    // Phase 9: auto-create program assignment if offer opts in.
    let assignment_action: string | null = null;
    let assignment_reason: string | null = null;
    try {
      const asn = await ensureProgramAssignmentFromAdminOffer({
        personId: person_id,
        offerKey: offer_key,
        createdByUserId: user.id ?? null,
      });
      assignment_action = asn.action;
      assignment_reason = asn.reason;
    } catch (autoErr) {
      console.error(
        '[offers/grant-to-person] program_assignments automation threw:',
        autoErr,
      );
    }

    return res.status(201).json({
      offer_key,
      person_id,
      granted,
      skipped: entitlementMappings.length - granted.length,
      assignment_action,
      assignment_reason,
    });
  } catch (err) {
    console.error('[offers/grant-to-person] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
