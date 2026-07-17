/**
 * SerpAPI offer package metadata → shopping-detail merge helpers.
 */

import type { GroceryPriceObservation, GroceryPriceSearchOffer } from './groceryPricingTypes';
import type { GroceryItem, GroceryShoppingOverride } from './types';

export interface OfferPackageDetails {
  package_size: number | null;
  package_unit: string | null;
  /** Clean canonical product name; never a noisy retailer title. */
  shopping_display_name?: string | null;
  /** Clean canonical brand associated with the grounded food. */
  preferred_product?: string | null;
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

export function confirmedPackagePresentation(
  observation: Pick<
    GroceryPriceObservation,
    'source' | 'user_confirmed' | 'package_size' | 'package_unit' | 'package_count'
  >,
): { availablePackage: string | null; packagesToBuy: number } | null {
  if (observation.source === 'manual' || !observation.user_confirmed) {
    return null;
  }
  return {
    availablePackage: formatAvailablePackageLabel(
      observation.package_size,
      observation.package_unit,
    ),
    packagesToBuy: observation.package_count,
  };
}

function isEmptyPurchaseQuantity(value: number | null | undefined): boolean {
  return value == null;
}

function isEmptyPurchaseUnit(value: string | null | undefined): boolean {
  return !value?.trim();
}

function isEmptyShoppingText(value: string | null | undefined): boolean {
  return !value?.trim();
}

export function buildShoppingPackageMergeFromOffer(
  offer: OfferPackageDetails,
  existing: Partial<
    Pick<
      GroceryShoppingOverride,
      'shopping_display_name' | 'purchase_quantity' | 'purchase_unit' | 'preferred_product'
    >
  > | null,
): {
  shopping_display_name: string | null;
  purchase_quantity: number | null;
  purchase_unit: string | null;
  preferred_product: string | null;
} | null {
  const displayNameFilled =
    isEmptyShoppingText(existing?.shopping_display_name) &&
    !isEmptyShoppingText(offer.shopping_display_name);
  const quantityFilled =
    isEmptyPurchaseQuantity(existing?.purchase_quantity) && offer.package_size != null;
  const unitFilled =
    isEmptyPurchaseUnit(existing?.purchase_unit) && !isEmptyPurchaseUnit(offer.package_unit);
  const effectiveDisplayName =
    existing?.shopping_display_name?.trim() || offer.shopping_display_name?.trim() || '';
  const preferredProduct = offer.preferred_product?.trim() ?? '';
  const preferredProductFilled =
    isEmptyShoppingText(existing?.preferred_product) &&
    Boolean(preferredProduct) &&
    !effectiveDisplayName.toLowerCase().includes(preferredProduct.toLowerCase());

  if (!displayNameFilled && !quantityFilled && !unitFilled && !preferredProductFilled) {
    return null;
  }

  return {
    shopping_display_name: displayNameFilled
      ? offer.shopping_display_name?.trim() ?? null
      : existing?.shopping_display_name ?? null,
    purchase_quantity: quantityFilled
      ? offer.package_size
      : existing?.purchase_quantity ?? null,
    purchase_unit: unitFilled
      ? offer.package_unit?.trim() ?? null
      : existing?.purchase_unit ?? null,
    preferred_product: preferredProductFilled
      ? offer.preferred_product?.trim() ?? null
      : existing?.preferred_product ?? null,
  };
}

export function buildShoppingOverridePayloadAfterPackageMerge(
  item: GroceryItem,
  existing: GroceryShoppingOverride | null,
  merged: Pick<
    GroceryShoppingOverride,
    'shopping_display_name' | 'purchase_quantity' | 'purchase_unit' | 'preferred_product'
  >,
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
    shopping_display_name: merged.shopping_display_name,
    purchase_quantity: merged.purchase_quantity,
    purchase_unit: merged.purchase_unit,
    preferred_product: merged.preferred_product,
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
