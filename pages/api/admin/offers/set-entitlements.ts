/**
 * POST /api/admin/offers/set-entitlements
 *
 * Set the entitlement mappings for an offer.
 *
 * Body: {
 *   offer_key: string,
 *   entitlements: Array<{
 *     entitlement_key: string,
 *     duration_days?: number | null,
 *     is_active?: boolean
 *   }>
 * }
 *
 * Each entitlement is upserted on the (offer_key, entitlement_key) pair.
 *
 * Protected: editor | admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface EntitlementMapping {
  entitlement_key: string;
  duration_days?: number | null;
  is_active?: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { offer_key, entitlements } = req.body ?? {};

  if (!offer_key || typeof offer_key !== 'string') {
    return res.status(400).json({ error: 'offer_key is required' });
  }
  if (!Array.isArray(entitlements) || entitlements.length === 0) {
    return res.status(400).json({ error: 'entitlements array is required and must be non-empty' });
  }

  try {
    // Verify the offer exists
    const { data: offer, error: offerErr } = await supabaseAdmin
      .from('offers')
      .select('offer_key')
      .eq('offer_key', offer_key)
      .maybeSingle();

    if (offerErr || !offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const results: Record<string, unknown>[] = [];

    for (const mapping of entitlements as EntitlementMapping[]) {
      if (!mapping.entitlement_key || typeof mapping.entitlement_key !== 'string') {
        continue; // skip invalid entries
      }

      // Check if this mapping already exists
      const { data: existing } = await supabaseAdmin
        .from('offer_entitlements')
        .select('id')
        .eq('offer_key', offer_key)
        .eq('entitlement_key', mapping.entitlement_key.trim().toLowerCase())
        .maybeSingle();

      const row: Record<string, unknown> = {
        offer_key,
        entitlement_key: mapping.entitlement_key.trim().toLowerCase(),
      };
      if (mapping.duration_days !== undefined) row.duration_days = mapping.duration_days;
      if (mapping.is_active !== undefined) row.is_active = mapping.is_active;

      let data;
      let error;

      if (existing) {
        const result = await supabaseAdmin
          .from('offer_entitlements')
          .update(row)
          .eq('id', existing.id)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        const result = await supabaseAdmin
          .from('offer_entitlements')
          .insert(row)
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('[offers/set-entitlements] upsert error for', mapping.entitlement_key, ':', error);
      } else if (data) {
        results.push(data);
      }
    }

    // Return the current full list of mappings for this offer
    const { data: allMappings, error: listErr } = await supabaseAdmin
      .from('offer_entitlements')
      .select('*')
      .eq('offer_key', offer_key)
      .order('entitlement_key', { ascending: true });

    if (listErr) {
      console.error('[offers/set-entitlements] list error:', listErr);
    }

    return res.status(200).json({ entitlements: allMappings ?? results });
  } catch (err) {
    console.error('[offers/set-entitlements] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
