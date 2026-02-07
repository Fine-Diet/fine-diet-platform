/**
 * Admin API: Merge Apply
 * 
 * POST /api/admin/foods/merge/apply
 * 
 * Performs the merge: updates all references, soft-deletes losers, creates audit trail.
 * 
 * Body: { winner_id: string, loser_ids: string[], reason?: string }
 * 
 * Protected: requires admin role (merge is admin-only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import type { MergeRequest, MergeApplyResponse, MergeResult } from '@/lib/admin/foodTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MergeApplyResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin role (merge is destructive, admin-only)
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  try {
    const { winner_id, loser_ids, reason } = req.body as MergeRequest;

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

    // Verify winner exists and is not deleted
    const { data: winner, error: winnerError } = await supabaseAdmin
      .from('food_objects')
      .select('id')
      .eq('id', winner_id)
      .eq('is_deleted', false)
      .single();

    if (winnerError || !winner) {
      return res.status(404).json({ error: 'Winner food not found or is deleted' });
    }

    // Process each loser
    const results: MergeResult[] = [];
    let successfulMerges = 0;
    let failedMerges = 0;

    for (const loserId of loser_ids) {
      try {
        // 1. Call the merge function to update references
        const { data: mergeData, error: mergeError } = await supabaseAdmin
          .rpc('merge_food_object_references', {
            p_winner_id: winner_id,
            p_loser_id: loserId,
          });

        if (mergeError) {
          console.error(`Error merging references for ${loserId}:`, mergeError);
          results.push({
            loser_id: loserId,
            success: false,
            references_moved: {
              user_food_preferences: 0,
              food_search_log: 0,
              journal_entries: 0,
              journal_meal_templates: 0,
            },
            error: mergeError.message,
          });
          failedMerges++;
          continue;
        }

        const refCounts = mergeData as {
          user_food_preferences: number;
          food_search_log: number;
          journal_entries: number;
          journal_meal_templates: number;
        };

        // 2. Soft-delete the loser and set merged_into pointer
        const { error: deleteError } = await supabaseAdmin
          .from('food_objects')
          .update({
            is_deleted: true,
            merged_into_food_object_id: winner_id,
          })
          .eq('id', loserId);

        if (deleteError) {
          console.error(`Error soft-deleting loser ${loserId}:`, deleteError);
          // References were already moved, but soft-delete failed
          results.push({
            loser_id: loserId,
            success: false,
            references_moved: refCounts,
            error: `References moved but soft-delete failed: ${deleteError.message}`,
          });
          failedMerges++;
          continue;
        }

        // 3. Create merge audit record
        // Note: merged_by references people.id, but user.id is auth.users.id
        // We set merged_by = null to avoid FK violation. The admin's auth ID is in metadata.
        const { error: auditError } = await supabaseAdmin
          .from('food_object_merges')
          .insert({
            winner_food_object_id: winner_id,
            loser_food_object_id: loserId,
            merged_by: null, // TODO: look up people.id from auth_user_id if needed
            reason: reason || null,
            metadata: {
              references_moved: refCounts,
              merged_at: new Date().toISOString(),
              admin_auth_user_id: user.id, // Store auth user ID for audit trail
            },
          });

        if (auditError) {
          console.error(`Error creating merge audit for ${loserId}:`, auditError);
          // Merge succeeded, just audit failed
        }

        results.push({
          loser_id: loserId,
          success: true,
          references_moved: refCounts,
        });
        successfulMerges++;
      } catch (err) {
        console.error(`Error processing loser ${loserId}:`, err);
        results.push({
          loser_id: loserId,
          success: false,
          references_moved: {
            user_food_preferences: 0,
            food_search_log: 0,
            journal_entries: 0,
            journal_meal_templates: 0,
          },
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        failedMerges++;
      }
    }

    return res.status(200).json({
      winner_id,
      results,
      total_losers: loser_ids.length,
      successful_merges: successfulMerges,
      failed_merges: failedMerges,
    });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
