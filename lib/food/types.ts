/**
 * Food Types — Shared between client and server
 */

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
 * Full search response with grouped results
 */
export interface FoodSearchResponse {
  results: FoodSearchResult[];
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
 */
export function formatFoodName(food: FoodObject): string {
  if (food.brandName) {
    return `${food.canonicalName} (${food.brandName})`;
  }
  return food.canonicalName;
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
