/**
 * Deterministic cache key derivation for grocery price search.
 */

import { createHash } from 'crypto';
import type { GroceryPriceSearchContext } from './groceryPriceProviderTypes';

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function productIdentityPart(context: GroceryPriceSearchContext): string {
  if (context.food_object_id) return context.food_object_id;
  return [
    context.match_key,
    normalizeToken(context.required_ingredient_name),
    normalizeToken(context.required_unit),
  ].join('::');
}

export function buildGroceryPriceCacheKey(context: GroceryPriceSearchContext): string {
  const parts = [
    productIdentityPart(context),
    normalizeToken(context.brand_name),
    normalizeToken(context.canonical_name),
    normalizeToken(context.preferred_product),
    normalizeToken(context.purchase_unit),
    context.purchase_quantity == null ? '' : String(context.purchase_quantity),
    normalizeToken(context.retailer),
    normalizeToken(context.postal_code),
  ];
  const digest = createHash('sha256').update(parts.join('|')).digest('hex');
  return `gps:v4:${digest}`;
}

export function addDaysIso(base: Date, days: number): string {
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}
