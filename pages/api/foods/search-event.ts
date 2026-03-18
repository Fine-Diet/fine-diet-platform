/**
 * POST /api/foods/search-event
 *
 * Receives client-side search behavior events.
 * Writes to food_search_events. Fire-and-forget from client.
 *
 * Body:
 *   event_type:               'search_result_selected' | 'search_abandoned'
 *   session_id?:              string
 *   query?:                   string
 *   selected_food_id?:        string
 *   selected_food_source?:    'user' | 'curated' | 'off'
 *   selected_result_position?: number
 *   page_context?:            string
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { getPersonIdFromAuthUserId } from '@/lib/journal/journalServerService';
import { logSearchEvent } from '@/lib/food/foodServerService';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

const CLIENT_EVENT_TYPES = ['search_result_selected', 'search_abandoned'] as const;

// Max session IDs stored per candidate (to bound JSONB size)
const MAX_STORED_SESSIONS = 50;

/**
 * Upsert an off_promotion_candidates row on each OFF selection.
 * Escalates to 'review_needed' when selection_count >= 3 OR distinct_session_count >= 2.
 * Never writes to food_objects or curated/core tables.
 */
async function upsertPromotionCandidate(args: {
  off_product_id: string;
  session_id: string | null;
}): Promise<void> {
  const { off_product_id, session_id } = args;

  const { data: existing } = await supabaseAdmin
    .from('off_promotion_candidates')
    .select('id, selection_count, session_ids, status')
    .eq('off_product_id', off_product_id)
    .maybeSingle();

  const now = new Date().toISOString();

  if (!existing) {
    const sessionIds = session_id ? [session_id] : [];

    // Phase 4: fetch product_name / brands snapshot from OFF mirror for list display
    let productName: string | null = null;
    let brands: string | null = null;
    try {
      const { data: mirrorRow } = await supabaseAdmin
        .from('off_products_mirror')
        .select('product_name,brands')
        .eq('off_product_id', off_product_id)
        .maybeSingle();
      productName = mirrorRow?.product_name ?? null;
      brands = mirrorRow?.brands ?? null;
    } catch {
      // Non-fatal — candidate still created without display name
    }

    await supabaseAdmin.from('off_promotion_candidates').insert({
      off_product_id,
      product_name: productName,
      brands,
      selection_count: 1,
      session_ids: sessionIds,
      distinct_session_count: sessionIds.length,
      status: 'raw_off',
      first_selected_at: now,
      last_selected_at: now,
      updated_at: now,
    });
    return;
  }

  const currentSessions: string[] = Array.isArray(existing.session_ids)
    ? (existing.session_ids as string[])
    : [];

  // Add session if new and within cap
  if (
    session_id &&
    !currentSessions.includes(session_id) &&
    currentSessions.length < MAX_STORED_SESSIONS
  ) {
    currentSessions.push(session_id);
  }

  const newCount = existing.selection_count + 1;
  const newDistinct = currentSessions.length;

  // Escalate only from non-terminal states
  const isEscalatable =
    existing.status === 'raw_off' || existing.status === 'normalized_off';
  const newStatus =
    isEscalatable && (newCount >= 3 || newDistinct >= 2)
      ? 'review_needed'
      : existing.status;

  await supabaseAdmin
    .from('off_promotion_candidates')
    .update({
      selection_count: newCount,
      session_ids: currentSessions,
      distinct_session_count: newDistinct,
      status: newStatus,
      last_selected_at: now,
      updated_at: now,
    })
    .eq('id', existing.id);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      event_type,
      session_id,
      query,
      selected_food_id,
      selected_food_source,
      selected_result_position,
      page_context,
    } = req.body ?? {};

    if (!CLIENT_EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({
        error: `Invalid event_type. Valid values: ${CLIENT_EVENT_TYPES.join(', ')}`,
      });
    }

    let personId: string | null = null;
    try {
      const user = await getCurrentUserWithRoleFromApi(req, res);
      if (user) personId = await getPersonIdFromAuthUserId(user.id);
    } catch {
      // Anonymous user — fine for event logging
    }

    // Non-blocking write; response does not depend on it
    await logSearchEvent({
      eventType: event_type,
      personId,
      sessionId: session_id ?? null,
      query: typeof query === 'string' ? query : undefined,
      selectedFoodId: typeof selected_food_id === 'string' ? selected_food_id : undefined,
      selectedFoodSource: selected_food_source ?? undefined,
      selectedResultPosition:
        typeof selected_result_position === 'number' ? selected_result_position : undefined,
      pageContext: typeof page_context === 'string' ? page_context : undefined,
    });

    // Phase 3: update promotion candidate on OFF selection
    if (
      event_type === 'search_result_selected' &&
      selected_food_source === 'off' &&
      typeof selected_food_id === 'string' &&
      selected_food_id.length > 0
    ) {
      upsertPromotionCandidate({
        off_product_id: selected_food_id,
        session_id: typeof session_id === 'string' ? session_id : null,
      }).catch((err) => console.error('[search-event] promotion upsert error (non-fatal):', err));
    }

    return res.status(204).end();
  } catch (error) {
    console.error('[API /api/foods/search-event] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
