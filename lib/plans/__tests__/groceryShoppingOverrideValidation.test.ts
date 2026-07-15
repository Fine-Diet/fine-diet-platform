import {
  normalizeSaveGroceryShoppingDetailsInput,
  ShoppingOverrideValidationError,
  validatePurchaseQuantity,
} from '../groceryShoppingOverrideValidation';

describe('groceryShoppingOverrideValidation', () => {
  it('accepts zero and valid decimals', () => {
    expect(validatePurchaseQuantity(0)).toBe(0);
    expect(validatePurchaseQuantity(1.25)).toBe(1.25);
  });

  it('rejects negative purchase quantities', () => {
    expect(() => validatePurchaseQuantity(-1)).toThrow(ShoppingOverrideValidationError);
    expect(() => validatePurchaseQuantity(-0.01)).toThrow(/non-negative number/i);
  });

  it('rejects NaN and non-number values', () => {
    expect(() => validatePurchaseQuantity(Number.NaN)).toThrow(ShoppingOverrideValidationError);
    expect(() => validatePurchaseQuantity('2' as unknown as number)).toThrow(
      ShoppingOverrideValidationError,
    );
  });

  it('rejects save payloads with only a negative purchase quantity', () => {
    expect(() =>
      normalizeSaveGroceryShoppingDetailsInput({ purchase_quantity: -2 }),
    ).toThrow(/non-negative number/i);
  });

  it('rejects empty save payloads', () => {
    expect(() => normalizeSaveGroceryShoppingDetailsInput({})).toThrow(
      /at least one shopping detail/i,
    );
  });
});
