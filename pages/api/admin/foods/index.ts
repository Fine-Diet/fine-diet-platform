/**
 * Admin API: Foods List & Create
 * 
 * GET  /api/admin/foods - List foods with filters
 * POST /api/admin/foods - Create a new Fine Diet internal food
 * 
 * Protected: requires admin or editor role
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import type {
  AdminFoodObject,
  AdminFoodListResponse,
  AdminFoodCreateInput,
  FoodSourceProvider,
} from '@/lib/admin/foodTypes';
import { generateFineDietSourceId, normalizeUpc } from '@/lib/admin/foodUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminFoodListResponse | AdminFoodObject | { error: string }>
) {
  // Require admin or editor role
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  // GET: List foods with filters
  if (req.method === 'GET') {
    try {
      const {
        query,
        provider,
        verified,
        has_upc,
        limit = '50',
        offset = '0',
      } = req.query;

      const limitNum = Math.min(parseInt(String(limit), 10) || 50, 200);
      const offsetNum = parseInt(String(offset), 10) || 0;

      // Build query
      let dbQuery = supabaseAdmin
        .from('food_objects')
        .select('*', { count: 'exact' })
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false });

      // Filter by search query
      if (query && typeof query === 'string' && query.trim()) {
        const searchTerm = query.trim();
        // Use ilike for case-insensitive search on name and brand
        dbQuery = dbQuery.or(
          `canonical_name.ilike.%${searchTerm}%,brand_name.ilike.%${searchTerm}%,upc.eq.${searchTerm}`
        );
      }

      // Filter by provider
      if (provider && typeof provider === 'string') {
        dbQuery = dbQuery.eq('source_provider', provider);
      }

      // Filter by verified status
      if (verified !== undefined) {
        const isVerified = verified === 'true' || verified === '1';
        dbQuery = dbQuery.eq('is_verified', isVerified);
      }

      // Filter by has_upc
      if (has_upc !== undefined) {
        const hasUpc = has_upc === 'true' || has_upc === '1';
        if (hasUpc) {
          dbQuery = dbQuery.not('upc', 'is', null);
        } else {
          dbQuery = dbQuery.is('upc', null);
        }
      }

      // Apply pagination
      dbQuery = dbQuery.range(offsetNum, offsetNum + limitNum - 1);

      const { data: foods, count, error } = await dbQuery;

      if (error) {
        console.error('Error fetching foods:', error);
        return res.status(500).json({ error: `Database error: ${error.message}` });
      }

      return res.status(200).json({
        foods: (foods || []) as AdminFoodObject[],
        total: count || 0,
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (error) {
      console.error('API error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // POST: Create a new Fine Diet internal food
  if (req.method === 'POST') {
    try {
      const input = req.body as AdminFoodCreateInput;

      // Validate required fields
      if (!input.canonical_name || typeof input.canonical_name !== 'string' || !input.canonical_name.trim()) {
        return res.status(400).json({ error: 'canonical_name is required' });
      }

      // Normalize UPC if provided
      const upc = input.upc ? normalizeUpc(input.upc) : null;

      // Generate source_id for Fine Diet foods
      const sourceId = generateFineDietSourceId(input.canonical_name, input.brand_name, upc);

      // Check for existing food with same source_id
      const { data: existing } = await supabaseAdmin
        .from('food_objects')
        .select('id')
        .eq('source_provider', 'fine_diet')
        .eq('source_id', sourceId)
        .eq('is_deleted', false)
        .single();

      if (existing) {
        return res.status(409).json({
          error: `A Fine Diet food with this name/brand/UPC already exists (id: ${existing.id})`,
        });
      }

      // Build insert object
      // Note: verified_by references people.id, but user.id is auth.users.id
      // For now, we set verified_by = null. Future improvement: look up people.id from auth_user_id
      const insertData = {
        canonical_name: input.canonical_name.trim(),
        brand_name: input.brand_name?.trim() || null,
        aliases: input.aliases || [],
        source_type: 'common' as const,
        source_provider: 'fine_diet' as FoodSourceProvider,
        source_id: sourceId,
        source_dataset: null,
        upc,
        
        // Serving/basis
        serving_size_g: input.serving_size_g ?? 100,
        serving_unit: input.serving_unit || 'g',
        serving_description: input.serving_description || null,
        household_serving_text: input.household_serving_text || null,
        
        // Core macros
        calories: input.calories ?? null,
        protein_g: input.protein_g ?? null,
        carbs_g: input.carbs_g ?? null,
        fat_g: input.fat_g ?? null,
        fiber_g: input.fiber_g ?? null,
        sugar_g: input.sugar_g ?? null,
        sodium_mg: input.sodium_mg ?? null,
        
        // NEW: Minerals for Nutrition Density Score
        potassium_mg: input.potassium_mg ?? null,
        magnesium_mg: input.magnesium_mg ?? null,
        iron_mg: input.iron_mg ?? null,
        calcium_mg: input.calcium_mg ?? null,
        zinc_mg: input.zinc_mg ?? null,
        
        // NEW: Vitamins for Nutrition Density Score
        folate_ug: input.folate_ug ?? null,
        vitamin_a_ug_rae: input.vitamin_a_ug_rae ?? null,
        vitamin_c_mg: input.vitamin_c_mg ?? null,
        vitamin_d_ug: input.vitamin_d_ug ?? null,
        vitamin_b12_ug: input.vitamin_b12_ug ?? null,
        
        nutrients_extended: input.nutrients_extended || null,
        nutrient_provenance: 'internal' as const,
        nutrient_confidence: input.nutrient_confidence || 'medium',
        person_id: null,
        is_verified: input.is_verified ?? false,
        is_deleted: false,
        image_url: input.image_url || null,
        category: input.category || null,
        tags: input.tags || [],
        verified_at: input.is_verified ? new Date().toISOString() : null,
        verified_by: null, // TODO: look up people.id from user.id (auth_user_id) if needed
        verification_notes: input.verification_notes || null,
      };

      const { data: created, error } = await supabaseAdmin
        .from('food_objects')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error creating food:', error);
        return res.status(500).json({ error: `Database error: ${error.message}` });
      }

      return res.status(201).json(created as AdminFoodObject);
    } catch (error) {
      console.error('API error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
