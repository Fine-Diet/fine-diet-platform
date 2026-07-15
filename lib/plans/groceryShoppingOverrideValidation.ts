export interface SaveGroceryShoppingDetailsInput {
  shopping_display_name?: string | null;
  purchase_quantity?: number | null;
  purchase_unit?: string | null;
  preferred_product?: string | null;
  aisle_category?: string | null;
  note?: string | null;
}

export class ShoppingOverrideValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShoppingOverrideValidationError';
    Object.setPrototypeOf(this, ShoppingOverrideValidationError.prototype);
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validatePurchaseQuantity(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ShoppingOverrideValidationError(
      'purchase_quantity must be a non-negative number.',
    );
  }
  return Math.round(value * 1000) / 1000;
}

export function hasShoppingContent(input: SaveGroceryShoppingDetailsInput): boolean {
  return !!(
    trimOrNull(input.shopping_display_name ?? null) ||
    input.purchase_quantity != null ||
    trimOrNull(input.purchase_unit ?? null) ||
    trimOrNull(input.preferred_product ?? null) ||
    trimOrNull(input.aisle_category ?? null) ||
    trimOrNull(input.note ?? null)
  );
}

export function normalizeSaveGroceryShoppingDetailsInput(
  input: SaveGroceryShoppingDetailsInput,
): {
  shopping_display_name: string | null;
  purchase_quantity: number | null;
  purchase_unit: string | null;
  preferred_product: string | null;
  aisle_category: string | null;
  note: string | null;
} {
  const purchase_quantity = validatePurchaseQuantity(input.purchase_quantity);
  const normalized = {
    shopping_display_name: trimOrNull(input.shopping_display_name ?? null),
    purchase_quantity,
    purchase_unit: trimOrNull(input.purchase_unit ?? null),
    preferred_product: trimOrNull(input.preferred_product ?? null),
    aisle_category: trimOrNull(input.aisle_category ?? null),
    note: trimOrNull(input.note ?? null),
  };
  if (!hasShoppingContent(normalized)) {
    throw new ShoppingOverrideValidationError(
      'Provide at least one shopping detail to save.',
    );
  }
  return normalized;
}
