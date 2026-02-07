/**
 * Admin API: Bulk Import Apply
 * 
 * POST /api/admin/foods/import/apply
 * 
 * Applies the import, creating or updating foods.
 * 
 * Body: { rows: BulkImportRow[] }
 * 
 * Protected: requires admin or editor role
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import type { BulkImportRow, BulkImportApplyResponse, FoodSourceProvider } from '@/lib/admin/foodTypes';
import {
  generateFineDietSourceId,
  normalizeUpc,
  validateFoodImportRow,
  importRowToFoodData,
} from '@/lib/admin/foodUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BulkImportApplyResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin or editor role
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  try {
    const { rows } = req.body as { rows: BulkImportRow[] };

    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Request body must contain a rows array' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Rows array is empty' });
    }

    if (rows.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 rows per import' });
    }

    // Collect source_ids and build lookup
    const sourceIds: string[] = [];
    const rowSourceIdMap: Map<number, string> = new Map();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const upc = normalizeUpc(row.upc as string);
      const sourceId = generateFineDietSourceId(
        row.canonical_name || '',
        row.brand_name,
        upc
      );
      sourceIds.push(sourceId);
      rowSourceIdMap.set(i, sourceId);
    }

    // Query existing foods by source_id
    const { data: existingFoods, error: lookupError } = await supabaseAdmin
      .from('food_objects')
      .select('id, source_id')
      .eq('source_provider', 'fine_diet')
      .eq('is_deleted', false)
      .in('source_id', sourceIds);

    if (lookupError) {
      console.error('Error looking up existing foods:', lookupError);
      return res.status(500).json({ error: `Database error: ${lookupError.message}` });
    }

    const existingMap = new Map<string, string>();
    for (const food of existingFoods || []) {
      existingMap.set(food.source_id, food.id);
    }

    // Process rows
    const insertedIds: string[] = [];
    const updatedIds: string[] = [];
    const errors: Array<{ row_index: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const sourceId = rowSourceIdMap.get(i) || '';
      
      // Validate
      const validationErrors = validateFoodImportRow(row as unknown as Record<string, unknown>, i);
      if (validationErrors.length > 0) {
        errors.push({ row_index: i, error: validationErrors.join('; ') });
        continue;
      }

      // Build food object using the centralized conversion function
      const convertedData = importRowToFoodData(row);
      
      // Note: verified_by references people.id, but user.id is auth.users.id
      // We don't set verified_by to avoid FK violation
      const foodData = {
        ...convertedData,
        source_type: 'common' as const,
        source_provider: 'fine_diet' as FoodSourceProvider,
        source_id: sourceId,
        source_dataset: null,
        nutrient_provenance: 'internal' as const,
        nutrient_confidence: 'medium' as const,
        verified_at: convertedData.is_verified ? new Date().toISOString() : null,
        verified_by: null, // TODO: look up people.id from auth_user_id if needed
        is_deleted: false,
      };

      const existingId = existingMap.get(sourceId);

      try {
        if (existingId) {
          // Update existing
          const { error: updateError } = await supabaseAdmin
            .from('food_objects')
            .update(foodData)
            .eq('id', existingId);

          if (updateError) {
            errors.push({ row_index: i, error: updateError.message });
          } else {
            updatedIds.push(existingId);
          }
        } else {
          // Insert new
          const { data: inserted, error: insertError } = await supabaseAdmin
            .from('food_objects')
            .insert(foodData)
            .select('id')
            .single();

          if (insertError) {
            errors.push({ row_index: i, error: insertError.message });
          } else if (inserted) {
            insertedIds.push(inserted.id);
            // Update map in case there are duplicates in the same import
            existingMap.set(sourceId, inserted.id);
          }
        }
      } catch (err) {
        errors.push({
          row_index: i,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return res.status(200).json({
      total_rows: rows.length,
      inserted_count: insertedIds.length,
      updated_count: updatedIds.length,
      error_count: errors.length,
      inserted_ids: insertedIds,
      updated_ids: updatedIds,
      errors,
    });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
