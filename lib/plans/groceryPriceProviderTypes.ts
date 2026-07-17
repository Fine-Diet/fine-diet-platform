/**
 * Provider-neutral grocery price search adapter types.
 */

import type { GroceryPriceProvider } from './groceryPricingTypes';

export interface GroceryPriceSearchContext {
  match_key: string;
  food_object_id: string | null;
  canonical_name: string | null;
  brand_name: string | null;
  upc: string | null;
  image_url: string | null;
  required_ingredient_name: string;
  required_quantity: number | null;
  required_unit: string | null;
  preferred_product: string | null;
  purchase_quantity: number | null;
  purchase_unit: string | null;
  retailer: string;
  postal_code: string;
}

export interface GroceryPriceProviderCandidate {
  provider: GroceryPriceProvider;
  provider_result_id: string;
  title: string;
  retailer: string;
  price: number;
  currency: string;
  package_text: string | null;
  package_size: number | null;
  package_unit: string | null;
  product_url: string | null;
  image_url: string | null;
  upc: string | null;
  is_local: boolean;
  retrieved_at: string;
  source_rank: number;
  match_score: number;
  match_reasons: string[];
}

export interface GroceryPriceProviderQuery {
  strategy: 'upc_retailer' | 'exact_brand_product_package_retailer' | 'brand_product_retailer' | 'ingredient_fallback_retailer';
  query: string;
}

export interface GroceryPriceProviderResult {
  provider: GroceryPriceProvider;
  query: string;
  strategy: GroceryPriceProviderQuery['strategy'];
  candidates: GroceryPriceProviderCandidate[];
  retrieved_at: string;
}

export interface GroceryPriceProviderAdapter {
  readonly provider: GroceryPriceProvider;
  buildQueries(context: GroceryPriceSearchContext): GroceryPriceProviderQuery[];
  search(
    context: GroceryPriceSearchContext,
    query: GroceryPriceProviderQuery,
    options?: { signal?: AbortSignal },
  ): Promise<GroceryPriceProviderResult>;
}

export class GroceryPriceProviderError extends Error {
  readonly code: 'disabled' | 'timeout' | 'provider_error' | 'invalid_response';

  constructor(code: GroceryPriceProviderError['code'], message: string) {
    super(message);
    this.name = 'GroceryPriceProviderError';
    this.code = code;
  }
}

export function isGroceryPriceProviderError(error: unknown): error is GroceryPriceProviderError {
  return (
    error instanceof GroceryPriceProviderError ||
    (error instanceof Error &&
      error.name === 'GroceryPriceProviderError' &&
      typeof (error as GroceryPriceProviderError).code === 'string')
  );
}
