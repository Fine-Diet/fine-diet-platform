/**
 * Food Types — Shared between client and server
 */

import { fixApostropheCasing, sanitizeDisplayName } from './naturalCase';

export type FoodSourceType = 'branded' | 'common' | 'user' | 'provisional';
export type NutrientProvenance = 'internal' | 'usda' | 'label' | 'estimated' | 'user';
export type NutrientConfidence = 'high' | 'medium' | 'low';

/**
 * Input for creating a custom food item
 */
export interface CreateCustomFoodInput {
  // Required
  name: string;
  
  // Base nutrition (optional but encouraged)
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  
  // Serving info
  servingSizeG?: number;
  servingUnit?: string;
  servingDescription?: string;
  householdServingText?: string;
  
  // Advanced micronutrients (optional)
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  nutrientsExtended?: Record<string, number>;
  
  // Options
  saveToFavorites?: boolean;
}
export type SearchGroup = 'your_foods' | 'branded' | 'common';

/** Micronutrients per serving (from food_objects columns when present) */
export interface FoodNutrients {
  potassiumMg: number | null;
  magnesiumMg: number | null;
  ironMg: number | null;
  calciumMg: number | null;
  zincMg: number | null;
  folateUg: number | null;
  vitaminAUgRae: number | null;
  vitaminCmg: number | null;
  vitaminDug: number | null;
  vitaminB12Ug: number | null;
}

/**
 * Canonical FoodObject — single reference for all food items
 */
export interface FoodObject {
  id: string;
  canonicalName: string;
  brandName: string | null;
  aliases: string[];
  sourceType: FoodSourceType;
  sourceProvider: string | null;
  sourceId: string | null;
  sourceDataset: string | null;  // USDA dataset: 'branded' | 'foundation' | 'sr_legacy' | 'survey' | 'fndds' | null
  upc: string | null;
  
  // Serving
  servingSizeG: number;
  servingUnit: string;
  servingDescription: string | null;
  householdServingText: string | null;
  
  // Nutrients (per serving)
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  /** Detailed micronutrients (per serving), when available from DB */
  nutrients?: FoodNutrients | null;
  nutrientsExtended: Record<string, number>;
  
  // Provenance
  nutrientProvenance: NutrientProvenance;
  nutrientConfidence: NutrientConfidence;
  
  // Metadata
  personId: string | null;
  isVerified: boolean;
  imageUrl: string | null;
  category: string | null;
  tags: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Search result with grouping and ranking info
 */
export interface FoodSearchResult {
  food: FoodObject;
  group: SearchGroup;
  score: number;
  isFavorite: boolean;
  logCount: number;
}

/**
 * Section key for grouping search results.
 * Deterministic order: my_foods → common → branded → scanned → other
 */
export type SectionKey = 'my_foods' | 'common' | 'branded' | 'scanned' | 'other';

/**
 * A search result section with pagination support.
 */
export interface SearchResultSection {
  key: SectionKey;         // Section identifier
  label: string;           // Display label (e.g., "My Foods", "Common Foods", "Branded")
  order: number;           // Display order (1=first, higher=later)
  topScore: number;        // Highest score in this section (used for relevance display)
  total: number;           // Total items before cap
  shown: number;           // Items shown after cap
  hasMore: boolean;        // True if total > shown
  offset: number;          // Current offset (for pagination)
  items: FoodSearchResult[];
  // Legacy compatibility (deprecated)
  sourceType?: 'your_foods' | 'branded' | 'common';
}

/**
 * Full search response with grouped results
 */
export interface FoodSearchResponse {
  results: FoodSearchResult[];
  // Sections in deterministic order: my_foods → common → branded → scanned → other
  sections: SearchResultSection[];
  totalReturned: number;   // Total items across all sections after caps
  // Legacy grouped arrays (deprecated, use sections instead)
  yourFoods: FoodSearchResult[];
  branded: FoodSearchResult[];
  common: FoodSearchResult[];
  totalCount: number;
}

/**
 * UPC lookup result
 */
export interface UpcLookupResult {
  found: boolean;
  food: FoodObject | null;
  isProvisional: boolean;
  needsEnrichment: boolean;
}

/**
 * Format food display name (with brand if applicable)
 * 
 * Processing pipeline:
 * 1. Sanitize USDA brand-owner identifiers (e.g., "-0049000000016")
 * 2. Apply apostrophe casing fix (e.g., Wendy'S → Wendy's)
 */
export function formatFoodName(food: FoodObject): string {
  // First sanitize to remove USDA numeric suffixes, then fix apostrophe casing
  const name = fixApostropheCasing(sanitizeDisplayName(food.canonicalName));
  if (food.brandName) {
    const brand = fixApostropheCasing(sanitizeDisplayName(food.brandName));
    return `${name} (${brand})`;
  }
  return name;
}

/**
 * Format serving description for display
 */
export function formatServing(food: FoodObject): string {
  if (food.servingDescription) {
    return food.servingDescription;
  }
  return `${food.servingSizeG}${food.servingUnit}`;
}

/**
 * Get confidence badge color
 */
export function getConfidenceColor(confidence: NutrientConfidence): string {
  switch (confidence) {
    case 'high': return 'text-green-400';
    case 'medium': return 'text-yellow-400';
    case 'low': return 'text-orange-400';
    default: return 'text-gray-400';
  }
}

/**
 * Format calories for display (handles null)
 */
export function formatCalories(calories: number | null): string {
  if (calories === null) return '—';
  return `${Math.round(calories)} cal`;
}

/**
 * Format macros for display
 */
export function formatMacros(food: FoodObject): string {
  const parts: string[] = [];
  if (food.proteinG !== null) parts.push(`${Math.round(food.proteinG)}g P`);
  if (food.carbsG !== null) parts.push(`${Math.round(food.carbsG)}g C`);
  if (food.fatG !== null) parts.push(`${Math.round(food.fatG)}g F`);
  return parts.join(' · ') || '—';
}
