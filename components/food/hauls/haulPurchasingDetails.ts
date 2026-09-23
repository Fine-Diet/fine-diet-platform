import type { PurchaseDetailsSummaryInput } from '@/components/food/itemManagement/purchaseDetailsSummaryFormat';
import type { GroceryHaulItem } from '@/lib/plans/types';

export interface HaulPurchasingDraft {
  productTitle: string;
  brandName: string;
  selectedFoodObjectId: string | null;
  purchaseUnit: string;
  packageSize: string;
  packageUnit: string;
  packageCount: string;
  retailer: string;
  storeLocation: string;
  postalCode: string;
  priceAmount: string;
  pendingSourcePriceObservationId: string | null;
}

export function haulDraftFromItem(item: GroceryHaulItem): HaulPurchasingDraft {
  return {
    productTitle: item.product_title ?? '',
    brandName: item.brand_name ?? '',
    selectedFoodObjectId: item.selected_food_object_id,
    purchaseUnit: item.purchase_unit ?? '',
    packageSize: item.package_size == null ? '' : String(item.package_size),
    packageUnit: item.package_unit ?? '',
    packageCount: item.package_count == null ? '' : String(item.package_count),
    retailer: item.retailer ?? '',
    storeLocation: item.store_location ?? '',
    postalCode: item.postal_code ?? '',
    priceAmount: item.price_amount == null ? '' : String(item.price_amount),
    pendingSourcePriceObservationId: item.source_price_observation_id,
  };
}

const CONTEXT_KEYS: Array<keyof HaulPurchasingDraft> = [
  'productTitle',
  'brandName',
  'selectedFoodObjectId',
  'purchaseUnit',
  'packageSize',
  'packageUnit',
  'packageCount',
  'retailer',
  'storeLocation',
  'postalCode',
];

function normalizedDraftValue(
  key: keyof HaulPurchasingDraft,
  draft: HaulPurchasingDraft,
): string | null {
  if (key === 'selectedFoodObjectId') return draft.selectedFoodObjectId;
  const raw = String(draft[key] ?? '').trim();
  return raw || null;
}

function normalizedItemValue(
  key: keyof HaulPurchasingDraft,
  item: GroceryHaulItem,
): string | null {
  switch (key) {
    case 'productTitle':
      return item.product_title?.trim() || null;
    case 'brandName':
      return item.brand_name?.trim() || null;
    case 'selectedFoodObjectId':
      return item.selected_food_object_id;
    case 'purchaseUnit':
      return item.purchase_unit?.trim() || null;
    case 'packageSize':
      return item.package_size == null ? null : String(item.package_size);
    case 'packageUnit':
      return item.package_unit?.trim() || null;
    case 'packageCount':
      return item.package_count == null ? null : String(item.package_count);
    case 'retailer':
      return item.retailer?.trim() || null;
    case 'storeLocation':
      return item.store_location?.trim() || null;
    case 'postalCode':
      return item.postal_code?.trim() || null;
    default:
      return null;
  }
}

export function haulPurchasingContextChanged(
  item: GroceryHaulItem,
  draft: HaulPurchasingDraft,
): boolean {
  return CONTEXT_KEYS.some(
    (key) => normalizedDraftValue(key, draft) !== normalizedItemValue(key, item),
  );
}

/** Sourced List price is stale once trip-prep context diverges from the saved row. */
export function haulSourcedPriceInvalidated(
  item: GroceryHaulItem,
  draft: HaulPurchasingDraft,
): boolean {
  if (item.price_source !== 'sourced') return false;
  return haulPurchasingContextChanged(item, draft);
}

export function haulPurchasingSummaryInput(
  item: GroceryHaulItem,
  draft: HaulPurchasingDraft,
): PurchaseDetailsSummaryInput {
  const invalidated = haulSourcedPriceInvalidated(item, draft);
  const priceAmount = invalidated ? '' : draft.priceAmount;
  return {
    productTitle: draft.productTitle,
    brandName: draft.brandName,
    packageSize: draft.packageSize,
    packageUnit: draft.packageUnit,
    packageCount: draft.packageCount,
    retailer: draft.retailer,
    priceAmount,
    currency: item.price_currency ?? 'USD',
  };
}

export function haulPurchasingHasDetails(draft: HaulPurchasingDraft): boolean {
  return Boolean(
    draft.productTitle.trim()
    || draft.brandName.trim()
    || draft.retailer.trim()
    || draft.priceAmount.trim(),
  );
}
