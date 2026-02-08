/**
 * Omega-3 Source Detection for OB (Omega Balance) Calculation
 * 
 * Used as a fallback when omega-3/omega-6 gram data is not available.
 */

// ============================================================================
// Types
// ============================================================================

export type OmegaSourceType = 'fish' | 'plant';

export interface OmegaSourceMatch {
  type: OmegaSourceType;
  source: string;
}

// ============================================================================
// Keyword Mappings
// ============================================================================

/**
 * Fish/seafood keywords (excellent omega-3 sources).
 */
export const FISH_KEYWORDS = [
  // Fatty fish (highest O3)
  'salmon', 'mackerel', 'sardine', 'sardines', 'herring', 'anchovy', 'anchovies',
  'trout', 'tuna', 'albacore',
  // Other seafood with O3
  'fish', 'cod', 'halibut', 'bass', 'tilapia', 'mahi',
  'shrimp', 'crab', 'lobster', 'oyster', 'mussel', 'clam',
  'scallop', 'calamari', 'squid', 'octopus',
  // Fish oil
  'fish oil', 'cod liver oil', 'omega-3 supplement',
] as const;

/**
 * Plant-based omega-3 keywords (ALA sources).
 */
export const OMEGA3_PLANT_KEYWORDS = [
  // Seeds
  'chia', 'chia seed', 'flax', 'flaxseed', 'flax seed', 'linseed',
  'hemp', 'hemp seed', 'hemp hearts',
  // Nuts
  'walnut', 'walnuts',
  // Oils
  'flaxseed oil', 'walnut oil', 'hemp oil', 'canola oil',
  // Greens (lower amounts but still notable)
  'brussels sprout', 'seaweed', 'algae', 'spirulina', 'chlorella',
  // Fortified
  'omega-3 enriched', 'dha enriched', 'epa enriched',
] as const;

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Check if a food contains fish/seafood (primary omega-3 source).
 */
export function containsFish(
  canonicalName: string,
  brandName?: string | null,
  category?: string | null,
  tags?: string[]
): boolean {
  const searchText = [
    canonicalName,
    brandName || '',
    category || '',
    ...(tags || []),
  ].join(' ').toLowerCase();
  
  return FISH_KEYWORDS.some(kw => searchText.includes(kw.toLowerCase()));
}

/**
 * Check if a food is a plant-based omega-3 source.
 */
export function isOmega3PlantSource(
  canonicalName: string,
  brandName?: string | null,
  category?: string | null,
  tags?: string[]
): boolean {
  const searchText = [
    canonicalName,
    brandName || '',
    category || '',
    ...(tags || []),
  ].join(' ').toLowerCase();
  
  return OMEGA3_PLANT_KEYWORDS.some(kw => searchText.includes(kw.toLowerCase()));
}

/**
 * Detect omega-3 sources in a food.
 */
export function detectOmegaSources(
  canonicalName: string,
  brandName?: string | null,
  category?: string | null,
  tags?: string[]
): OmegaSourceMatch[] {
  const matches: OmegaSourceMatch[] = [];
  
  if (containsFish(canonicalName, brandName, category, tags)) {
    matches.push({ type: 'fish', source: 'fish/seafood' });
  }
  
  if (isOmega3PlantSource(canonicalName, brandName, category, tags)) {
    matches.push({ type: 'plant', source: 'plant omega-3' });
  }
  
  return matches;
}

/**
 * Count omega-3 sources from a list of foods for fallback OB calculation.
 * 
 * @param foods - Array of food items
 * @returns Object with hasFish flag and plant source count
 */
export function countOmegaSources(
  foods: Array<{
    canonicalName: string;
    brandName?: string | null;
    category?: string | null;
    tags?: string[];
  }>
): { hasFish: boolean; plantSourceCount: number } {
  let hasFish = false;
  const plantSources = new Set<string>();
  
  for (const food of foods) {
    if (containsFish(food.canonicalName, food.brandName, food.category, food.tags)) {
      hasFish = true;
    }
    
    if (isOmega3PlantSource(food.canonicalName, food.brandName, food.category, food.tags)) {
      // Use canonicalName as unique identifier for counting distinct sources
      plantSources.add(food.canonicalName.toLowerCase());
    }
  }
  
  return {
    hasFish,
    plantSourceCount: plantSources.size,
  };
}
