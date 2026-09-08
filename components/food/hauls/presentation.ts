import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import type {
  GeneratedGroceryList,
  GroceryHaulAcquisitionPatch,
  GroceryHaulExecutionFinding,
  GroceryHaulExecutionItem,
  GroceryHaulExecutionItemState,
  GroceryHaulItem,
  GroceryHaulStatus,
} from '@/lib/plans/types';

export const ACQUISITION_PATCH_FIELDS = [
  'quantity',
  'food_object_id',
  'product_title',
  'brand_name',
  'purchase_unit',
  'package_size',
  'package_unit',
  'package_count',
  'retailer',
  'store_location',
  'postal_code',
  'price_amount',
  'price_currency',
] as const satisfies ReadonlyArray<keyof GroceryHaulAcquisitionPatch>;

export function groceryListTitle(list: GeneratedGroceryList): string {
  return list.title?.trim() || (list.is_default ? 'Essentials' : 'Untitled List');
}

export function haulStatusLabel(status: GroceryHaulStatus): string {
  if (status === 'planned') return 'Draft';
  if (status === 'active') return 'In progress';
  if (status === 'closed') return 'Completed';
  return 'Cancelled';
}

export function formatHaulDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatHaulCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function sourceDemandLabel(item: GroceryHaulItem): string {
  const quantity = item.quantity_snapshot;
  if (quantity == null) return item.unit_snapshot ? `Need · ${item.unit_snapshot}` : 'Need';
  return `Need · ${quantity}${item.unit_snapshot ? ` ${item.unit_snapshot}` : ''}`;
}

export function itemStoreLabel(item: GroceryHaulItem): string | null {
  return [item.retailer, item.store_location, item.postal_code]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' · ') || null;
}

export function haulHrefForStatus(haulId: string, status: GroceryHaulStatus): string {
  return status === 'active'
    ? APP_ROUTE_BUILDERS.foodHaulShop(haulId)
    : APP_ROUTE_BUILDERS.foodHaul(haulId);
}

export function executionSourceDemandLabel(
  item: Pick<GroceryHaulExecutionItem, 'source_quantity_snapshot' | 'source_unit_snapshot'>,
): string {
  const quantity = item.source_quantity_snapshot;
  if (quantity == null) {
    return item.source_unit_snapshot ? `Need · ${item.source_unit_snapshot}` : 'Need';
  }
  return `Need · ${quantity}${item.source_unit_snapshot ? ` ${item.source_unit_snapshot}` : ''}`;
}

export function preparedStoreLabel(
  item: Pick<GroceryHaulExecutionItem, 'prepared_retailer' | 'prepared_store_location' | 'prepared_postal_code'>,
): string | null {
  return [item.prepared_retailer, item.prepared_store_location, item.prepared_postal_code]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' · ') || null;
}

export function acquiredStoreLabel(
  item: Pick<GroceryHaulExecutionItem, 'acquired_retailer' | 'acquired_store_location' | 'acquired_postal_code'>,
): string | null {
  return [item.acquired_retailer, item.acquired_store_location, item.acquired_postal_code]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' · ') || null;
}

export function preparedInstructionLabel(item: GroceryHaulExecutionItem): string {
  const product = [item.prepared_brand_name, item.prepared_product_title]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' · ');
  const quantity = `Buy ${item.prepared_quantity}`;
  const store = preparedStoreLabel(item);
  return [product || 'Prepared product not set', quantity, store].filter(Boolean).join(' · ');
}

export function acquisitionOutcomeDiverged(item: GroceryHaulExecutionItem): boolean {
  return item.acquired_quantity !== item.prepared_quantity
    || item.acquired_food_object_id !== item.prepared_selected_food_object_id
    || (item.acquired_product_title ?? null) !== (item.prepared_product_title ?? null)
    || (item.acquired_brand_name ?? null) !== (item.prepared_brand_name ?? null)
    || (item.acquired_purchase_unit ?? null) !== (item.prepared_purchase_unit ?? null)
    || item.acquired_package_size !== item.prepared_package_size
    || (item.acquired_package_unit ?? null) !== (item.prepared_package_unit ?? null)
    || item.acquired_package_count !== item.prepared_package_count
    || (item.acquired_retailer ?? null) !== (item.prepared_retailer ?? null)
    || (item.acquired_store_location ?? null) !== (item.prepared_store_location ?? null)
    || (item.acquired_postal_code ?? null) !== (item.prepared_postal_code ?? null)
    || item.acquired_price_amount !== item.prepared_price_amount
    || (item.acquired_price_currency ?? null) !== (item.prepared_price_currency ?? null);
}

export function factualAcquiredSubtotal(items: GroceryHaulExecutionItem[]): number | null {
  const priced = items.filter((item) =>
    item.acquired_price_amount != null && item.acquired_quantity != null,
  );
  if (priced.length === 0) return null;
  return priced.reduce(
    (sum, item) => sum + (item.acquired_price_amount as number) * (item.acquired_quantity as number),
    0,
  );
}

export function preparedExecutionSubtotal(items: GroceryHaulExecutionItem[]): number {
  return items.reduce((sum, item) => (
    item.prepared_price_amount != null
      ? sum + item.prepared_price_amount * item.prepared_quantity
      : sum
  ), 0);
}

export function allowedExecutionActions(state: GroceryHaulExecutionItemState): {
  markInBasket: boolean;
  skip: boolean;
  returnToPending: boolean;
  substitute: boolean;
} {
  return {
    markInBasket: state === 'pending',
    skip: state === 'pending',
    returnToPending: state === 'in_basket' || state === 'skipped',
    substitute: state === 'pending' || state === 'in_basket',
  };
}

export function findingItemLabel(
  finding: GroceryHaulExecutionFinding,
  items: Array<{ id: string; name_snapshot: string }>,
): string | null {
  if (!finding.haul_item_id) return null;
  return items.find((item) => item.id === finding.haul_item_id)?.name_snapshot ?? null;
}

function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

export interface AcquisitionFormDraft {
  quantity: string;
  productTitle: string;
  brandName: string;
  purchaseUnit: string;
  packageSize: string;
  packageUnit: string;
  packageCount: string;
  retailer: string;
  storeLocation: string;
  postalCode: string;
  priceAmount: string;
  priceCurrency: string;
}

export function acquisitionFormFromItem(item: GroceryHaulExecutionItem): AcquisitionFormDraft {
  return {
    quantity: item.acquired_quantity == null ? '' : String(item.acquired_quantity),
    productTitle: item.acquired_product_title ?? '',
    brandName: item.acquired_brand_name ?? '',
    purchaseUnit: item.acquired_purchase_unit ?? '',
    packageSize: item.acquired_package_size == null ? '' : String(item.acquired_package_size),
    packageUnit: item.acquired_package_unit ?? '',
    packageCount: item.acquired_package_count == null ? '' : String(item.acquired_package_count),
    retailer: item.acquired_retailer ?? '',
    storeLocation: item.acquired_store_location ?? '',
    postalCode: item.acquired_postal_code ?? '',
    priceAmount: item.acquired_price_amount == null ? '' : String(item.acquired_price_amount),
    priceCurrency: item.acquired_price_currency ?? '',
  };
}

export function buildAcquisitionPatch(
  draft: AcquisitionFormDraft,
  item: GroceryHaulExecutionItem,
): GroceryHaulAcquisitionPatch {
  const patch: GroceryHaulAcquisitionPatch = {};
  const nextQuantity = optionalNumber(draft.quantity);
  const nextPackageSize = optionalNumber(draft.packageSize);
  const nextPackageCount = optionalNumber(draft.packageCount);
  const nextPrice = optionalNumber(draft.priceAmount);
  const textFields: Array<[
    keyof GroceryHaulAcquisitionPatch,
    string,
    string | null,
  ]> = [
    ['product_title', draft.productTitle, item.acquired_product_title],
    ['brand_name', draft.brandName, item.acquired_brand_name],
    ['purchase_unit', draft.purchaseUnit, item.acquired_purchase_unit],
    ['package_unit', draft.packageUnit, item.acquired_package_unit],
    ['retailer', draft.retailer, item.acquired_retailer],
    ['store_location', draft.storeLocation, item.acquired_store_location],
    ['postal_code', draft.postalCode, item.acquired_postal_code],
    ['price_currency', draft.priceCurrency, item.acquired_price_currency],
  ];
  for (const [key, value, original] of textFields) {
    const normalized = value.trim() || null;
    if (normalized !== (original ?? null)) Object.assign(patch, { [key]: normalized });
  }
  if (nextQuantity !== item.acquired_quantity) patch.quantity = nextQuantity;
  if (nextPackageSize !== item.acquired_package_size) patch.package_size = nextPackageSize;
  if (nextPackageCount !== item.acquired_package_count) patch.package_count = nextPackageCount;
  if (nextPrice !== item.acquired_price_amount) patch.price_amount = nextPrice;
  return patch;
}
