/**
 * Plans — Eat-out recommender (Packet 5)
 *
 * Deterministic recommender that turns an `ImportedMenuPayload` +
 * `slot_context` + lightweight person context into the locked
 * `EatOutRecommendationPayload` shape (best / better / fallback).
 *
 * The recommender is intentionally conservative:
 *
 *   - It does NOT claim precision beyond the confidence of the parsed
 *     menu (§6c of Packet 5).
 *   - It does NOT fabricate calorie numbers when the menu has none —
 *     it emits conservative defaults per meal_type with low NDS
 *     confidence, and surfaces the watchouts inline.
 *   - Recommendations are framed as **tradeoffs**, not "the best
 *     option", so the UI can surface them as guidance rather than as
 *     a verdict.
 *
 * Scoring heuristic (provider-free, deterministic):
 *
 *   score(item) = 2*hasProtein + 2*looksLean + 1*looksVegForward +
 *                 1*looksWholeFood - 2*looksFried - 2*looksHeavyCream -
 *                 1*looksSugary - 1*looksAlcoholForward
 *
 *   best      = highest score
 *   better    = middle score (distinct from best)
 *   fallback  = lowest score that is still a dish (not sides/sauces)
 *
 * When the menu is too weak to produce three distinct options, we
 * populate what we can and leave others null; the UI handles the
 * missing tiers gracefully.
 *
 * No AI calls. No food_object lookups. Pure function.
 */

import { computeMealDerivedFromPayload } from '@/lib/nds/mealDerived';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import type { MealDerivedData } from '@/lib/nds/types';
import type {
  EatOutAttachableItem,
  EatOutAttachablePayload,
  EatOutNDSMealSnapshot,
  EatOutRecommendationOption,
  EatOutRecommendationPayload,
  EatOutRecommendationSlotContext,
  ImportedMenuPayload,
  ImportedMenuSectionItem,
} from './types';

// ============================================================================
// Keyword tables (deliberately small + transparent)
// ============================================================================

const PROTEIN_WORDS = [
  'chicken', 'turkey', 'beef', 'steak', 'pork', 'lamb', 'fish', 'salmon',
  'tuna', 'shrimp', 'prawn', 'tofu', 'tempeh', 'seitan', 'egg', 'eggs',
  'cottage cheese', 'greek yogurt', 'whey', 'edamame', 'lentil', 'chickpea',
  'bean', 'beans',
];

const LEAN_WORDS = [
  'grilled', 'roasted', 'baked', 'steamed', 'poached', 'broiled',
  'blackened', 'seared',
];

const VEG_WORDS = [
  'salad', 'greens', 'kale', 'spinach', 'arugula', 'broccoli', 'cauliflower',
  'brussels', 'zucchini', 'asparagus', 'green bean', 'peppers', 'eggplant',
  'cabbage', 'slaw', 'vegetable', 'veggies', 'tomato',
];

const WHOLE_FOOD_WORDS = [
  'quinoa', 'brown rice', 'wild rice', 'farro', 'barley', 'bulgur', 'oats',
  'whole grain', 'whole-grain', 'sweet potato', 'avocado', 'hummus',
];

const FRIED_WORDS = [
  'fried', 'deep-fried', 'crispy', 'tempura', 'panko', 'breaded', 'battered',
  'nuggets', 'wings',
];

const HEAVY_CREAM_WORDS = [
  'cream', 'creamy', 'alfredo', 'carbonara', 'bechamel', 'cheese sauce',
  'queso', 'ranch', 'hollandaise', 'gratin', 'au gratin',
];

const SUGARY_WORDS = [
  'glaze', 'glazed', 'honey', 'maple', 'candied', 'sticky', 'sweet chili',
  'teriyaki', 'barbecue', 'bbq', 'caramel',
];

const ALCOHOL_WORDS = [
  'cocktail', 'beer', 'wine', 'vodka', 'gin', 'tequila', 'rum', 'whisky',
  'whiskey', 'margarita', 'martini', 'mojito', 'spritz',
];

const SIDES_OR_NOT_A_MEAL_WORDS = [
  'side', 'sauce', 'dressing', 'dip', 'chips', 'bread service', 'butter',
  'add-on', 'add on', 'extras', 'extra ',
];

const CALORIE_DEFAULTS_BY_MEAL_TYPE: Record<
  EatOutRecommendationSlotContext['meal_type_hint'],
  { calories: number; protein_g: number; carbs_g: number; fat_g: number }
> = {
  breakfast: { calories: 450, protein_g: 20, carbs_g: 50, fat_g: 18 },
  lunch:     { calories: 650, protein_g: 30, carbs_g: 70, fat_g: 24 },
  dinner:    { calories: 800, protein_g: 40, carbs_g: 80, fat_g: 30 },
  snack:     { calories: 250, protein_g: 10, carbs_g: 28, fat_g: 10 },
};

// ============================================================================
// Menu-item parsing helpers
// ============================================================================

function lc(item: ImportedMenuSectionItem): string {
  return `${item.item_name} ${item.description ?? ''}`.toLowerCase();
}

function anyMatch(text: string, words: readonly string[]): boolean {
  return words.some((w) => text.includes(w));
}

function countMatches(text: string, words: readonly string[]): number {
  let n = 0;
  for (const w of words) if (text.includes(w)) n += 1;
  return n;
}

function looksLikeSideOrNotMeal(item: ImportedMenuSectionItem): boolean {
  const s = lc(item);
  if (anyMatch(s, SIDES_OR_NOT_A_MEAL_WORDS)) return true;
  if (item.item_name.length < 4) return true;
  return false;
}

// ============================================================================
// Nutrition extraction from menu text
//
// When a menu publishes nutrition (rare but possible), we use it; we
// never try to invent numbers. The presence of explicit nutrition_text
// upgrades the NDS confidence from 'low' to 'medium'.
// ============================================================================

const CAL_RE = /(\d{2,4})\s*(?:cal|calories|kcal)\b/i;
const PROTEIN_RE = /(\d{1,3})\s*g\s*protein\b/i;
const CARBS_RE = /(\d{1,3})\s*g\s*(?:carbs?|carbohydrates?)\b/i;
const FAT_RE = /(\d{1,3})\s*g\s*fat\b/i;

function extractNutrition(item: ImportedMenuSectionItem): {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
} {
  const blob = `${item.nutrition_text ?? ''} ${item.description ?? ''}`;
  const cal = CAL_RE.exec(blob);
  const protein = PROTEIN_RE.exec(blob);
  const carbs = CARBS_RE.exec(blob);
  const fat = FAT_RE.exec(blob);
  return {
    calories: cal ? Number(cal[1]) : null,
    protein_g: protein ? Number(protein[1]) : null,
    carbs_g: carbs ? Number(carbs[1]) : null,
    fat_g: fat ? Number(fat[1]) : null,
  };
}

// ============================================================================
// Scoring
// ============================================================================

interface ScoredItem {
  item: ImportedMenuSectionItem;
  section_name: string | null;
  score: number;
  breakdown: Record<string, number>;
  watchouts: string[];
  modifications: string[];
}

function scoreItem(
  item: ImportedMenuSectionItem,
  section_name: string | null,
): ScoredItem {
  const s = lc(item);
  const breakdown: Record<string, number> = {};
  const watchouts: string[] = [];
  const modifications: string[] = [];

  const proteinHits = Math.min(2, countMatches(s, PROTEIN_WORDS));
  if (proteinHits > 0) breakdown['protein'] = 2 * proteinHits;

  const leanHits = countMatches(s, LEAN_WORDS);
  if (leanHits > 0) breakdown['lean_cook'] = 2;

  const vegHits = countMatches(s, VEG_WORDS);
  if (vegHits > 0) breakdown['veg'] = Math.min(2, vegHits);

  const wholeHits = countMatches(s, WHOLE_FOOD_WORDS);
  if (wholeHits > 0) breakdown['whole_food'] = Math.min(2, wholeHits);

  if (anyMatch(s, FRIED_WORDS)) {
    breakdown['fried'] = -2;
    watchouts.push('Fried preparation — higher fat, higher calories.');
    modifications.push('Ask if the kitchen can grill or bake instead.');
  }

  if (anyMatch(s, HEAVY_CREAM_WORDS)) {
    breakdown['cream_sauce'] = -2;
    watchouts.push('Heavy cream/cheese sauce adds calories and saturated fat.');
    modifications.push('Ask for sauce on the side or a lighter sauce.');
  }

  if (anyMatch(s, SUGARY_WORDS)) {
    breakdown['sugary_sauce'] = -1;
    watchouts.push('Sweet glaze/sauce — added sugar.');
    modifications.push('Ask for a light drizzle instead of full-coat.');
  }

  if (anyMatch(s, ALCOHOL_WORDS)) {
    breakdown['alcohol'] = -1;
  }

  // Side items never make a main recommendation even if they score ok.
  if (looksLikeSideOrNotMeal(item)) {
    breakdown['side_penalty'] = -5;
  }

  // Generic modification: protein boost if protein signal is weak.
  if (proteinHits === 0 && !looksLikeSideOrNotMeal(item)) {
    modifications.push('Ask to add a grilled protein if you want more protein.');
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { item, section_name, score, breakdown, watchouts, modifications };
}

// ============================================================================
// Option construction
// ============================================================================

function buildAttachablePayload(
  item: ImportedMenuSectionItem,
  meal_type: EatOutRecommendationSlotContext['meal_type_hint'],
): EatOutAttachablePayload {
  const nutrition = extractNutrition(item);
  const fallback = CALORIE_DEFAULTS_BY_MEAL_TYPE[meal_type];
  const calories = nutrition.calories ?? fallback.calories;
  const protein_g = nutrition.protein_g ?? fallback.protein_g;
  const carbs_g = nutrition.carbs_g ?? fallback.carbs_g;
  const fat_g = nutrition.fat_g ?? fallback.fat_g;

  const attachableItem: EatOutAttachableItem = {
    name: item.item_name,
    quantity: 1,
    unit: 'serving',
    calories,
    macros: { protein_g, carbs_g, fat_g },
    food_object_id: null,
  };

  return {
    meal_type,
    items: [attachableItem],
    totals: { calories, protein_g, carbs_g, fat_g },
  };
}

function buildNdsSnapshot(
  option_name: string,
  payload: EatOutAttachablePayload,
  nutritionConfidence: 'high' | 'medium' | 'low',
): EatOutNDSMealSnapshot {
  const derived: MealDerivedData = computeMealDerivedFromPayload({
    name: option_name,
    calories: payload.totals.calories,
    macros: { protein: payload.totals.protein_g },
    quantity: 1,
  });
  // Food trust (linked food_objects) is always null for menu items —
  // we never auto-promote restaurant items to curated truth. NDS
  // confidence therefore tops out at 'medium' and drops to 'low' when
  // we had to synthesize calories.
  const nds_confidence: 'high' | 'medium' | 'low' =
    nutritionConfidence === 'high'
      ? 'medium'
      : nutritionConfidence === 'medium'
        ? 'medium'
        : 'low';
  return {
    protein_score_10: derived.protein_score_10,
    is_main_meal: derived.is_main_meal,
    psq_multiplier: derived.psq_multiplier,
    meal_derived_data: derived,
    nds_confidence,
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  };
}

function buildOption(
  scored: ScoredItem,
  label: 'best' | 'better' | 'fallback',
  meal_type: EatOutRecommendationSlotContext['meal_type_hint'],
): EatOutRecommendationOption {
  const attachable = buildAttachablePayload(scored.item, meal_type);
  const nutritionSignal = scored.item.nutrition_text !== null ? 'medium' : 'low';
  const ndsSnap = buildNdsSnapshot(scored.item.item_name, attachable, nutritionSignal);
  const rationale = buildRationaleMd(scored, label);
  return {
    label,
    option_name: scored.item.item_name,
    source_menu_item_name: scored.item.item_name,
    rationale_md: rationale,
    watchouts: scored.watchouts,
    modification_suggestions: scored.modifications,
    attachable_payload: attachable,
    nds_meal_snapshot: ndsSnap,
  };
}

function buildRationaleMd(
  scored: ScoredItem,
  label: 'best' | 'better' | 'fallback',
): string {
  const parts: string[] = [];
  const reasons: string[] = [];
  if ((scored.breakdown['protein'] ?? 0) > 0) reasons.push('has a solid protein anchor');
  if ((scored.breakdown['lean_cook'] ?? 0) > 0) reasons.push('uses a lean cooking method');
  if ((scored.breakdown['veg'] ?? 0) > 0) reasons.push('brings in vegetables');
  if ((scored.breakdown['whole_food'] ?? 0) > 0) reasons.push('leans on whole-food carbs');

  const cautions: string[] = [];
  if ((scored.breakdown['fried'] ?? 0) < 0) cautions.push('fried preparation');
  if ((scored.breakdown['cream_sauce'] ?? 0) < 0) cautions.push('heavy cream/cheese sauce');
  if ((scored.breakdown['sugary_sauce'] ?? 0) < 0) cautions.push('sweet glaze');

  if (label === 'best') {
    parts.push(`**Best tradeoff here** — ${reasons.length > 0 ? reasons.join(', ') : 'best score on our heuristic'}.`);
  } else if (label === 'better') {
    parts.push(`**Solid middle option** — ${reasons.length > 0 ? reasons.join(', ') : 'reasonable overall'}.`);
  } else {
    parts.push(`**Fallback** — pick this if nothing else on the menu appeals.`);
    if (cautions.length > 0) {
      parts.push(`Watch for ${cautions.join(' and ')}; modification suggestions below can help.`);
    }
  }
  if (scored.section_name) {
    parts.push(`From the **${scored.section_name}** section.`);
  }
  return parts.join(' ');
}

// ============================================================================
// Public entry point
// ============================================================================

export interface GenerateEatOutRecommendationsArgs {
  restaurant_name: string;
  menu: ImportedMenuPayload;
  slot_context: EatOutRecommendationSlotContext;
}

export function generateEatOutRecommendations(
  args: GenerateEatOutRecommendationsArgs,
): EatOutRecommendationPayload {
  const { restaurant_name, menu, slot_context } = args;
  const meal_type = slot_context.meal_type_hint;

  // Flatten + score every candidate item.
  const candidates: ScoredItem[] = [];
  for (const section of menu.sections) {
    for (const item of section.items) {
      const scored = scoreItem(item, section.section_name);
      if (!looksLikeSideOrNotMeal(scored.item)) candidates.push(scored);
    }
  }

  // Sort by score desc; break ties by whether we have explicit nutrition.
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aHasNutrition = a.item.nutrition_text !== null ? 1 : 0;
    const bHasNutrition = b.item.nutrition_text !== null ? 1 : 0;
    return bHasNutrition - aHasNutrition;
  });

  const best = candidates[0] ?? null;
  const better =
    candidates.find((c) => c !== best && c.item.item_name !== best?.item.item_name) ?? null;
  const fallback =
    [...candidates]
      .reverse()
      .find(
        (c) =>
          c !== best &&
          c !== better &&
          c.item.item_name !== best?.item.item_name &&
          c.item.item_name !== better?.item.item_name,
      ) ?? null;

  const global_watchouts: string[] = [];
  if (candidates.length === 0) {
    global_watchouts.push(
      'No strong meal candidates were detected on this menu. Consider editing the imported menu manually or picking a restaurant with clearer menu structure.',
    );
  } else {
    const menuHasNutrition = candidates.some((c) => c.item.nutrition_text !== null);
    if (!menuHasNutrition) {
      global_watchouts.push(
        'This menu did not publish nutrition data. Calorie and macro estimates are conservative defaults for the meal type — treat them as directional, not exact.',
      );
    }
    const allHeavy = candidates.every((c) => c.score <= 0);
    if (allHeavy) {
      global_watchouts.push(
        'Most options on this menu lean fried or cream-heavy. Modification asks (grill instead of fry, sauce on the side) matter more here than the exact pick.',
      );
    }
  }

  return {
    restaurant_name,
    slot_context,
    best: best ? buildOption(best, 'best', meal_type) : null,
    better: better ? buildOption(better, 'better', meal_type) : null,
    fallback: fallback ? buildOption(fallback, 'fallback', meal_type) : null,
    global_watchouts,
  };
}
