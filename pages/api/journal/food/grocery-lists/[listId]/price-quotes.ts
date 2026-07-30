/**
 * GET  /api/journal/food/grocery-lists/:listId/price-quotes
 * POST /api/journal/food/grocery-lists/:listId/price-quotes  { action: 'set_active', item_id, observation_id }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { GroceryItem, GroceryListPurchasingChoice } from '@/lib/plans/types';
import { listPurchasingChoicesForList } from '@/lib/plans/groceryListPurchasingChoiceStore';
import {
  getListPriceQuotesBundle,
  GroceryListPriceValidationError,
  setActiveListQuote,
} from '@/lib/plans/groceryListPriceObservationService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const listId = req.query.listId;
  if (typeof listId !== 'string' || !listId) {
    return res.status(400).json({ error: 'listId is required' });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;

    const { data: list, error: listErr } = await supabaseAdmin
      .from('generated_grocery_lists')
      .select('id, plan_id')
      .eq('id', listId)
      .eq('person_id', ctx.personId)
      .maybeSingle();
    if (listErr || !list) {
      return res.status(404).json({ error: 'Grocery list not found.' });
    }
    if (list.plan_id) {
      return res.status(400).json({ error: 'Price quotes are for durable lists only.' });
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (body.action === 'set_active') {
        const itemId = typeof body.item_id === 'string' ? body.item_id : '';
        const observationId =
          typeof body.observation_id === 'string' ? body.observation_id : '';
        if (!itemId || !observationId) {
          return res.status(400).json({ error: 'item_id and observation_id are required.' });
        }
        const result = await setActiveListQuote({
          personId: ctx.personId,
          listId,
          itemId,
          observationId,
        });
        return res.status(200).json(result);
      }

      if (body.action === 'apply_retailer_scenario') {
        const selectionsRaw = body.selections;
        if (!selectionsRaw || typeof selectionsRaw !== 'object' || Array.isArray(selectionsRaw)) {
          return res.status(400).json({ error: 'selections map is required.' });
        }
        const selections: Record<string, string> = {};
        for (const [itemId, observationId] of Object.entries(
          selectionsRaw as Record<string, unknown>,
        )) {
          if (typeof observationId === 'string' && observationId) {
            selections[itemId] = observationId;
          }
        }
        const { applyRetailerScenarioActiveQuotes } = await import(
          '@/lib/plans/groceryListPriceObservationService'
        );
        const result = await applyRetailerScenarioActiveQuotes({
          personId: ctx.personId,
          listId,
          selections,
        });
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: 'Unsupported action.' });
    }

    const { data: items, error: itemsErr } = await supabaseAdmin
      .from('grocery_items')
      .select('*')
      .eq('grocery_list_id', listId)
      .eq('person_id', ctx.personId);
    if (itemsErr) {
      throw new Error(`Failed to load grocery items: ${itemsErr.message}`);
    }

    let choicesByItemId: Record<string, GroceryListPurchasingChoice> = {};
    try {
      const choices = await listPurchasingChoicesForList(ctx.personId, listId);
      choicesByItemId = Object.fromEntries(
        choices.map((choice) => [choice.grocery_item_id, choice]),
      );
    } catch {
      choicesByItemId = {};
    }

    const bundle = await getListPriceQuotesBundle(
      ctx.personId,
      listId,
      (items ?? []) as unknown as GroceryItem[],
      choicesByItemId,
    );
    return res.status(200).json(bundle);
  } catch (err) {
    if (err instanceof GroceryListPriceValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[API /journal/food/grocery-lists/:listId/price-quotes] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
