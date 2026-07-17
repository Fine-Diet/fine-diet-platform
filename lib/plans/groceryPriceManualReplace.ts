/**
 * Manual-to-sourced price replacement guardrails.
 */

import type { GroceryPriceObservation } from './groceryPricingTypes';

export const GROCERY_PRICE_MANUAL_REPLACE_REQUIRED_CODE = 'manual_replace_required';

export class GroceryPriceManualReplaceRequiredError extends Error {
  readonly code = GROCERY_PRICE_MANUAL_REPLACE_REQUIRED_CODE;
  readonly currentObservation: GroceryPriceObservation;

  constructor(currentObservation: GroceryPriceObservation) {
    super('A manual price is already recorded for this item.');
    this.name = 'GroceryPriceManualReplaceRequiredError';
    this.currentObservation = currentObservation;
  }
}

export function isGroceryPriceManualReplaceRequiredError(
  error: unknown,
): error is GroceryPriceManualReplaceRequiredError {
  return (
    error instanceof GroceryPriceManualReplaceRequiredError ||
    (typeof error === 'object' &&
      error != null &&
      (error as GroceryPriceManualReplaceRequiredError).code ===
        GROCERY_PRICE_MANUAL_REPLACE_REQUIRED_CODE &&
      'currentObservation' in error)
  );
}
