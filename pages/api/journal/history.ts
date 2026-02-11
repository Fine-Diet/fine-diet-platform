/**
 * API Route: Journal History (Recently Logged Foods)
 * 
 * GET /api/journal/history?limit=50
 * 
 * Returns a deduped list of recently logged foods for the authenticated user.
 * - Only includes intake entries with a foodObjectId
 * - Dedupes by foodObjectId (shows most recent occurrence per food)
 * - Ordered by most recent occurred_at desc
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { requireJournalAuth, resolveJournalTargetPerson } from '@/lib/access/requireJournalAccess';

// Response shape for history items
interface HistoryFoodItem {
  foodObjectId: string;
  name: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  servingSizeG: number | null;
  servingUnit: string | null;
  lastOccurredAt: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate user (journal access checked by resolveJournalTargetPerson)
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return; // 401 or 403 already sent

  // Resolve target person (supports ?person_id= for staff view-as-client)
  const personId = await resolveJournalTargetPerson(req, res, ctx);
  if (!personId) return; // 403 already sent

  // Parse limit
  const limitParam = req.query.limit;
  const limit = Math.min(
    typeof limitParam === 'string' ? parseInt(limitParam, 10) || 50 : 50,
    100
  );

  try {
    // Fetch recent intake entries with foodObjectId in payload
    // We fetch more than limit to account for deduplication
    const { data: entries, error: entriesError } = await supabaseAdmin
      .from('journal_entries')
      .select('payload, occurred_at')
      .eq('person_id', personId)
      .eq('entry_type', 'intake')
      .not('payload->foodObjectId', 'is', null)
      .order('occurred_at', { ascending: false })
      .limit(limit * 3); // Fetch extra for deduplication

    if (entriesError) {
      console.error('[GET /api/journal/history] Entries error:', entriesError);
      return res.status(500).json({ error: 'Failed to fetch history' });
    }

    if (!entries || entries.length === 0) {
      return res.status(200).json({ foods: [] });
    }

    // Dedupe by foodObjectId, keeping most recent (already sorted desc)
    const seenFoodIds = new Set<string>();
    const dedupedEntries: Array<{
      foodObjectId: string;
      name: string;
      calories: number | null;
      macros?: { protein?: number; carbs?: number; fat?: number };
      servingSizeG: number | null;
      occurredAt: string;
    }> = [];

    for (const entry of entries) {
      const payload = entry.payload as Record<string, any>;
      const foodObjectId = payload?.foodObjectId as string | undefined;
      
      if (foodObjectId && !seenFoodIds.has(foodObjectId)) {
        seenFoodIds.add(foodObjectId);
        dedupedEntries.push({
          foodObjectId,
          name: payload?.name || 'Unknown',
          calories: typeof payload?.calories === 'number' ? payload.calories : null,
          macros: payload?.macros,
          servingSizeG: typeof payload?.servingSizeG === 'number' ? payload.servingSizeG : null,
          occurredAt: entry.occurred_at,
        });

        if (dedupedEntries.length >= limit) break;
      }
    }

    // Fetch food objects for additional data (serving info)
    const foodIds = dedupedEntries.map((e) => e.foodObjectId);
    let foodsMap = new Map<string, { servingUnit: string | null; servingSizeG: number | null }>();

    if (foodIds.length > 0) {
      const { data: foods } = await supabaseAdmin
        .from('food_objects')
        .select('id, serving_unit, serving_size_g')
        .in('id', foodIds)
        .eq('is_deleted', false);

      if (foods) {
        for (const f of foods) {
          foodsMap.set(f.id, {
            servingUnit: f.serving_unit,
            servingSizeG: f.serving_size_g,
          });
        }
      }
    }

    // Build response
    const historyFoods: HistoryFoodItem[] = dedupedEntries.map((e) => {
      const foodInfo = foodsMap.get(e.foodObjectId);
      return {
        foodObjectId: e.foodObjectId,
        name: e.name,
        calories: e.calories,
        proteinG: e.macros?.protein ?? null,
        carbsG: e.macros?.carbs ?? null,
        fatG: e.macros?.fat ?? null,
        servingSizeG: e.servingSizeG ?? foodInfo?.servingSizeG ?? null,
        servingUnit: foodInfo?.servingUnit ?? null,
        lastOccurredAt: e.occurredAt,
      };
    });

    return res.status(200).json({ foods: historyFoods });
  } catch (error) {
    console.error('[GET /api/journal/history] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
}
