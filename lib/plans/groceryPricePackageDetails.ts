/**
 * SerpAPI offer package metadata → shopping-detail merge helpers.
 */

import type { GroceryPriceSearchOffer } from './groceryPricingTypes';
import type { GroceryItem, GroceryShoppingOverride } from './types';

export interface OfferPackageDetails {
  package_size: number | null;
  package_unit: string | null;
}

export function formatAvailablePackageLabel(
  package_size: number | null,
  package_unit: string | null,
): string | null {
  if (package_size != null && package_unit) {
    return `${package_size} ${package_unit}`;
  }
  if (package_size != null) {
    return String(package_size);
  }
  const trimmedUnit = package_unit?.trim();
  return trimmedUnit ? trimmedUnit : null;
}

function isEmptyPurchaseQuantity(value: number | null | undefined): boolean {
  return value == null;
}

function isEmptyPurchaseUnit(value: string | null | undefined): boolean {
  return !value?.trim();
}

export function buildShoppingPackageMergeFromOffer(
  offer: OfferPackageDetails,
  existing: Pick<GroceryShoppingOverride, 'purchase_quantity' | 'purchase_unit'> | null,
): {
  purchase_quantity: number | null;
  purchase_unit: string | null;
} | null {
  const quantityFilled =
    isEmptyPurchaseQuantity(existing?.purchase_quantity) && offer.package_size != null;
  const unitFilled =
    isEmptyPurchaseUnit(existing?.purchase_unit) && !isEmptyPurchaseUnit(offer.package_unit);

  if (!quantityFilled && !unitFilled) {
    return null;
  }

  return {
    purchase_quantity: quantityFilled
      ? offer.package_size
      : existing?.purchase_quantity ?? null,
    purchase_unit: unitFilled
      ? offer.package_unit?.trim() ?? null
      : existing?.purchase_unit ?? null,
  };
}

export function buildShoppingOverridePayloadAfterPackageMerge(
  item: GroceryItem,
  existing: GroceryShoppingOverride | null,
  merged: Pick<GroceryShoppingOverride, 'purchase_quantity' | 'purchase_unit'>,
): {
  match_key: string;
  food_object_id: string | null;
  unresolved_name: string | null;
  unresolved_unit: string | null;
  shopping_display_name: string | null;
  purchase_quantity: number | null;
  purchase_unit: string | null;
  preferred_product: string | null;
  aisle_category: string | null;
  note: string | null;
} {
  return {
    match_key: existing?.match_key ?? '',
    food_object_id: item.food_object_id,
    unresolved_name: item.food_object_id ? null : item.name,
    unresolved_unit: item.unit,
    shopping_display_name: existing?.shopping_display_name ?? null,
    purchase_quantity: merged.purchase_quantity,
    purchase_unit: merged.purchase_unit,
    preferred_product: existing?.preferred_product ?? null,
    aisle_category: existing?.aisle_category ?? item.aisle_category,
    note: existing?.note ?? null,
  };
}

export function offerPackageFromSearchOffer(
  offer: Pick<GroceryPriceSearchOffer, 'package_size' | 'package_unit'>,
): OfferPackageDetails {
  return {
    package_size: offer.package_size,
    package_unit: offer.package_unit,
  };
}
