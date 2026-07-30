import type { GroceryShoppingOverride } from './types';

export type GroceryPriceProvider = 'serpapi';
export type GroceryPriceObservationSource = 'manual' | GroceryPriceProvider;
export type GroceryPriceSearchTier = 'demo' | 'premium';

export type FullHaulTaxStatus = 'excluded' | 'estimated' | 'incomplete';

export type FullHaulSegmentKind =
  | 'plan'
  | 'meal_map'
  | 'household_manual'
  | 'shared_unallocated'
  | 'other';

export type FullHaulAllocationMode = 'exclusive' | 'quantity_share' | 'unallocated';

export interface FullHaulCostSegment {
  segment_key: string;
  kind: FullHaulSegmentKind;
  label: string;
  source_id: string | null;
  /** Merchandise attributed to this segment (informational; not authoritative). */
  estimated_merchandise_subtotal: number;
  priced_item_count: number;
  allocation_mode: FullHaulAllocationMode;
  /** Optional review/display hint — not required for haul math. */
  unresolved_item_count?: number;
  /** Optional honest note, e.g. Shared / Unallocated explanation. */
  explanation?: string | null;
}

/** Optional quantity-share contribution for multi-source merged rows. */
export interface FullHaulContributionShare {
  segment_key: string;
  kind: FullHaulSegmentKind;
  label: string;
  source_id: string | null;
  /** Required quantity for this contribution, same unit as the grocery row. */
  quantity: number;
}

export interface FullHaulTaxContext {
  /**
   * Estimated tax amount in list currency. When omitted/null with status
   * `estimated`, tax remains incomplete.
   */
  estimated_tax?: number | null;
  status: FullHaulTaxStatus;
  disclosure?: string;
}

export interface FullHaulEstimate {
  grocery_list_id: string;
  currency: string;
  /** Canonical merchandise subtotal — each priced row counted once. */
  estimated_merchandise_subtotal: number;
  estimated_tax: number | null;
  tax_status: FullHaulTaxStatus;
  tax_disclosure: string;
  /**
   * Canonical expected shopping total: merchandise + tax when tax is
   * estimated; otherwise merchandise when tax is excluded/incomplete.
   */
  estimated_total: number;
  priced_item_count: number;
  eligible_item_count: number;
  unpriced_item_count: number;
  priced_coverage_percent: number;
  stale_item_count: number;
  average_match_confidence: number | null;
  newest_price_at: string | null;
  oldest_price_at: string | null;
  is_incomplete_estimate: boolean;
  estimate_confidence: string | null;
  /**
   * When active list quotes span more than one retailer key.
   * Null/false for plan-scoped or single-retailer / unknown.
   */
  mixed_retailers?: boolean;
  retailer_summary?: string | null;
  /** Stage-1 observation-source split (manual vs SerpAPI), not cost segments. */
  observation_manual_subtotal: number;
  observation_sourced_subtotal: number;
  segments: FullHaulCostSegment[];
}

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
  access_mode: GroceryPriceSearchTier;
  limit: number;
  used: number;
  remaining: number;
  reset_at: string | null;
  consumed_this_request: boolean;
  upgrade_required: boolean;
}

export type GroceryPriceSearchOutcome = 'results' | 'zero_results' | 'provider_error';

export interface GroceryPriceSearchProviderError {
  code: 'disabled' | 'timeout' | 'provider_error' | 'invalid_response';
  message: string;
}

export interface GroceryPriceSearchResult {
  provider: GroceryPriceProvider;
  search_event_id: string;
  query: string;
  retailer: string;
  postal_code: string;
  cache_hit: boolean;
  outcome: GroceryPriceSearchOutcome;
  retrieved_at: string;
  expires_at: string;
  offers: GroceryPriceSearchOffer[];
  quota: GroceryPriceSearchQuota;
  provider_error: GroceryPriceSearchProviderError | null;
}

export interface GroceryPriceObservation {
  id: string;
  person_id: string;
  grocery_item_id: string | null;
  grocery_list_id: string | null;
  plan_id: string | null;
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
  supersedes_observation_id: string | null;
  created_at: string;
}

/** Authoritative client state returned by a sourced-offer confirmation. */
export interface GroceryPriceConfirmationResult {
  observation: GroceryPriceObservation;
  shopping_override: GroceryShoppingOverride | null;
}

export interface GroceryHaulSummaryBundle {
  summary: GroceryHaulSummary;
  /** Canonical Full Haul Estimate + segment attribution (v1 contract). */
  full_haul: FullHaulEstimate;
  observations_by_match_key: Record<string, GroceryPriceObservation>;
  /**
   * Preferred for durable multi-batch lists. Optional for plan-scoped responses.
   */
  observations_by_item_id?: Record<string, GroceryPriceObservation>;
  /** Active compatible list-scoped quotes (durable lists). */
  list_prices_by_item_id?: Record<string, import('./types').GroceryListPriceObservation>;
  /** Prior list quotes incompatible with the active purchasing choice. */
  stale_list_prices_by_item_id?: Record<string, import('./types').GroceryListPriceObservation>;
  /** Compatible multi-retailer quote pool per item. */
  quote_pool_by_item_id?: Record<string, import('./types').GroceryListPriceObservation[]>;
  /** Active observation id per item (explicit pointer or resolved fallback). */
  active_observation_id_by_item_id?: Record<string, string>;
}

export interface GroceryHaulSummary {
  grocery_list_id: string;
  currency: string;
  estimated_total: number;
  manual_subtotal: number;
  sourced_subtotal: number;
  priced_item_count: number;
  eligible_item_count: number;
  total_item_count: number;
  unpriced_item_count: number;
  priced_coverage_percent: number;
  stale_item_count: number;
  average_match_confidence: number | null;
  newest_price_at: string | null;
  oldest_price_at: string | null;
  is_incomplete_estimate: boolean;
  confidence_summary: string | null;
  /** Additive Full Haul fields (Stage-1 clients may ignore). */
  estimated_merchandise_subtotal: number;
  estimated_tax: number | null;
  tax_status: FullHaulTaxStatus;
  tax_disclosure: string;
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
  /** Explicit intent to supersede an existing manual observation. */
  replace_manual?: boolean;
}
