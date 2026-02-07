/**
 * Admin API: Individual Food Operations
 * 
 * GET    /api/admin/foods/[id] - Get food by ID
 * PATCH  /api/admin/foods/[id] - Update food
 * DELETE /api/admin/foods/[id] - Soft-delete food
 * 
 * Protected: requires admin or editor role
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import type { AdminFoodObject, AdminFoodUpdateInput } from '@/lib/admin/foodTypes';
import { normalizeUpc } from '@/lib/admin/foodUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminFoodObject | { error: string } | { success: boolean }>
) {
  // Require admin or editor role
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid food ID' });
  }

  // GET: Fetch food by ID
  if (req.method === 'GET') {
    try {
      const { data: food, error } = await supabaseAdmin
        .from('food_objects')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Food not found' });
        }
        console.error('Error fetching food:', error);
        return res.status(500).json({ error: `Database error: ${error.message}` });
      }

      return res.status(200).json(food as AdminFoodObject);
    } catch (error) {
      console.error('API error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // PATCH: Update food
  if (req.method === 'PATCH') {
    try {
      const input = req.body as AdminFoodUpdateInput;

      // Build update object (only include provided fields)
      const updateData: Record<string, unknown> = {};

      if (input.canonical_name !== undefined) {
        if (!input.canonical_name || !input.canonical_name.trim()) {
          return res.status(400).json({ error: 'canonical_name cannot be empty' });
        }
        updateData.canonical_name = input.canonical_name.trim();
      }

      if (input.brand_name !== undefined) {
        updateData.brand_name = input.brand_name?.trim() || null;
      }

      if (input.aliases !== undefined) {
        updateData.aliases = input.aliases || [];
      }

      if (input.upc !== undefined) {
        updateData.upc = input.upc ? normalizeUpc(input.upc) : null;
      }

      if (input.serving_size_g !== undefined) {
        updateData.serving_size_g = input.serving_size_g ?? 100;
      }

      if (input.serving_unit !== undefined) {
        updateData.serving_unit = input.serving_unit || 'g';
      }

      if (input.serving_description !== undefined) {
        updateData.serving_description = input.serving_description || null;
      }

      if (input.household_serving_text !== undefined) {
        updateData.household_serving_text = input.household_serving_text || null;
      }

      // Nutrients (including new NDS fields)
      const nutrientFields = [
        // Core macros
        'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg',
        // Minerals for Nutrition Density Score
        'potassium_mg', 'magnesium_mg', 'iron_mg', 'calcium_mg', 'zinc_mg',
        // Vitamins for Nutrition Density Score
        'folate_ug', 'vitamin_a_ug_rae', 'vitamin_c_mg', 'vitamin_d_ug', 'vitamin_b12_ug',
      ];
      for (const field of nutrientFields) {
        if ((input as Record<string, unknown>)[field] !== undefined) {
          updateData[field] = (input as Record<string, unknown>)[field] ?? null;
        }
      }

      if (input.nutrients_extended !== undefined) {
        updateData.nutrients_extended = input.nutrients_extended || null;
      }

      if (input.nutrient_confidence !== undefined) {
        updateData.nutrient_confidence = input.nutrient_confidence || 'medium';
      }

      if (input.image_url !== undefined) {
        updateData.image_url = input.image_url || null;
      }

      if (input.category !== undefined) {
        updateData.category = input.category || null;
      }

      if (input.tags !== undefined) {
        updateData.tags = input.tags || [];
      }

      // Verification fields
      // Note: verified_by references people.id, but user.id is auth.users.id
      // We don't update verified_by here - use the dedicated /verify endpoint
      if (input.is_verified !== undefined) {
        updateData.is_verified = input.is_verified;
        if (input.is_verified) {
          updateData.verified_at = new Date().toISOString();
          // Don't set verified_by - it would violate FK constraint
        }
      }

      if (input.verification_notes !== undefined) {
        updateData.verification_notes = input.verification_notes || null;
      }

      // Check we have something to update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const { data: updated, error } = await supabaseAdmin
        .from('food_objects')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Food not found' });
        }
        console.error('Error updating food:', error);
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

  // DELETE: Soft-delete food
  if (req.method === 'DELETE') {
    try {
      const { data: deleted, error } = await supabaseAdmin
        .from('food_objects')
        .update({ is_deleted: true })
        .eq('id', id)
        .select('id')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Food not found' });
        }
        console.error('Error deleting food:', error);
        return res.status(500).json({ error: `Database error: ${error.message}` });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('API error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
