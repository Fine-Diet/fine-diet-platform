export type GroceryPriceProvider = 'serpapi';
export type GroceryPriceObservationSource = 'manual' | GroceryPriceProvider;
export type GroceryPriceSearchTier = 'demo' | 'premium';

export interface GroceryPriceSearchInput {
  grocery_item_id: string;
  retailer: string;
  postal_code: string;
}

export interface GroceryPriceSearchOffer {
  provider: GroceryPriceProvider;
  provider_result_id: string;
  title: string;
  retailer: string;
  price: number;
  currency: string;
  package_size: number | null;
  package_unit: string | null;
  product_url: string | null;
  image_url: string | null;
  location_label: string | null;
  match_confidence: number;
  match_reasons: string[];
}

export interface GroceryPriceSearchQuota {
  tier: GroceryPriceSearchTier;
  limit: number;
  used: number;
  remaining: number;
  reset_at: string | null;
}

export interface GroceryPriceSearchResult {
  provider: GroceryPriceProvider;
  search_event_id: string;
  query: string;
  retailer: string;
  postal_code: string;
  cache_hit: boolean;
  retrieved_at: string;
  expires_at: string;
  offers: GroceryPriceSearchOffer[];
  quota: GroceryPriceSearchQuota;
}

export interface GroceryPriceObservation {
  id: string;
  person_id: string;
  grocery_item_id: string | null;
  grocery_list_id: string;
  plan_id: string;
  date_range_start: string;
  date_range_end: string;
  match_key: string;
  food_object_id: string | null;
  source: GroceryPriceObservationSource;
  retailer: string | null;
  postal_code: string | null;
  product_title: string;
  brand_name: string | null;
  package_size: number | null;
  package_unit: string | null;
  unit_price: number;
  currency: string;
  package_count: number;
  line_total: number;
  product_url: string | null;
  image_url: string | null;
  provider_result_id: string | null;
  search_event_id: string | null;
  retrieved_at: string;
  match_confidence: number | null;
  user_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroceryHaulSummary {
  grocery_list_id: string;
  currency: string;
  estimated_total: number;
  manual_subtotal: number;
  sourced_subtotal: number;
  priced_item_count: number;
  total_item_count: number;
  unpriced_item_count: number;
  priced_coverage_percent: number;
  stale_item_count: number;
  average_match_confidence: number | null;
  newest_price_at: string | null;
  oldest_price_at: string | null;
}

export interface SaveManualGroceryPriceInput {
  grocery_item_id: string;
  retailer?: string | null;
  postal_code?: string | null;
  product_title?: string | null;
  brand_name?: string | null;
  package_size?: number | null;
  package_unit?: string | null;
  unit_price: number;
  currency?: string;
  package_count?: number;
  product_url?: string | null;
  image_url?: string | null;
}

export interface ConfirmSourcedGroceryPriceInput {
  grocery_item_id: string;
  search_event_id: string;
  provider_result_id: string;
  package_count?: number;
}
