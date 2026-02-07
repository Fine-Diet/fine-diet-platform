/**
 * Admin API: Bulk Import Dry Run
 * 
 * POST /api/admin/foods/import/dry-run
 * 
 * Validates import data and returns preview of what would be created/updated.
 * Does not modify the database.
 * 
 * Body: { rows: BulkImportRow[] }
 * 
 * Protected: requires admin or editor role
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import type {
  BulkImportRow,
  BulkImportValidationResult,
  BulkImportDryRunResponse,
} from '@/lib/admin/foodTypes';
import {
  generateFineDietSourceId,
  normalizeUpc,
  validateFoodImportRow,
  generateFoodImportWarnings,
} from '@/lib/admin/foodUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BulkImportDryRunResponse | { error: string }>
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

    // Process each row
    const results: BulkImportValidationResult[] = [];
    const allErrors: Array<{ row_index: number; errors: string[] }> = [];
    const allWarnings: Array<{ row_index: number; warnings: string[] }> = [];

    // Collect all source_ids to check for existing foods
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

    // Validate each row
    let newCount = 0;
    let updateCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const sourceId = rowSourceIdMap.get(i) || '';
      
      // Validate
      const errors = validateFoodImportRow(row as Record<string, unknown>, i);
      const warnings = generateFoodImportWarnings(row as Record<string, unknown>, i);

      if (errors.length > 0) {
        allErrors.push({ row_index: i, errors });
      }
      if (warnings.length > 0) {
        allWarnings.push({ row_index: i, warnings });
      }

      // Determine action
      const existingId = existingMap.get(sourceId);
      let action: 'create' | 'update' | 'skip';

      if (errors.length > 0) {
        action = 'skip';
        skipCount++;
        errorCount++;
      } else if (existingId) {
        action = 'update';
        updateCount++;
      } else {
        action = 'create';
        newCount++;
      }

      results.push({
        row_index: i,
        valid: errors.length === 0,
        errors,
        warnings,
        action,
        existing_id: existingId,
        source_id: sourceId,
        data: row,
      });
    }

    return res.status(200).json({
      total_rows: rows.length,
      new_count: newCount,
      update_count: updateCount,
      skip_count: skipCount,
      error_count: errorCount,
      errors: allErrors,
      warnings: allWarnings,
      preview: results.slice(0, 100), // Limit preview to first 100 rows
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
