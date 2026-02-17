/**
 * POST /api/admin/offers/upsert
 *
 * Create or update an offer.
 *
 * Body: {
 *   offer_key: string,
 *   name: string,
 *   description?: string,
 *   is_active?: boolean,
 *   purchase_provider?: string,
 *   provider_product_id?: string
 * }
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

  const {
    offer_key, name, description, is_active, purchase_provider, provider_product_id,
    billing_model, stripe_price_id, stripe_phase_price_ids, stripe_phase_iterations,
    success_path, cancel_path,
  } = req.body ?? {};

  if (!offer_key || typeof offer_key !== 'string') {
    return res.status(400).json({ error: 'offer_key is required' });
  }
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const row: Record<string, unknown> = {
      offer_key: offer_key.trim().toLowerCase(),
      name: name.trim(),
      updated_by: user.id,
    };

    if (description !== undefined) row.description = description;
    if (is_active !== undefined) row.is_active = is_active;
    if (purchase_provider !== undefined) row.purchase_provider = purchase_provider;
    if (provider_product_id !== undefined) row.provider_product_id = provider_product_id;
    if (billing_model !== undefined) row.billing_model = billing_model;
    if (stripe_price_id !== undefined) row.stripe_price_id = stripe_price_id || null;
    if (stripe_phase_price_ids !== undefined) row.stripe_phase_price_ids = stripe_phase_price_ids || null;
    if (stripe_phase_iterations !== undefined) row.stripe_phase_iterations = stripe_phase_iterations || null;
    if (success_path !== undefined) row.success_path = success_path || null;
    if (cancel_path !== undefined) row.cancel_path = cancel_path || null;

    // Check if exists
    const { data: existing } = await supabaseAdmin
      .from('offers')
      .select('offer_key')
      .eq('offer_key', row.offer_key as string)
      .maybeSingle();

    let data;
    let error;

    if (existing) {
      // Update
      const result = await supabaseAdmin
        .from('offers')
        .update(row)
        .eq('offer_key', row.offer_key as string)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Insert
      row.created_by = user.id;
      const result = await supabaseAdmin
        .from('offers')
        .insert(row)
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('[offers/upsert] error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(existing ? 200 : 201).json({ offer: data });
  } catch (err) {
    console.error('[offers/upsert] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
