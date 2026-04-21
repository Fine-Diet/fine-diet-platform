/**
 * Plans Phase 14 — Missing-item request queue types
 *
 * Structured backlog for no-match / low-confidence food item cases
 * coming out of Journal search and the Packet 6 ingredient matcher.
 * Conservative fallback behavior still runs at the caller; this queue
 * is the review trail, not a control-plane signal.
 */

export type MissingItemContext =
  | 'journal_search'
  | 'recipe_import'
  | 'manual_meal_entry'
  | 'other';

export const MISSING_ITEM_CONTEXTS: MissingItemContext[] = [
  'journal_search',
  'recipe_import',
  'manual_meal_entry',
  'other',
];

export type MissingItemSourceKind =
  | 'journal'
  | 'import'
  | 'search'
  | 'other';

export const MISSING_ITEM_SOURCE_KINDS: MissingItemSourceKind[] = [
  'journal',
  'import',
  'search',
  'other',
];

export type MissingItemStatus = 'open' | 'resolved' | 'dismissed';

export const MISSING_ITEM_STATUSES: MissingItemStatus[] = [
  'open',
  'resolved',
  'dismissed',
];

export interface MissingItemRequest {
  id: string;
  person_id: string | null;
  context: MissingItemContext;
  source_kind: MissingItemSourceKind;
  source_ref: string | null;
  raw_input: string;
  normalized_input: string;
  suggested_category: string | null;
  fallback_metadata: unknown | null;
  status: MissingItemStatus;
  resolved_food_object_id: string | null;
  resolution_notes: string | null;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  notes: string | null;
  occurrence_count: number;
  last_seen_at: string;
  alias_enrichment_applied: boolean;
  alias_enrichment_value: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Phase 15 — lightweight candidate row returned by the admin food
 * object lookup. Kept minimal so the admin picker can render without
 * pulling the full AdminFoodObject contract.
 */
export interface FoodObjectCandidate {
  id: string;
  canonical_name: string;
  brand_name: string | null;
  aliases: string[];
  category: string | null;
  source_type: string;
  source_provider: string | null;
  is_verified: boolean;
  nutrient_confidence: string | null;
}

/**
 * Runtime hook input — what callers pass when they've just hit a
 * conservative fallback. The service handles normalization and dedupe.
 */
export interface RecordMissingItemInput {
  personId: string | null;
  context: MissingItemContext;
  sourceKind: MissingItemSourceKind;
  sourceRef?: string | null;
  rawInput: string;
  suggestedCategory?: string | null;
  fallbackMetadata?: unknown | null;
  notes?: string | null;
}
