import type { GroceryPriceSearchQuota } from './groceryPricingTypes';

export type PantryProductSearchScope = 'market' | 'retailer_localized';

export interface PantryProductSearchProvenance {
  requested_postal_code: string;
  resolved_provider_location: string;
  retailer: string | null;
  scope: PantryProductSearchScope;
}

export interface PantryProductSearchOffer {
  provider_result_id: string;
  title: string;
  retailer: string;
  price: number | null;
  currency: string | null;
  package_size: number | null;
  package_unit: string | null;
  package_text: string | null;
  image_url: string | null;
}

export interface PantryProductSearchResult {
  outcome: 'results' | 'zero_results' | 'provider_error';
  query: string;
  offers: PantryProductSearchOffer[];
  quota: GroceryPriceSearchQuota;
  provider_error: { code: string; message: string } | null;
  search_provenance: PantryProductSearchProvenance | null;
}
