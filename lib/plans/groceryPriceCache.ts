/**
 * Deterministic cache key derivation for grocery price search.
 */

import { createHash } from 'crypto';
import type { GroceryPriceSearchContext } from './groceryPriceProviderTypes';

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildGroceryPriceCacheKey(context: GroceryPriceSearchContext): string {
  const parts = [
    context.food_object_id ?? 'unresolved',
    normalizeToken(context.preferred_product),
    normalizeToken(context.purchase_unit),
    context.purchase_quantity == null ? '' : String(context.purchase_quantity),
    normalizeToken(context.retailer),
    normalizeToken(context.postal_code),
  ];
  const digest = createHash('sha256').update(parts.join('|')).digest('hex');
  return `gps:v1:${digest}`;
}

export function addDaysIso(base: Date, days: number): string {
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}
