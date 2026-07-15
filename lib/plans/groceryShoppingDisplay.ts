/**
 * Shopping-layer display helpers for grocery rows.
 *
 * Required ingredient truth stays on grocery_items; these helpers resolve
 * what the shopper sees without mutating required amounts or provenance.
 */

import type { GroceryShoppingOverride } from './types';

export interface CanonicalFoodShoppingSource {
  canonical_name: string;
  brand_name?: string | null;
}

/** Product fields on food_objects that can support later retail search / imagery. */
export interface CanonicalFoodShoppingDetails extends CanonicalFoodShoppingSource {
  image_url?: string | null;
  upc?: string | null;
}

export function formatCanonicalFoodShoppingLabel(
  source: CanonicalFoodShoppingSource,
): string {
  const brand = source.brand_name?.trim();
  const name = source.canonical_name?.trim() ?? '';
  if (brand) return `${brand} — ${name}`;
  return name;
}

export function resolveGroceryShoppingDisplayName(options: {
  requiredName: string;
  override?: GroceryShoppingOverride | null;
  resolvedProductLabel?: string | null;
}): string {
  const explicit = options.override?.shopping_display_name?.trim();
  if (explicit) return explicit;
  const resolved = options.resolvedProductLabel?.trim();
  if (resolved) return resolved;
  return options.requiredName;
}

/**
 * True when the user has shopping-layer edits beyond the resolved product default.
 */
export function hasUserShoppingCustomization(
  override: GroceryShoppingOverride | null | undefined,
  resolvedProductLabel?: string | null,
): boolean {
  if (!override || override.match_status === 'retired') return false;
  if (
    override.purchase_quantity != null ||
    override.purchase_unit?.trim() ||
    override.preferred_product?.trim() ||
    override.aisle_category?.trim() ||
    override.note?.trim()
  ) {
    return true;
  }
  const explicit = override.shopping_display_name?.trim();
  if (!explicit) return false;
  const resolved = resolvedProductLabel?.trim();
  return !resolved || explicit !== resolved;
}
