/**
 * Plant Color Classification for Phytonutrient Density (PND)
 * 
 * Maps food items to plant color categories for PND calculation.
 * Uses keyword detection and category matching.
 * 
 * Color Categories (based on phytonutrient groupings):
 * - RED: Lycopene, anthocyanins (tomatoes, red peppers, strawberries)
 * - ORANGE: Beta-carotene (carrots, sweet potatoes, oranges)
 * - YELLOW: Lutein, zeaxanthin (corn, yellow peppers, bananas)
 * - GREEN: Chlorophyll, sulforaphane (leafy greens, broccoli, herbs)
 * - BLUE_PURPLE: Anthocyanins (blueberries, eggplant, purple cabbage)
 * - WHITE_TAN: Allicin, quercetin (garlic, onions, mushrooms, cauliflower)
 */

// ============================================================================
// Types
// ============================================================================

export type PlantColor = 
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue_purple'
  | 'white_tan';

export const PLANT_COLORS: PlantColor[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue_purple',
  'white_tan',
];

// ============================================================================
// Keyword Mappings
// ============================================================================

/**
 * Keywords that indicate each color category.
 * Case-insensitive matching against food name/category/tags.
 */
export const COLOR_KEYWORDS: Record<PlantColor, readonly string[]> = {
  red: [
    // Fruits
    'tomato', 'tomatoes', 'cherry tomato', 'grape tomato',
    'strawberry', 'strawberries', 'raspberry', 'raspberries',
    'cherry', 'cherries', 'cranberry', 'cranberries',
    'watermelon', 'pomegranate', 'red grape', 'red grapes',
    'red apple', 'grapefruit', 'pink grapefruit',
    // Vegetables
    'red pepper', 'red bell pepper', 'red onion',
    'radish', 'radishes', 'beet', 'beets', 'beetroot',
    'red cabbage', 'radicchio', 'rhubarb',
  ],
  orange: [
    // Vegetables
    'carrot', 'carrots', 'sweet potato', 'sweet potatoes', 'yam', 'yams',
    'pumpkin', 'butternut squash', 'acorn squash', 'winter squash',
    'orange pepper', 'orange bell pepper',
    // Fruits
    'orange', 'oranges', 'tangerine', 'tangerines', 'clementine',
    'mandarin', 'mango', 'mangoes', 'papaya', 'apricot', 'apricots',
    'peach', 'peaches', 'nectarine', 'nectarines', 'cantaloupe',
    'persimmon',
  ],
  yellow: [
    // Vegetables
    'corn', 'sweet corn', 'yellow pepper', 'yellow bell pepper',
    'yellow squash', 'summer squash', 'spaghetti squash',
    'yellow onion', 'golden beet',
    // Fruits
    'banana', 'bananas', 'lemon', 'lemons', 'pineapple',
    'yellow apple', 'golden delicious', 'starfruit',
  ],
  green: [
    // Leafy greens
    'spinach', 'kale', 'lettuce', 'romaine', 'arugula', 'collard',
    'swiss chard', 'chard', 'bok choy', 'cabbage', 'green cabbage',
    'watercress', 'microgreens', 'sprouts', 'alfalfa sprouts',
    // Cruciferous
    'broccoli', 'broccolini', 'brussels sprout', 'brussels sprouts',
    // Other vegetables
    'asparagus', 'green bean', 'green beans', 'snap pea', 'snow pea',
    'pea', 'peas', 'edamame', 'zucchini', 'cucumber', 'celery',
    'green pepper', 'green bell pepper', 'jalapeno', 'okra',
    'artichoke', 'leek', 'scallion', 'green onion',
    // Herbs
    'parsley', 'cilantro', 'basil', 'mint', 'dill', 'chives', 'oregano',
    // Fruits
    'avocado', 'green apple', 'granny smith', 'kiwi', 'lime', 'honeydew',
    'green grape', 'green grapes',
  ],
  blue_purple: [
    // Fruits
    'blueberry', 'blueberries', 'blackberry', 'blackberries',
    'purple grape', 'concord grape', 'plum', 'plums', 'prune', 'prunes',
    'fig', 'figs', 'acai', 'elderberry', 'boysenberry',
    // Vegetables
    'eggplant', 'aubergine', 'purple cabbage', 'purple potato',
    'purple carrot', 'purple cauliflower', 'purple kale',
  ],
  white_tan: [
    // Alliums
    'garlic', 'onion', 'white onion', 'shallot', 'leek',
    // Cruciferous
    'cauliflower', 'white cabbage',
    // Mushrooms
    'mushroom', 'mushrooms', 'button mushroom', 'cremini', 'portobello',
    'shiitake', 'oyster mushroom', 'enoki', 'chanterelle',
    // Root vegetables
    'potato', 'potatoes', 'turnip', 'parsnip', 'jicama', 'ginger',
    'horseradish', 'daikon',
    // Fruits
    'banana', // Also yellow, but white inside
    'pear', 'pears', 'white peach', 'lychee',
    // Beans/legumes
    'white bean', 'cannellini', 'navy bean', 'chickpea', 'hummus',
  ],
};

// ============================================================================
// Color Detection Functions
// ============================================================================

/**
 * Detect plant colors in a food item.
 * Returns all matching colors (a food can have multiple).
 * 
 * @param canonicalName - Food canonical name
 * @param brandName - Brand name (optional)
 * @param category - Food category (optional)
 * @param tags - Food tags (optional)
 * @returns Array of detected plant colors
 */
export function detectPlantColors(
  canonicalName: string,
  brandName?: string | null,
  category?: string | null,
  tags?: string[]
): PlantColor[] {
  const searchText = [
    canonicalName,
    brandName || '',
    category || '',
    ...(tags || []),
  ].join(' ').toLowerCase();
  
  const detectedColors: PlantColor[] = [];
  
  for (const color of PLANT_COLORS) {
    const keywords = COLOR_KEYWORDS[color];
    const hasMatch = keywords.some(kw => searchText.includes(kw.toLowerCase()));
    if (hasMatch) {
      detectedColors.push(color);
    }
  }
  
  return detectedColors;
}

/**
 * Check if a food is likely a plant-based food.
 * Used to filter out non-plant foods from PND calculation.
 */
export function isLikelyPlantFood(
  canonicalName: string,
  category?: string | null
): boolean {
  const lowerName = canonicalName.toLowerCase();
  const lowerCategory = (category || '').toLowerCase();
  
  // Exclude obvious non-plant foods
  const nonPlantKeywords = [
    'beef', 'chicken', 'pork', 'fish', 'salmon', 'tuna', 'shrimp',
    'meat', 'steak', 'bacon', 'ham', 'sausage', 'turkey', 'lamb',
    'egg', 'eggs', 'dairy', 'milk', 'cheese', 'yogurt', 'butter',
    'cream', 'ice cream',
  ];
  
  const isNonPlant = nonPlantKeywords.some(kw => 
    lowerName.includes(kw) || lowerCategory.includes(kw)
  );
  
  if (isNonPlant) return false;
  
  // Check for plant categories
  const plantCategories = [
    'vegetable', 'fruit', 'legume', 'grain', 'nut', 'seed',
    'herb', 'spice', 'bean', 'produce',
  ];
  
  const isPlantCategory = plantCategories.some(cat =>
    lowerCategory.includes(cat)
  );
  
  if (isPlantCategory) return true;
  
  // Check if any color keywords match (means it's likely a plant)
  const colors = detectPlantColors(canonicalName, null, category);
  return colors.length > 0;
}

/**
 * Count unique plant colors from a list of foods.
 * 
 * @param foods - Array of food items with name/category/tags
 * @returns Number of unique colors (0-6)
 */
export function countUniquePlantColors(
  foods: Array<{
    canonicalName: string;
    brandName?: string | null;
    category?: string | null;
    tags?: string[];
  }>
): number {
  const allColors = new Set<PlantColor>();
  
  for (const food of foods) {
    const colors = detectPlantColors(
      food.canonicalName,
      food.brandName,
      food.category,
      food.tags
    );
    colors.forEach(c => allColors.add(c));
  }
  
  return allColors.size;
}

/**
 * Get display label for a plant color.
 */
export function getPlantColorLabel(color: PlantColor): string {
  switch (color) {
    case 'red': return 'Red';
    case 'orange': return 'Orange';
    case 'yellow': return 'Yellow';
    case 'green': return 'Green';
    case 'blue_purple': return 'Blue/Purple';
    case 'white_tan': return 'White/Tan';
  }
}

/**
 * Get CSS color class for a plant color.
 */
export function getPlantColorClass(color: PlantColor): string {
  switch (color) {
    case 'red': return 'bg-red-500';
    case 'orange': return 'bg-orange-500';
    case 'yellow': return 'bg-yellow-500';
    case 'green': return 'bg-green-500';
    case 'blue_purple': return 'bg-purple-500';
    case 'white_tan': return 'bg-stone-300';
  }
}
