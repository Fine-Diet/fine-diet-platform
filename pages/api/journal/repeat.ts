/**
 * API Route: Repeat From — Get foods logged in a specific day+block
 *
 * GET /api/journal/repeat?date=YYYY-MM-DD&block=morning|midday|evening&tz=America/New_York
 *
 * Returns foods logged in the specified date+block for the authenticated user.
 * - Only includes intake entries with a foodObjectId
 * - Uses user's timezone (tz param) to derive date/block from UTC occurred_at
 * - Filters strictly by requested date + block (then dedupes)
 * - Dedupes by foodObjectId (keeps first occurrence)
 * - Ordered by occurred_at asc (earliest first)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { requireJournalAuth, resolveJournalTargetPerson } from '@/lib/access/requireJournalAccess';
import type { TimeBlock } from '@/lib/journal/types';

/**
 * Derive date key (YYYY-MM-DD) from a UTC date in a specific timezone.
 */
function toDateKeyInTz(utcDate: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA locale formats as YYYY-MM-DD
  return formatter.format(utcDate);
}

/**
 * Derive time block from a UTC date in a specific timezone.
 * morning: 04:00–11:59, midday: 12:00–16:59, evening: 17:00–03:59
 */
function deriveBlockInTz(utcDate: Date, timeZone: string): TimeBlock {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });
  const hour = parseInt(formatter.format(utcDate), 10);
  if (hour >= 4 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'midday';
  return 'evening';
}

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

  // Authenticate user (journal access checked by resolveJournalTargetPerson)
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return; // 401 or 403 already sent

  // Resolve target person (supports ?person_id= for staff view-as-client)
  const personId = await resolveJournalTargetPerson(req, res, ctx);
  if (!personId) return; // 403 already sent

  // Parse and validate params
  const dateParam = req.query.date;
  const blockParam = req.query.block;
  const tzParam = req.query.tz;

  if (typeof dateParam !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  if (typeof blockParam !== 'string' || !VALID_BLOCKS.includes(blockParam)) {
    return res.status(400).json({ error: 'Invalid block. Use morning, midday, or evening.' });
  }

  // User's timezone (IANA format, e.g. "America/New_York"). Falls back to UTC if missing/invalid.
  let userTimeZone = 'UTC';
  if (typeof tzParam === 'string' && tzParam.length > 0) {
    try {
      // Validate timezone by trying to use it
      Intl.DateTimeFormat('en-US', { timeZone: tzParam });
      userTimeZone = tzParam;
    } catch {
      // Invalid timezone, keep UTC fallback
    }
  }

  try {
    // Requested date key is exactly what the client sent (YYYY-MM-DD in user's timezone)
    const requestedDateKey = dateParam;

    // Widen query window to cover timezone offsets (up to ±14 hours from UTC).
    // Query 2 days before through 2 days after in UTC, then filter strictly by user's timezone below.
    const [year, month, day] = dateParam.split('-').map(Number);
    const midnightUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const windowStart = new Date(midnightUTC.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(midnightUTC.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

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

    // Strict filter by user-timezone date + block BEFORE dedupe
    const dateAndBlockFiltered: typeof rawEntries = [];
    for (const entry of rawEntries) {
      const occurredAt = new Date(entry.occurred_at);
      const entryDateKey = toDateKeyInTz(occurredAt, userTimeZone);
      const entryBlock = deriveBlockInTz(occurredAt, userTimeZone);
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
