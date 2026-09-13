/**
 * GET/POST/PATCH/DELETE /api/journal/plans/pantry/lots
 *
 * Acquisition-lot persistence beneath the existing Pantry aggregate API.
 * Person ownership always comes from the authenticated journal session.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  createPantryAcquisitionLot,
  deletePantryAcquisitionLot,
  listPantryAcquisitionLots,
  updatePantryAcquisitionLot,
  type PantryAcquisitionLotUpdate,
  type PantryAcquisitionLotWrite,
} from '@/lib/plans/pantryAcquisitionLotService';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function optionalString(value: unknown): string | null | undefined {
  return value == null ? (value === null ? null : undefined) : String(value);
}

function optionalNumber(value: unknown): number | null | undefined {
  return value == null ? (value === null ? null : undefined) : Number(value);
}

function lotWrite(body: Record<string, unknown>): PantryAcquisitionLotWrite {
  return {
    acquiredOn: typeof body.acquired_on === 'string' ? body.acquired_on : '',
    expiresOn: optionalString(body.expires_on),
    expectedShelfLifeDays: optionalNumber(body.expected_shelf_life_days),
    quantityAcquired: Number(body.quantity_acquired),
    quantityRemaining: Number(body.quantity_remaining),
    unit: optionalString(body.unit),
    productTitle: optionalString(body.product_title),
    brandName: optionalString(body.brand_name),
    packageSize: optionalNumber(body.package_size),
    packageUnit: optionalString(body.package_unit),
    packageCount: optionalNumber(body.package_count),
    retailer: optionalString(body.retailer),
    priceAmount: optionalNumber(body.price_amount),
    currency: optionalString(body.currency),
    sourceHaulId: optionalString(body.source_haul_id),
    sourceHaulItemId: optionalString(body.source_haul_item_id),
  };
}

function lotPatch(body: Record<string, unknown>): PantryAcquisitionLotUpdate {
  const patch: PantryAcquisitionLotUpdate = {};
  const fields: Array<[keyof PantryAcquisitionLotUpdate, string, 'string' | 'number']> = [
    ['acquiredOn', 'acquired_on', 'string'],
    ['expiresOn', 'expires_on', 'string'],
    ['expectedShelfLifeDays', 'expected_shelf_life_days', 'number'],
    ['quantityAcquired', 'quantity_acquired', 'number'],
    ['quantityRemaining', 'quantity_remaining', 'number'],
    ['unit', 'unit', 'string'],
    ['productTitle', 'product_title', 'string'],
    ['brandName', 'brand_name', 'string'],
    ['packageSize', 'package_size', 'number'],
    ['packageUnit', 'package_unit', 'string'],
    ['packageCount', 'package_count', 'number'],
    ['retailer', 'retailer', 'string'],
    ['priceAmount', 'price_amount', 'number'],
    ['currency', 'currency', 'string'],
    ['sourceHaulId', 'source_haul_id', 'string'],
    ['sourceHaulItemId', 'source_haul_item_id', 'string'],
  ];
  for (const [target, source, kind] of fields) {
    if (!(source in body)) continue;
    (patch as Record<string, unknown>)[target] =
      kind === 'number' ? optionalNumber(body[source]) : optionalString(body[source]);
  }
  return patch;
}

function errorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : '';
  if (message.includes('not found')) return 404;
  if (
    message.includes('must be')
    || message.includes('required')
    || message.includes('greater than')
    || message.includes('between zero')
  ) return 400;
  return 500;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method ?? '')) {
    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const ctx = await requireJournalAccess(req, res);
  if (!ctx) return;
  const { personId } = ctx;

  try {
    if (req.method === 'GET') {
      const lots = await listPantryAcquisitionLots(personId, firstParam(req.query.pantry_key));
      return res.status(200).json({ lots });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (req.method === 'POST') {
      if (typeof body.pantry_key !== 'string' || !body.pantry_key) {
        return res.status(400).json({ error: 'pantry_key is required' });
      }
      const lot = await createPantryAcquisitionLot({
        personId,
        pantryItemKey: body.pantry_key,
        lot: lotWrite(body),
      });
      return res.status(201).json({ lot });
    }

    const lotId = firstParam(req.query.lot_id);
    if (!lotId) {
      return res.status(400).json({ error: 'lot_id is required' });
    }
    if (req.method === 'DELETE') {
      const deleted = await deletePantryAcquisitionLot(personId, lotId);
      return deleted
        ? res.status(200).json({ ok: true })
        : res.status(404).json({ error: 'Pantry acquisition lot not found.' });
    }

    const lot = await updatePantryAcquisitionLot({
      personId,
      lotId,
      patch: lotPatch(body),
    });
    return res.status(200).json({ lot });
  } catch (err) {
    const status = errorStatus(err);
    console.error('[API /journal/plans/pantry/lots] error:', err);
    return res.status(status).json({
      error: status < 500 && err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
