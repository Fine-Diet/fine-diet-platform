/**
 * Admin API: Merge Dry Run
 * 
 * POST /api/admin/foods/merge/dry-run
 * 
 * Returns preview of what merging would do (reference counts).
 * Does not modify the database.
 * 
 * Body: { winner_id: string, loser_ids: string[] }
 * 
 * Protected: requires admin role (merge is admin-only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import type { MergeRequest, MergeDryRunResponse, MergeImpactPreview, AdminFoodObject } from '@/lib/admin/foodTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MergeDryRunResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin role (merge is destructive, admin-only)
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  try {
    const { winner_id, loser_ids } = req.body as MergeRequest;

    // Validate input
    if (!winner_id || typeof winner_id !== 'string') {
      return res.status(400).json({ error: 'winner_id is required' });
    }

    if (!loser_ids || !Array.isArray(loser_ids) || loser_ids.length === 0) {
      return res.status(400).json({ error: 'loser_ids must be a non-empty array' });
    }

    if (loser_ids.includes(winner_id)) {
      return res.status(400).json({ error: 'winner_id cannot be in loser_ids' });
    }

    // Fetch winner
    const { data: winner, error: winnerError } = await supabaseAdmin
      .from('food_objects')
      .select('*')
      .eq('id', winner_id)
      .eq('is_deleted', false)
      .single();

    if (winnerError || !winner) {
      return res.status(404).json({ error: 'Winner food not found or is deleted' });
    }

    // Fetch losers
    const { data: losers, error: losersError } = await supabaseAdmin
      .from('food_objects')
      .select('*')
      .in('id', loser_ids);

    if (losersError) {
      console.error('Error fetching losers:', losersError);
      return res.status(500).json({ error: `Database error: ${losersError.message}` });
    }

    if (!losers || losers.length === 0) {
      return res.status(404).json({ error: 'No loser foods found' });
    }

    // Get impact preview for each loser
    const impact: MergeImpactPreview[] = [];
    let totalReferences = 0;

    for (const loser of losers) {
      // Call the preview function
      const { data: previewData, error: previewError } = await supabaseAdmin
        .rpc('preview_food_object_merge', { p_loser_id: loser.id });

      if (previewError) {
        console.error('Error getting merge preview:', previewError);
        // Continue with zeros if function doesn't exist yet
        impact.push({
          loser_id: loser.id,
          user_food_preferences: 0,
          food_search_log: 0,
          journal_entries: 0,
          journal_meal_templates: 0,
          total: 0,
        });
      } else {
        const preview = previewData as {
          user_food_preferences: number;
          food_search_log: number;
          journal_entries: number;
          journal_meal_templates: number;
          total: number;
        };
        impact.push({
          loser_id: loser.id,
          ...preview,
        });
        totalReferences += preview.total;
      }
    }

    return res.status(200).json({
      winner: winner as AdminFoodObject,
      losers: losers as AdminFoodObject[],
      impact,
      total_references: totalReferences,
    });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
