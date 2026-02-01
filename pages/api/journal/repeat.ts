/**
 * API Route: Repeat From — Get foods logged in a specific day+block
 *
 * GET /api/journal/repeat?date=YYYY-MM-DD&block=morning|midday|evening
 *
 * Returns foods logged in the specified date+block for the authenticated user.
 * - Only includes intake entries with a foodObjectId
 * - Filters strictly by requested local date + block (then dedupes) to avoid timezone boundary leak
 * - Dedupes by foodObjectId (keeps first occurrence)
 * - Ordered by occurred_at asc (earliest first)
 *
 * QA: Evening entry on Jan 27 local near end of day:
 * - /api/journal/repeat?date=2026-01-27&block=evening → includes it
 * - /api/journal/repeat?date=2026-01-28&block=evening → does NOT include it
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { getPersonIdFromAuthUserId } from '@/lib/journal/journalServerService';
import { parseLocalDate, toDateKey, deriveBlock } from '@/lib/journal/types';

// Response shape (same as history items)
interface RepeatFoodItem {
  foodObjectId: string;
  name: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  servingSizeG: number | null;
  servingUnit: string | null;
  occurredAt: string;
}

const VALID_BLOCKS = ['morning', 'midday', 'evening'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate user
  const user = await getCurrentUserWithRoleFromApi(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const personId = await getPersonIdFromAuthUserId(user.id);
  if (!personId) {
    return res.status(403).json({ error: 'No person profile linked to this account' });
  }

  // Parse and validate params
  const dateParam = req.query.date;
  const blockParam = req.query.block;

  if (typeof dateParam !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  if (typeof blockParam !== 'string' || !VALID_BLOCKS.includes(blockParam)) {
    return res.status(400).json({ error: 'Invalid block. Use morning, midday, or evening.' });
  }

  try {
    // Requested local date key (YYYY-MM-DD) — same semantics as Day View
    const requestedDate = parseLocalDate(dateParam);
    const requestedDateKey = toDateKey(requestedDate);

    // Widen query window so we don't miss boundary entries (e.g. evening 17:00–03:59 next day).
    // Query (requestedDate - 1) 00:00 through (requestedDate + 1) 23:59 in server local, then filter strictly below.
    const dayBefore = new Date(requestedDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(0, 0, 0, 0);
    const dayAfter = new Date(requestedDate);
    dayAfter.setDate(dayAfter.getDate() + 1);
    dayAfter.setHours(23, 59, 59, 999);
    const windowStart = dayBefore.toISOString();
    const windowEnd = dayAfter.toISOString();

    const { data: rawEntries, error: entriesError } = await supabaseAdmin
      .from('journal_entries')
      .select('payload, occurred_at')
      .eq('person_id', personId)
      .eq('entry_type', 'intake')
      .not('payload->foodObjectId', 'is', null)
      .gte('occurred_at', windowStart)
      .lte('occurred_at', windowEnd)
      .order('occurred_at', { ascending: true });

    if (entriesError) {
      console.error('[GET /api/journal/repeat] Entries error:', entriesError);
      return res.status(500).json({ error: 'Failed to fetch entries' });
    }

    if (!rawEntries || rawEntries.length === 0) {
      return res.status(200).json({ foods: [] });
    }

    // Strict filter by requested local date + block BEFORE dedupe (fixes timezone boundary leak)
    const dateAndBlockFiltered: typeof rawEntries = [];
    for (const entry of rawEntries) {
      const occurredAt = new Date(entry.occurred_at);
      const entryDateKey = toDateKey(occurredAt);
      const entryBlock = deriveBlock(occurredAt);
      if (entryDateKey === requestedDateKey && entryBlock === blockParam) {
        dateAndBlockFiltered.push(entry);
      }
    }

    // Dedupe by foodObjectId (keep first by occurred_at asc), then build list
    const seenFoodIds = new Set<string>();
    const filteredEntries: Array<{
      foodObjectId: string;
      name: string;
      calories: number | null;
      macros?: { protein?: number; carbs?: number; fat?: number };
      servingSizeG: number | null;
      occurredAt: string;
    }> = [];

    for (const entry of dateAndBlockFiltered) {
      const payload = entry.payload as Record<string, any>;
      const foodObjectId = payload?.foodObjectId as string | undefined;
      if (!foodObjectId || seenFoodIds.has(foodObjectId)) continue;
      seenFoodIds.add(foodObjectId);
      filteredEntries.push({
        foodObjectId,
        name: payload?.name || 'Unknown',
        calories: typeof payload?.calories === 'number' ? payload.calories : null,
        macros: payload?.macros,
        servingSizeG: typeof payload?.servingSizeG === 'number' ? payload.servingSizeG : null,
        occurredAt: entry.occurred_at,
      });
    }

    // Fetch food objects for additional data (serving info)
    const foodIds = filteredEntries.map((e) => e.foodObjectId);
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
    const repeatFoods: RepeatFoodItem[] = filteredEntries.map((e) => {
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
        occurredAt: e.occurredAt,
      };
    });

    return res.status(200).json({ foods: repeatFoods });
  } catch (error) {
    console.error('[GET /api/journal/repeat] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch repeat foods' });
  }
}
