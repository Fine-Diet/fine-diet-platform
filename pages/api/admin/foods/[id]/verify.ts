/**
 * Admin API: Verify/Unverify Food
 * 
 * POST /api/admin/foods/[id]/verify   - Mark food as verified
 * POST /api/admin/foods/[id]/unverify - (use same endpoint with body { unverify: true })
 * 
 * Protected: requires admin or editor role
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import type { AdminFoodObject, AdminFoodVerifyInput } from '@/lib/admin/foodTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminFoodObject | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin or editor role
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid food ID' });
  }

  try {
    const body = req.body as AdminFoodVerifyInput & { unverify?: boolean };
    const isUnverify = body.unverify === true;

    // Build update
    // Note: verified_by references people.id, but user.id is auth.users.id
    // For now, we don't set verified_by. Future improvement: look up people.id from auth_user_id
    const updateData: Record<string, unknown> = {
      is_verified: !isUnverify,
      verified_at: isUnverify ? null : new Date().toISOString(),
      // verified_by: null - don't overwrite existing value on verify, clear on unverify
    };

    if (isUnverify) {
      updateData.verified_by = null;
    }

    if (body.verification_notes !== undefined) {
      updateData.verification_notes = body.verification_notes || null;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('food_objects')
      .update(updateData)
      .eq('id', id)
      .eq('is_deleted', false)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Food not found or is deleted' });
      }
      console.error('Error verifying food:', error);
      return res.status(500).json({ error: `Database error: ${error.message}` });
    }

    return res.status(200).json(updated as AdminFoodObject);
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
