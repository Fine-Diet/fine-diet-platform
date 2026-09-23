import type { GroceryHaulItem } from '@/lib/plans/types';

import {
  type HaulPurchasingDraft,
  haulPurchasingContextChanged,
  haulSourcedPriceInvalidated,
} from './haulPurchasingDetails';

function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

export function buildHaulItemPreparationPatch(
  item: GroceryHaulItem,
  draft: HaulPurchasingDraft,
): Record<string, unknown> | null {
  const contextChanged = haulPurchasingContextChanged(item, draft);
  const sourcedInvalidated = haulSourcedPriceInvalidated(item, draft);

  const quoteOnly =
    draft.pendingSourcePriceObservationId
    && draft.pendingSourcePriceObservationId !== item.source_price_observation_id
    && !contextChanged
    && draft.priceAmount.trim() === (item.price_amount == null ? '' : String(item.price_amount));

  if (quoteOnly) {
    return { source_price_observation_id: draft.pendingSourcePriceObservationId };
  }

  const patch: Record<string, unknown> = {};
  const assignText = (
    key:
      | 'product_title'
      | 'brand_name'
      | 'purchase_unit'
      | 'package_unit'
      | 'retailer'
      | 'store_location'
      | 'postal_code',
    draftValue: string,
    original: string | null,
  ) => {
    const normalized = nullableText(draftValue);
    if (normalized !== original) patch[key] = normalized;
  };

  assignText('product_title', draft.productTitle, item.product_title);
  assignText('brand_name', draft.brandName, item.brand_name);
  assignText('purchase_unit', draft.purchaseUnit, item.purchase_unit);
  assignText('package_unit', draft.packageUnit, item.package_unit);
  assignText('retailer', draft.retailer, item.retailer);
  assignText('store_location', draft.storeLocation, item.store_location);
  assignText('postal_code', draft.postalCode, item.postal_code);

  if (draft.selectedFoodObjectId !== item.selected_food_object_id) {
    patch.selected_food_object_id = draft.selectedFoodObjectId;
  }

  const nextPackageSize = optionalNumber(draft.packageSize);
  if (nextPackageSize !== item.package_size) patch.package_size = nextPackageSize;
  const nextPackageCount = optionalNumber(draft.packageCount);
  if (nextPackageCount !== item.package_count) patch.package_count = nextPackageCount;

  const nextPrice = optionalNumber(draft.priceAmount);
  const priceChanged =
    nextPrice !== item.price_amount
    && !sourcedInvalidated
    && (draft.priceAmount.trim() !== '' || item.price_amount != null);

  if (priceChanged) {
    patch.price_amount = nextPrice;
    if (nextPrice != null) {
      patch.price_currency = item.price_currency ?? 'USD';
    }
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
}
