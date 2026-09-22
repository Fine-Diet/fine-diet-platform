import type { PantryAcquisitionLotInput } from '@/lib/plans/planService';
import type { PantryAcquisitionLot } from '@/lib/plans/types';

export interface PantryLotDraft {
  acquiredOn: string;
  expiresOn: string;
  expectedShelfLifeDays: string;
  quantityAcquired: string;
  quantityRemaining: string;
  unit: string;
  productTitle: string;
  brandName: string;
  packageSize: string;
  packageUnit: string;
  packageCount: string;
  retailer: string;
  priceAmount: string;
  currency: string;
}

function optionalNumber(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

export function lotInputFromPantryLotDraft(draft: PantryLotDraft): PantryAcquisitionLotInput {
  return {
    acquired_on: draft.acquiredOn,
    expires_on: draft.expiresOn || null,
    expected_shelf_life_days: optionalNumber(draft.expectedShelfLifeDays),
    quantity_acquired: Number(draft.quantityAcquired),
    quantity_remaining: Number(draft.quantityRemaining),
    unit: draft.unit.trim() || null,
    product_title: draft.productTitle.trim() || null,
    brand_name: draft.brandName.trim() || null,
    package_size: optionalNumber(draft.packageSize),
    package_unit: draft.packageUnit.trim() || null,
    package_count: optionalNumber(draft.packageCount),
    retailer: draft.retailer.trim() || null,
    price_amount: optionalNumber(draft.priceAmount),
    currency: draft.priceAmount.trim()
      ? draft.currency.trim().toUpperCase() || 'USD'
      : null,
  };
}

export function validatePantryLotSave(
  draft: PantryLotDraft,
  existingLot: PantryAcquisitionLot | null,
): { ok: true; input: PantryAcquisitionLotInput } | { ok: false; error: string } {
  const quantityAcquired = Number(draft.quantityAcquired);
  if (!draft.acquiredOn.trim()) {
    return { ok: false, error: 'Purchased on is required.' };
  }
  if (!Number.isFinite(quantityAcquired) || quantityAcquired <= 0) {
    return { ok: false, error: 'Amount acquired must be greater than zero.' };
  }

  const preservedRemaining = existingLot
    ? existingLot.quantity_remaining
    : quantityAcquired;

  if (existingLot && quantityAcquired < preservedRemaining) {
    return {
      ok: false,
      error: `Amount acquired cannot be less than what's still on hand from this purchase (${preservedRemaining}${draft.unit.trim() ? ` ${draft.unit.trim()}` : ''}). Adjust on-hand amount separately if needed.`,
    };
  }

  const input = lotInputFromPantryLotDraft({
    ...draft,
    quantityRemaining: String(preservedRemaining),
  });

  if (
    !Number.isFinite(input.quantity_remaining)
    || input.quantity_remaining < 0
    || input.quantity_remaining > input.quantity_acquired
  ) {
    return {
      ok: false,
      error: 'Purchase quantities are inconsistent. Check amount acquired and try again.',
    };
  }

  return { ok: true, input };
}
