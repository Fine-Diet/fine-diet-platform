/**
 * POST /api/journal/food/grocery-lists/:listId/hauls
 *
 * Explicit List → Haul creation. Body: { shopping_date, creation_token }.
 * Person id is taken from the session. Item snapshots are not accepted.
 *
 * Auth: self-only via requireJournalAccess.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { GroceryListNotFoundError } from '@/lib/plans/groceryListService';
import {
  GroceryHaulBlockedError,
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
  GroceryHaulValidationError,
  createGroceryHaulFromList,
} from '@/lib/plans/groceryHaul/service';
import { logEvent } from '@/lib/peopleService';
import {
  DECISION_EVENT_CHANNEL,
  PEOPLE_EVENTS_COMPAT_TYPE,
} from '@/lib/plans/decisioning/events';
import {
  GROCERY_HAUL_CREATE_POLICY_ID,
  GROCERY_HAUL_CREATE_POLICY_VERSION,
  GROCERY_HAUL_EVENT_SOURCE,
  toGroceryHaulEventMetadata,
  type GroceryHaulDecisionEvent,
} from '@/lib/plans/groceryHaul/events';

async function emitCreateEvent(
  personId: string,
  event: GroceryHaulDecisionEvent,
): Promise<void> {
  try {
    await logEvent({
      personId,
      eventType: PEOPLE_EVENTS_COMPAT_TYPE,
      source: GROCERY_HAUL_EVENT_SOURCE,
      channel: DECISION_EVENT_CHANNEL,
      metadata: toGroceryHaulEventMetadata(event),
    });
  } catch {
    /* best-effort */
  }
}

function blockedEvent(
  listId: string,
  shoppingDate: string,
  blockReason: string,
): GroceryHaulDecisionEvent {
  const allowed: GroceryHaulDecisionEvent['blockReason'][] = [
    'archived',
    'empty_or_no_demand',
    'needs_resolution',
    'complete_or_closed',
    'no_pending',
    'token_mismatch',
    'forbidden',
  ];
  return {
    event: 'grocery_haul_create_blocked',
    policyId: GROCERY_HAUL_CREATE_POLICY_ID,
    policyVersion: GROCERY_HAUL_CREATE_POLICY_VERSION,
    path: 'primary',
    reasonCodes: [blockReason],
    listId,
    haulId: null,
    shoppingDate: shoppingDate || null,
    readinessState: 'unknown',
    pendingCount: 0,
    outcome: 'blocked',
    blockReason: allowed.includes(blockReason as GroceryHaulDecisionEvent['blockReason'])
      ? (blockReason as GroceryHaulDecisionEvent['blockReason'])
      : null,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const listId = req.query.listId;
  if (typeof listId !== 'string' || !listId) {
    return res.status(400).json({ error: 'listId is required' });
  }

  const ctx = await requireJournalAccess(req, res);
  if (!ctx) return;
  const { personId } = ctx;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const shoppingDate = typeof body.shopping_date === 'string' ? body.shopping_date : '';
  const creationToken = typeof body.creation_token === 'string' ? body.creation_token : '';

  try {
    const result = await createGroceryHaulFromList({
      personId,
      listId,
      shoppingDate,
      creationToken,
    });

    await emitCreateEvent(personId, {
      event: result.outcome === 'reused' ? 'grocery_haul_create_reused' : 'grocery_haul_create_committed',
      policyId: GROCERY_HAUL_CREATE_POLICY_ID,
      policyVersion: GROCERY_HAUL_CREATE_POLICY_VERSION,
      path: 'primary',
      reasonCodes: [],
      listId,
      haulId: result.haul_id,
      shoppingDate: result.shopping_date,
      readinessState: 'unknown',
      pendingCount: result.item_count,
      outcome: result.outcome,
      blockReason: null,
    });

    return res.status(result.outcome === 'created' ? 201 : 200).json({ haul: result });
  } catch (err) {
    if (err instanceof GroceryListNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryHaulValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof GroceryHaulForbiddenError) {
      return res.status(403).json({ error: err.message });
    }
    if (err instanceof GroceryHaulBlockedError) {
      await emitCreateEvent(personId, blockedEvent(listId, shoppingDate, err.blockReason));
      return res.status(409).json({ error: err.message, block_reason: err.blockReason });
    }
    if (err instanceof GroceryHaulConflictError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[API /journal/food/grocery-lists/:listId/hauls] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
