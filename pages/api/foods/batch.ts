/**
 * POST /api/foods/batch — Batch fetch food objects by IDs
 * 
 * Returns minimal nutrient data needed for flag computation.
 * Used by Journal Day View to efficiently fetch micronutrients for all entries.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface FoodNutrientData {
  id: string;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  nutrientConfidence: 'high' | 'medium' | 'low';
  nutrientProvenance: 'internal' | 'usda' | 'label' | 'estimated' | 'user';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Allow both GET (with ids query param) and POST (with ids in body)
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse IDs from query string (GET) or body (POST)
    let ids: string[] = [];
    
    if (req.method === 'GET') {
      const idsParam = req.query.ids;
      if (typeof idsParam === 'string') {
        ids = idsParam.split(',').filter(Boolean);
      } else if (Array.isArray(idsParam)) {
        ids = idsParam.filter(Boolean);
      }
    } else {
      // POST
      ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    }

    // Validate IDs
    if (ids.length === 0) {
      return res.status(200).json({ foods: [] });
    }

    // Limit batch size to prevent abuse
    if (ids.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 IDs per request' });
    }

    // Fetch minimal food data
    const { data, error } = await supabaseAdmin
      .from('food_objects')
      .select('id, fiber_g, sugar_g, sodium_mg, nutrient_confidence, nutrient_provenance')
      .in('id', ids)
      .eq('is_deleted', false);

    if (error) {
      console.error('[POST /api/foods/batch] DB error:', error);
      return res.status(500).json({ error: 'Failed to fetch foods' });
    }

    // Transform to camelCase
    const foods: FoodNutrientData[] = (data || []).map((row) => ({
      id: row.id,
      fiberG: row.fiber_g,
      sugarG: row.sugar_g,
      sodiumMg: row.sodium_mg,
      nutrientConfidence: row.nutrient_confidence as FoodNutrientData['nutrientConfidence'],
      nutrientProvenance: row.nutrient_provenance as FoodNutrientData['nutrientProvenance'],
    }));

    return res.status(200).json({ foods });
  } catch (error) {
    console.error('[POST /api/foods/batch] Error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}
