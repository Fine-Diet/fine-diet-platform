/**
 * Processing Classification Heuristic Classifier
 * 
 * Deterministic classifier that assigns a processing_class to food items
 * based on their source dataset and name patterns.
 * 
 * Version: processing_classifier_2026-02-08.v1
 * 
 * Classification Strategy:
 * 1. Dataset/source mapping (primary signal)
 * 2. Keyword pattern matching (bumps up/down)
 * 
 * This classifier does NOT overwrite admin overrides.
 */

import type { ProcessingClass } from './types';
import { CLASSIFIER_VERSION } from './types';

// ============================================================================
// Types
// ============================================================================

export interface ClassifierInput {
  /** Food canonical name */
  canonical_name: string;
  /** Brand name if present */
  brand_name?: string | null;
  /** USDA dataset: 'branded' | 'foundation' | 'sr_legacy' | 'survey' | 'fndds' */
  source_dataset?: string | null;
  /** Source provider: 'usda' | 'fine_diet' | 'user' | 'scan' | etc. */
  source_provider?: string | null;
  /** Food category if available */
  category?: string | null;
  /** Food tags if available */
  tags?: string[];
}

export interface ClassifierOutput {
  processing_class: ProcessingClass;
  classifier_version: string;
  classifier_confidence: number;
  classification_reason: string;
}

// ============================================================================
// Keyword Patterns
// ============================================================================

/**
 * Keywords that strongly indicate ultra-processed foods (NOVA 4).
 * Case-insensitive matching.
 */
const UPF_KEYWORDS = [
  // Ready-to-eat/convenience
  'instant', 'ready-to-eat', 'ready to eat', 'rte', 'microwaveable',
  'frozen dinner', 'frozen meal', 'tv dinner',
  
  // Snacks
  'chips', 'crisp', 'puffs', 'cheetos', 'doritos', 'pringles',
  'candy', 'gummy', 'gummies', 'sour patch', 'skittles', 'm&m',
  
  // Processed meats
  'hot dog', 'hotdog', 'bacon bits', 'spam', 'bologna',
  
  // Sugary drinks
  'soda', 'cola', 'energy drink', 'red bull', 'monster energy',
  'sports drink', 'gatorade', 'powerade',
  
  // Processed sweets
  'cookie', 'cookies', 'oreo', 'brownie', 'cake mix',
  'ice cream', 'frosting', 'icing',
  
  // Fast food
  'mcdonalds', 'burger king', 'wendys', 'taco bell',
  'pizza hut', 'dominos', 'kfc',
  
  // Protein supplements (processed form)
  'protein bar', 'protein shake', 'rtd', 'ready to drink',
  'meal replacement', 'boost', 'ensure',
  
  // Additives-heavy
  'artificial', 'flavored', 'enriched',
] as const;

/**
 * Keywords that indicate protein powder/supplement (for PSQ calculation).
 */
export const PROTEIN_POWDER_KEYWORDS = [
  'whey', 'casein', 'isolate', 'protein powder', 'whey protein',
  'casein protein', 'pea protein', 'hemp protein', 'rice protein',
  'protein concentrate', 'protein isolate', 'protein blend',
] as const;

/**
 * Keywords that strongly indicate whole/unprocessed foods (NOVA 1).
 * Includes common whole food names so the classifier recognizes them
 * even when source_dataset or processing_class is missing.
 */
const WHOLE_FOOD_KEYWORDS = [
  // Preparation descriptors
  'raw', 'fresh', 'whole', 'unprocessed',
  // Quality markers
  'organic', 'grass-fed', 'wild-caught', 'pasture-raised', 'free-range', 'cage-free',
  'wild', 'natural',
  // Fruits
  'apple', 'banana', 'orange', 'grape', 'strawberr', 'blueberr',
  'raspberr', 'blackberr', 'cherr', 'mango', 'pineapple', 'peach',
  'pear', 'plum', 'melon', 'watermelon', 'cantaloupe', 'kiwi', 'papaya',
  'fig', 'pomegranate', 'avocado', 'lemon', 'lime', 'grapefruit', 'coconut',
  // Vegetables
  'broccoli', 'spinach', 'kale', 'lettuce', 'arugula', 'cabbage', 'cauliflower',
  'carrot', 'celery', 'cucumber', 'tomato', 'pepper', 'bell pepper',
  'onion', 'garlic', 'ginger', 'sweet potato', 'potato', 'yam',
  'zucchini', 'squash', 'pumpkin', 'eggplant', 'asparagus', 'artichoke',
  'green bean', 'peas', 'corn', 'beet', 'radish', 'turnip', 'parsnip',
  'leek', 'mushroom',
  // Proteins (whole)
  'egg', 'salmon', 'tuna', 'cod', 'tilapia', 'shrimp', 'trout', 'halibut',
  'bass', 'chicken breast', 'chicken thigh', 'turkey breast',
  'beef steak', 'pork chop', 'lamb', 'bison', 'venison',
  // Legumes / grains / seeds
  'lentil', 'chickpea', 'black bean', 'kidney bean',
  'quinoa', 'brown rice', 'oats', 'barley', 'millet', 'buckwheat',
  'chia seed', 'flaxseed', 'hemp seed', 'sunflower seed', 'pumpkin seed',
  'almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia',
  'peanut',
  // Dairy (whole form)
  'plain yogurt', 'greek yogurt', 'whole milk',
] as const;

/**
 * Keywords that indicate minimally processed foods (NOVA 2).
 */
const MINIMALLY_PROCESSED_KEYWORDS = [
  'frozen', 'canned', 'dried', 'roasted', 'ground',
  'sliced', 'chopped', 'diced', 'plain', 'cut',
  'no added', 'unsweetened', 'unsalted',
  'cooked', 'boiled', 'steamed', 'baked', 'grilled', 'sauteed',
  'drained', 'without salt',
  'fillet', 'steak',
] as const;

// ============================================================================
// Dataset-Based Classification
// ============================================================================

/**
 * Base classification by USDA dataset.
 * This provides the starting point before keyword adjustments.
 */
function classifyByDataset(input: ClassifierInput): {
  base_class: ProcessingClass;
  confidence: number;
  reason: string;
} {
  const { source_dataset, source_provider, brand_name } = input;
  
  // USDA Foundation Foods - typically whole/minimally processed
  if (source_dataset === 'foundation') {
    return {
      base_class: 'whole',
      confidence: 0.85,
      reason: 'USDA Foundation dataset (whole foods)',
    };
  }
  
  // USDA SR Legacy - mostly whole/minimally processed
  if (source_dataset === 'sr_legacy') {
    return {
      base_class: 'minimally_processed',
      confidence: 0.75,
      reason: 'USDA SR Legacy dataset',
    };
  }
  
  // USDA Survey/FNDDS - mixed, but often processed
  if (source_dataset === 'survey' || source_dataset === 'fndds') {
    return {
      base_class: 'processed',
      confidence: 0.60,
      reason: 'USDA Survey/FNDDS dataset (mixed processing)',
    };
  }
  
  // USDA Branded - mixed; many are just packaged whole foods
  // Default to 'processed' (not ultra_processed) — let keywords determine direction
  if (source_dataset === 'branded') {
    return {
      base_class: 'processed',
      confidence: 0.50,
      reason: 'USDA Branded dataset',
    };
  }
  
  // Fine Diet internal foods - default to processed until verified
  if (source_provider === 'fine_diet' || source_provider === 'internal') {
    return {
      base_class: 'processed',
      confidence: 0.50,
      reason: 'Fine Diet internal (pending verification)',
    };
  }
  
  // User-created foods - default to processed
  if (source_provider === 'user') {
    return {
      base_class: 'processed',
      confidence: 0.40,
      reason: 'User-created food (unverified)',
    };
  }
  
  // Scanned foods - typically branded/processed
  if (source_provider === 'scan') {
    return {
      base_class: 'processed',
      confidence: 0.50,
      reason: 'Scanned product (barcode)',
    };
  }
  
  // Has brand name - likely commercial/processed
  if (brand_name) {
    return {
      base_class: 'processed',
      confidence: 0.55,
      reason: 'Has brand name (commercial product)',
    };
  }
  
  // Unknown source - conservative default
  return {
    base_class: 'processed',
    confidence: 0.30,
    reason: 'Unknown source (default)',
  };
}

// ============================================================================
// Keyword-Based Adjustments
// ============================================================================

/**
 * Check if text contains any of the keywords (case-insensitive).
 */
function containsKeyword(text: string, keywords: readonly string[]): boolean {
  const lowerText = text.toLowerCase();
  return keywords.some(kw => lowerText.includes(kw.toLowerCase()));
}

/**
 * Adjust classification based on food name keywords.
 * 
 * IMPORTANT: Only searches canonical_name for keyword matching.
 * Brand names, categories, and tags inject noise (e.g., a brand called
 * "Lieber Chocolate & Food Products Co." would falsely trigger UPF for
 * quinoa). The food's own name is the strongest identity signal.
 * 
 * Priority logic:
 * 1. If UPF keyword + NO whole food keyword → ultra_processed
 * 2. If whole food keyword + min proc keyword → minimally_processed
 *    (a prepared whole food, e.g., "Frozen Spinach", "Grilled Salmon Fillets")
 * 3. If only whole food keyword → whole
 * 4. If UPF keyword + whole food keyword → processed (conflict, be conservative)
 * 5. If only min proc keyword → minimally_processed
 */
function adjustByKeywords(
  input: ClassifierInput,
  baseResult: { base_class: ProcessingClass; confidence: number; reason: string }
): ClassifierOutput {
  // Only search the food's canonical name — not brand/category/tags
  const searchText = (input.canonical_name || '').toLowerCase();
  
  let { base_class, confidence, reason } = baseResult;
  
  const hasUPF = containsKeyword(searchText, UPF_KEYWORDS);
  const hasWhole = containsKeyword(searchText, WHOLE_FOOD_KEYWORDS);
  const hasMinProc = containsKeyword(searchText, MINIMALLY_PROCESSED_KEYWORDS);
  
  if (hasUPF && !hasWhole) {
    // Clear UPF signal with no contradicting whole food identity
    // e.g., "Chips", "Instant Ramen", "Frozen Dinner"
    base_class = 'ultra_processed';
    confidence = Math.max(confidence, 0.80);
    reason += ' + UPF keyword';
  } else if (hasUPF && hasWhole) {
    // Conflict: UPF keyword but food IS a whole food
    // e.g., "Flavored Chicken Breast" — be conservative, call it processed
    base_class = 'processed';
    confidence = 0.50;
    reason += ' + conflicting UPF & whole food keywords';
  } else if (hasWhole && hasMinProc) {
    // Whole food that has been prepared/preserved
    // e.g., "Frozen Spinach", "Canned Salmon", "Grilled Chicken Breast"
    // NOVA 2 → gets 1.0 WFR credit (same as whole)
    base_class = 'minimally_processed';
    confidence = Math.max(confidence, 0.80);
    reason += ' + whole food (prepared)';
  } else if (hasWhole) {
    // Pure whole food identity
    // e.g., "Blueberries", "Eggs", "Quinoa", "Avocado"
    base_class = 'whole';
    confidence = Math.max(confidence, 0.85);
    reason += ' + whole food';
  } else if (hasMinProc) {
    // Preparation keyword without a specific food identity
    // e.g., "Roasted Organic Sweet Potato Slices" if no whole keyword matched
    if (base_class === 'ultra_processed') {
      base_class = 'processed';
      confidence = Math.max(confidence - 0.15, 0.45);
    } else {
      base_class = 'minimally_processed';
      confidence = Math.max(confidence, 0.65);
    }
    reason += ' + minimally processed keyword';
  }
  
  return {
    processing_class: base_class,
    classifier_version: CLASSIFIER_VERSION,
    classifier_confidence: Math.round(confidence * 100) / 100,
    classification_reason: reason,
  };
}

// ============================================================================
// Main Classifier Function
// ============================================================================

/**
 * Classify a food item's processing level.
 * 
 * This is a deterministic heuristic classifier that:
 * 1. Uses source dataset/provider as primary signal
 * 2. Adjusts based on keyword patterns in name/category/tags
 * 
 * @param input - Food data to classify
 * @returns Classification result with confidence and reason
 */
export function classifyProcessingLevel(input: ClassifierInput): ClassifierOutput {
  // Step 1: Get base classification from dataset/source
  const baseResult = classifyByDataset(input);
  
  // Step 2: Adjust based on keywords
  const result = adjustByKeywords(input, baseResult);
  
  return result;
}

/**
 * Check if a food contains protein powder keywords.
 * Used for PSQ (Protein Source Quality) calculation.
 */
export function containsProteinPowder(input: ClassifierInput): boolean {
  const searchText = [
    input.canonical_name,
    input.brand_name || '',
    input.category || '',
    ...(input.tags || []),
  ].join(' ');
  
  return containsKeyword(searchText, PROTEIN_POWDER_KEYWORDS);
}

/**
 * Check if a food is a protein bar or RTD.
 * Used for PSQ calculation.
 */
export function isProteinBarOrRTD(input: ClassifierInput): boolean {
  const searchText = [
    input.canonical_name,
    input.brand_name || '',
    input.category || '',
    ...(input.tags || []),
  ].join(' ').toLowerCase();
  
  return (
    searchText.includes('protein bar') ||
    searchText.includes('rtd') ||
    searchText.includes('ready to drink') ||
    searchText.includes('meal replacement')
  );
}

// ============================================================================
// Batch Classification
// ============================================================================

/**
 * Classify multiple food items.
 * Useful for bulk operations.
 */
export function classifyBatch(inputs: ClassifierInput[]): ClassifierOutput[] {
  return inputs.map(classifyProcessingLevel);
}
