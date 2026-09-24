import type {
  GroceryHaul,
  GroceryHaulAcquisitionPatch,
  GroceryHaulExecutionItemState,
  GroceryHaulItem,
} from '@/lib/plans/types';

const ACQUIRED_BASELINE_KEYS = [
  'acquired_quantity',
  'acquired_food_object_id',
  'acquired_product_title',
  'acquired_brand_name',
  'acquired_purchase_unit',
  'acquired_package_size',
  'acquired_package_unit',
  'acquired_package_count',
  'acquired_retailer',
  'acquired_store_location',
  'acquired_postal_code',
  'acquired_price_amount',
  'acquired_price_currency',
] as const;

export type AcquiredBaselineRecord = Record<
  typeof ACQUIRED_BASELINE_KEYS[number],
  string | number | null
>;

function normalizeComparable(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number') return String(value);
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function acquisitionPatchFromHaulItem(
  item: GroceryHaulItem,
  defaultCurrency: string,
): AcquiredBaselineRecord {
  return {
    acquired_quantity: item.final_quantity,
    acquired_food_object_id: item.selected_food_object_id,
    acquired_product_title: item.product_title,
    acquired_brand_name: item.brand_name,
    acquired_purchase_unit: item.purchase_unit,
    acquired_package_size: item.package_size,
    acquired_package_unit: item.package_unit,
    acquired_package_count: item.package_count,
    acquired_retailer: item.retailer,
    acquired_store_location: item.store_location,
    acquired_postal_code: item.postal_code,
    acquired_price_amount: item.price_amount,
    acquired_price_currency: item.price_amount == null ? null : (item.price_currency ?? defaultCurrency),
  };
}

export function acquiredBaselineDiffersFromRow(
  row: Record<string, unknown>,
  baseline: AcquiredBaselineRecord,
): boolean {
  return ACQUIRED_BASELINE_KEYS.some(
    (key) => normalizeComparable(row[key]) !== normalizeComparable(baseline[key]),
  );
}

const ACQUISITION_PATCH_TO_COLUMN: Array<[keyof GroceryHaulAcquisitionPatch, keyof AcquiredBaselineRecord]> = [
  ['quantity', 'acquired_quantity'],
  ['food_object_id', 'acquired_food_object_id'],
  ['product_title', 'acquired_product_title'],
  ['brand_name', 'acquired_brand_name'],
  ['purchase_unit', 'acquired_purchase_unit'],
  ['package_size', 'acquired_package_size'],
  ['package_unit', 'acquired_package_unit'],
  ['package_count', 'acquired_package_count'],
  ['retailer', 'acquired_retailer'],
  ['store_location', 'acquired_store_location'],
  ['postal_code', 'acquired_postal_code'],
  ['price_amount', 'acquired_price_amount'],
  ['price_currency', 'acquired_price_currency'],
];

export function mergeAcquisitionOverlay(
  baseline: AcquiredBaselineRecord,
  acquisition: GroceryHaulAcquisitionPatch,
  defaultCurrency: string,
): AcquiredBaselineRecord {
  const merged = { ...baseline };
  for (const [inputField, column] of ACQUISITION_PATCH_TO_COLUMN) {
    if (acquisition[inputField] === undefined) continue;
    const value = acquisition[inputField];
    if (typeof value === 'string' || value === null) {
      const trimmed = value == null ? null : value.trim() || null;
      merged[column] = trimmed;
    } else {
      merged[column] = value;
    }
  }
  if (acquisition.price_amount === null) {
    merged.acquired_price_currency = null;
  } else if (
    typeof acquisition.price_amount === 'number'
    && acquisition.price_currency === undefined
  ) {
    merged.acquired_price_currency = defaultCurrency;
  }
  return merged;
}

export function acquisitionOverlayToJson(
  acquisition: GroceryHaulAcquisitionPatch,
): Record<string, string | number | null> {
  const overlay: Record<string, string | number | null> = {};
  for (const [inputField, column] of ACQUISITION_PATCH_TO_COLUMN) {
    if (acquisition[inputField] === undefined) continue;
    const value = acquisition[inputField];
    overlay[column] = typeof value === 'string' || value === null
      ? (value == null ? null : value.trim() || null)
      : value;
  }
  return overlay;
}

/** True when a pending explicit acquisition/substitute should win over current preparation. */
export function shouldPreservePendingAcquisitionOutcome(args: {
  acquisitionUpdatedAt: string | null;
  preparationUpdatedAt: string | null;
}): boolean {
  if (!args.acquisitionUpdatedAt) return false;
  if (!args.preparationUpdatedAt) return true;
  return Date.parse(args.acquisitionUpdatedAt) >= Date.parse(args.preparationUpdatedAt);
}

export function isExecutableShoppingExecutionRow(
  item: {
    current_preparation: { is_executable: boolean } | null;
    prepared_quantity: number;
  },
): boolean {
  if (item.current_preparation) return item.current_preparation.is_executable;
  return item.prepared_quantity > 0;
}

export function assertHaulItemPreparationAllowed(
  haul: GroceryHaul,
  executionState: GroceryHaulExecutionItemState | null,
): void {
  if (haul.status === 'closed' || haul.status === 'cancelled') {
    throw new Error('HAUL_PREPARATION_HISTORICAL');
  }
  if (haul.status === 'planned') return;
  if (haul.status === 'active') {
    if (executionState === 'pending') return;
    throw new Error('HAUL_PREPARATION_EXECUTION_LOCKED');
  }
  throw new Error('HAUL_PREPARATION_NOT_DRAFT');
}
