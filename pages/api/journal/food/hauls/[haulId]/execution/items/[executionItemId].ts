import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import type {
  GroceryHaulAcquisitionPatch,
  GroceryHaulExecutionItemState,
} from '@/lib/plans/types';
import {
  GroceryHaulConflictError,
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
  updateGroceryHaulExecutionItem,
} from '@/lib/plans/groceryHaul/service';

const acquisitionFields: Array<keyof GroceryHaulAcquisitionPatch> = [
  'quantity',
  'food_object_id',
  'product_title',
  'brand_name',
  'purchase_unit',
  'package_size',
  'package_unit',
  'package_count',
  'retailer',
  'store_location',
  'postal_code',
  'price_amount',
  'price_currency',
];

function validAcquisitionValue(field: keyof GroceryHaulAcquisitionPatch, value: unknown) {
  if (value === null) return true;
  if (['quantity', 'package_size', 'package_count', 'price_amount'].includes(field)) {
    return typeof value === 'number';
  }
  return typeof value === 'string';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const { haulId, executionItemId } = req.query;
  if (
    typeof haulId !== 'string'
    || !haulId
    || typeof executionItemId !== 'string'
    || !executionItemId
  ) {
    return res.status(400).json({ error: 'haulId and executionItemId are required' });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const state = body.state as GroceryHaulExecutionItemState | undefined;
  if (
    state !== undefined
    && !(['pending', 'in_basket', 'skipped'] as const).includes(state)
  ) {
    return res.status(400).json({ error: 'Invalid execution state.' });
  }
  if (
    body.acquisition !== undefined
    && (
      !body.acquisition
      || typeof body.acquisition !== 'object'
      || Array.isArray(body.acquisition)
    )
  ) {
    return res.status(400).json({ error: 'Invalid acquisition outcome patch.' });
  }
  const rawAcquisition = (body.acquisition ?? {}) as Record<string, unknown>;
  const acquisition: GroceryHaulAcquisitionPatch = {};
  for (const field of acquisitionFields) {
    const value = rawAcquisition[field];
    if (value === undefined) continue;
    if (!validAcquisitionValue(field, value)) {
      return res.status(400).json({ error: `Invalid acquisition ${field}.` });
    }
    Object.assign(acquisition, { [field]: value });
  }

  try {
    const ctx = await requireJournalAccess(req, res);
    if (!ctx) return;
    const item = await updateGroceryHaulExecutionItem({
      personId: ctx.personId,
      haulId,
      executionItemId,
      state,
      acquisition,
    });
    return res.status(200).json({ item });
  } catch (err) {
    if (err instanceof GroceryHaulNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof GroceryHaulValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof GroceryHaulConflictError) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[API /journal/food/hauls/:haulId/execution/items/:executionItemId] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
