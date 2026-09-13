/**
 * PATCH /api/journal/food/hauls/:haulId/items/:itemId
 *
 * Owner-scoped Haul-only preparation edits. Source List rows and immutable
 * quantity_snapshot provenance are never accepted as input.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  GroceryHaulConflictError,
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
  updateGroceryHaulItemPreparation,
  type GroceryHaulItemPreparationPatch,
} from '@/lib/plans/groceryHaul/service';

const fieldTypes: Record<string, 'number' | 'nullable-number' | 'nullable-string'> = {
  final_quantity: 'number',
  selected_food_object_id: 'nullable-string',
  product_title: 'nullable-string',
  brand_name: 'nullable-string',
  purchase_unit: 'nullable-string',
  package_size: 'nullable-number',
  package_unit: 'nullable-string',
  package_count: 'nullable-number',
  retailer: 'nullable-string',
  store_location: 'nullable-string',
  postal_code: 'nullable-string',
  price_amount: 'nullable-number',
  price_currency: 'nullable-string',
  source_price_observation_id: 'nullable-string',
};

function validBody(body: Record<string, unknown>): boolean {
  return Object.entries(fieldTypes).every(([field, expected]) => {
    if (body[field] === undefined) return true;
    if (expected === 'number') return typeof body[field] === 'number';
    if (expected === 'nullable-number') {
      return body[field] === null || typeof body[field] === 'number';
    }
    return body[field] === null || typeof body[field] === 'string';
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
  const haulId = req.query.haulId;
  const itemId = req.query.itemId;
  if (typeof haulId !== 'string' || !haulId || typeof itemId !== 'string' || !itemId) {
    return res.status(400).json({ error: 'haulId and itemId are required' });
  }

  const ctx = await requireJournalAccess(req, res);
  if (!ctx) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!validBody(body)) {
    return res.status(400).json({ error: 'Invalid Haul item preparation patch.' });
  }

  try {
    const patch: GroceryHaulItemPreparationPatch = {
      finalQuantity: body.final_quantity as number | undefined,
      selectedFoodObjectId: body.selected_food_object_id as string | null | undefined,
      productTitle: body.product_title as string | null | undefined,
      brandName: body.brand_name as string | null | undefined,
      purchaseUnit: body.purchase_unit as string | null | undefined,
      packageSize: body.package_size as number | null | undefined,
      packageUnit: body.package_unit as string | null | undefined,
      packageCount: body.package_count as number | null | undefined,
      retailer: body.retailer as string | null | undefined,
      storeLocation: body.store_location as string | null | undefined,
      postalCode: body.postal_code as string | null | undefined,
      priceAmount: body.price_amount as number | null | undefined,
      priceCurrency: body.price_currency as string | null | undefined,
      sourcePriceObservationId:
        body.source_price_observation_id as string | null | undefined,
    };
    const item = await updateGroceryHaulItemPreparation({
      personId: ctx.personId,
      haulId,
      itemId,
      patch,
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
    console.error('[API /journal/food/hauls/:haulId/items/:itemId] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
