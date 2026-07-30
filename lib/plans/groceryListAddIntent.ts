/**
 * Pure helpers for search-first Add Item on durable grocery lists (PR3.1b).
 * Client-safe — no DB.
 */

import { parseIngredientPhrase } from './ingredientPhraseParser';
import type { FoodSearchResult } from '@/lib/food/types';
import { suggestGroceryAddCorrection, isLikelyTypoCorrection } from './groceryListAddTypoHints';

export type GroceryAddIntent = {
  raw_entry: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  /** True when quantity/unit were peeled from the typed phrase. */
  parsed_from_phrase: boolean;
  /** Explicit correction hint — never auto-applied. */
  correction_hint: string | null;
};

export function parseGroceryAddIntent(raw: string): GroceryAddIntent {
  const raw_entry = raw.trim();
  if (!raw_entry) {
    return {
      raw_entry: '',
      name: '',
      quantity: null,
      unit: null,
      parsed_from_phrase: false,
      correction_hint: null,
    };
  }

  const parsed = parseIngredientPhrase(raw_entry);
  const name = (parsed.normalized_name ?? '').trim() || raw_entry;
  const quantity = parsed.quantity_value;
  const unit = parsed.quantity_unit?.trim() || null;
  const parsed_from_phrase = quantity != null || Boolean(unit);
  const correction_hint =
    suggestGroceryAddCorrection(name) ?? suggestGroceryAddCorrection(raw_entry);

  return {
    raw_entry,
    name,
    quantity,
    unit,
    parsed_from_phrase,
    correction_hint,
  };
}

export type GroceryAddSuggestionGroup = 'ingredient' | 'product';

export type GroceryAddSuggestion = {
  group: GroceryAddSuggestionGroup;
  food_object_id: string;
  label: string;
  source_label: string | null;
  /** Explicit “Did you mean…” when normalized search differs from typed name. */
  did_you_mean: boolean;
};

function isProductCandidate(result: FoodSearchResult): boolean {
  const food = result.food;
  if (food.brandName?.trim()) return true;
  if (food.sourceType === 'branded') return true;
  if (food.upc) return true;
  return false;
}

function suggestionLabel(result: FoodSearchResult): string {
  const food = result.food;
  if (food.brandName?.trim()) {
    return `${food.brandName.trim()} — ${food.canonicalName}`;
  }
  return food.canonicalName;
}

/**
 * Group search results for Add Item. Never silently replaces the typed phrase;
 * callers surface Did you mean when labels differ from the intent name.
 */
export function groupGroceryAddSuggestions(options: {
  intentName: string;
  results: FoodSearchResult[];
  correctionHint?: string | null;
}): {
  ingredients: GroceryAddSuggestion[];
  products: GroceryAddSuggestion[];
} {
  const intentNorm = options.intentName.trim().toLowerCase();
  const ingredients: GroceryAddSuggestion[] = [];
  const products: GroceryAddSuggestion[] = [];
  const seen = new Set<string>();

  for (const result of options.results) {
    const id = result.food.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = suggestionLabel(result);
    const labelNorm = label.toLowerCase();
    const did_you_mean =
      isLikelyTypoCorrection({
        intentName: options.intentName,
        label,
        correctionHint: options.correctionHint,
      }) ||
      (intentNorm.length >= 2 &&
        labelNorm !== intentNorm &&
        !labelNorm.includes(intentNorm) &&
        !intentNorm.includes(labelNorm.split(' — ').pop() ?? labelNorm));

    const suggestion: GroceryAddSuggestion = {
      group: isProductCandidate(result) ? 'product' : 'ingredient',
      food_object_id: id,
      label,
      source_label: result.source_label ?? result.source ?? null,
      did_you_mean,
    };
    if (suggestion.group === 'product') products.push(suggestion);
    else ingredients.push(suggestion);
  }

  return { ingredients, products };
}
