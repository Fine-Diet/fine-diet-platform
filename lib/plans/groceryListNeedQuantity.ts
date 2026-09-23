/**
 * Need quantity/unit display contract for durable grocery lists.
 *
 * Persistence: `unit` remains nullable — no backfill.
 * Product: null unit means an unspecified count of the need; UI shows implicit "item".
 */

export const GROCERY_LIST_IMPLICIT_NEED_UNIT = 'item';

export function formatGroceryListNeedQuantityLabel(
  quantity: number | null | undefined,
  unit: string | null | undefined,
): string {
  const q = quantity ?? 1;
  const trimmed = unit?.trim();
  if (trimmed) {
    return `${q} ${trimmed}`;
  }
  return `${q} ${GROCERY_LIST_IMPLICIT_NEED_UNIT}`;
}

export function groceryListNeedUnitFieldValue(unit: string | null | undefined): string {
  return unit?.trim() ?? '';
}

export function groceryListNeedUnitPlaceholder(): string {
  return `${GROCERY_LIST_IMPLICIT_NEED_UNIT} (when blank)`;
}
