/**
 * GET/POST /api/journal/food/hauls/:haulId/stores
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  GroceryHaulConflictError,
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
  addGroceryHaulStore,
  getGroceryHaulDetail,
} from '@/lib/plans/groceryHaul/service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const haulId = req.query.haulId;
  if (typeof haulId !== 'string' || !haulId) {
    return res.status(400).json({ error: 'haulId is required' });
  }

  const ctx = await requireJournalAccess(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    try {
      const detail = await getGroceryHaulDetail(ctx.personId, haulId);
      return res.status(200).json({ stores: detail.stores });
    } catch (err) {
      if (err instanceof GroceryHaulNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      console.error('[API /journal/food/hauls/:haulId/stores GET] error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const source = body.source === 'serpapi' ? 'serpapi' : 'manual';
    try {
      const result = await addGroceryHaulStore({
        personId: ctx.personId,
        haulId,
        input: {
          source,
          retailer: String(body.retailer ?? ''),
          store_name: typeof body.store_name === 'string' ? body.store_name : null,
          store_location: typeof body.store_location === 'string' ? body.store_location : null,
          address_line1: typeof body.address_line1 === 'string' ? body.address_line1 : null,
          city: typeof body.city === 'string' ? body.city : null,
          region: typeof body.region === 'string' ? body.region : null,
          postal_code: typeof body.postal_code === 'string' ? body.postal_code : null,
          country_code: typeof body.country_code === 'string' ? body.country_code : null,
          latitude: typeof body.latitude === 'number' ? body.latitude : null,
          longitude: typeof body.longitude === 'number' ? body.longitude : null,
          provider_place_id:
            typeof body.provider_place_id === 'string' ? body.provider_place_id : null,
          provider_data_id:
            typeof body.provider_data_id === 'string' ? body.provider_data_id : null,
          provider_location:
            typeof body.provider_location === 'string' ? body.provider_location : null,
        },
      });
      return res.status(200).json(result);
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
      console.error('[API /journal/food/hauls/:haulId/stores POST] error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
