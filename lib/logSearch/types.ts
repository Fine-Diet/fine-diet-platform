/**
 * Log Builder Search — Shared result contract (types only)
 *
 * The future Log Builder (`/app/log/new`) is organized around three top-level
 * modes — Search, Library, and Capture (decision 055d967c) — and its results
 * must keep three independent concepts separate (decision 6c9dd8c2):
 *
 *   1. SOURCE SECTION       — which repository/bank a result came from
 *                             (Branded / Common / Scanned / Open Food Facts for
 *                             foods, plus the parallel Meals / Recipes / Recent
 *                             banks). This is a section, NOT a badge.
 *   2. LIBRARY RELATIONSHIP — badges/metadata layered on top of a result, e.g.
 *                             "Used in Meals", "In Recipes", "Recently Logged",
 *                             "Saved Meal", "Recipe", "Needs Review".
 *   3. LOGGABLE SHAPE       — what the result logs as: a single item, a full
 *                             meal, a multi-item meal, or a recipe.
 *
 * This module is contract-only. It introduces NO runtime behavior and does NOT
 * touch the existing `FoodSearchResult` / `FoodSearchResponse` semantics — a
 * food result is wrapped, never mutated. Meals and Recipes are PARALLEL result
 * banks (a saved meal or recipe is a different `kind` from a food item), built
 * on the canonical `MealDocument` foundation (lib/meals/types.ts).
 *
 * Source of truth: bridge packet FD-LOG-BUILDER:meals-recipes-search-banks and
 * docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md.
 */

import type { MealDocument } from '@/lib/meals/types';
import type { FoodSearchResult, SectionKey as FoodSectionKey } from '@/lib/food/types';

// ============================================================================
// Concept 1 — Result kind & source section
// ============================================================================

/**
 * The kind of thing a search result represents. A food item, a saved meal, a
 * recipe, and a recently-logged entry are all distinct result kinds — they are
 * never collapsed into one another.
 */
export type LogSearchResultKind = 'food' | 'meal' | 'recipe' | 'recent_entry';

/**
 * The source/repository section a result belongs to. Food source sections are
 * preserved verbatim from the existing food search (`my_foods`, `common`,
 * `branded`, `scanned`, `other`, `promoted_off`, `off`). Meals, Recipes, and
 * Recent are parallel banks alongside — never replacements for — the food
 * source sections.
 */
export type LogSearchSectionKey = FoodSectionKey | 'meals' | 'recipes' | 'recent';

// ============================================================================
// Concept 2 — Library relationship / source badges
// ============================================================================

/**
 * Badge kinds. These split into two intents that share one badge surface:
 *
 *   - Source badges (`branded`, `common`, `scanned`, `my_food`,
 *     `open_food_facts`) echo the food's repository category as compact
 *     metadata. They never replace the source SECTION — they annotate the row.
 *   - Relationship badges (`used_in_meals`, `in_recipes`, `recently_logged`,
 *     `saved_meal`, `recipe`, `needs_review`) describe how the result relates
 *     to the user's library and the log.
 */
export type LogSearchBadgeKind =
  // source/repository badges
  | 'branded'
  | 'common'
  | 'scanned'
  | 'my_food'
  | 'open_food_facts'
  // library-relationship badges
  | 'used_in_meals'
  | 'in_recipes'
  | 'recently_logged'
  | 'saved_meal'
  | 'recipe'
  | 'needs_review';

/** A single badge: machine kind + human label for the UI. */
export interface LogSearchBadge {
  kind: LogSearchBadgeKind;
  label: string;
}

// ============================================================================
// Concept 3 — Loggable shape
// ============================================================================

/**
 * What the result logs as when added to the journal:
 *   - 'single_item'      — one food / one recently-logged food
 *   - 'full_meal'        — an assembled meal logged as one grouped entry
 *   - 'multi_item_meal'  — a multi-component meal logged as one grouped entry
 *   - 'recipe'           — a recipe (steps/yield) logged as a portion
 */
export type LogSearchLoggableShape =
  | 'single_item'
  | 'full_meal'
  | 'multi_item_meal'
  | 'recipe';

// ============================================================================
// Recent-entry bank payload
// ============================================================================

/**
 * A recently-logged food (deduped by food object). Mirrors the shape returned
 * by `/api/journal/history` so the Recent bank reuses the existing recent-log
 * read model rather than inventing a new one.
 */
export interface RecentLoggedItem {
  foodObjectId: string;
  name: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  servingSizeG: number | null;
  servingUnit: string | null;
  measures: Array<{ unit: string; grams: number; label?: string }> | null;
  lastOccurredAt: string;
}

// ============================================================================
// LogSearchResult — discriminated union over the four banks
// ============================================================================

/**
 * Metadata common to every result, carrying the three separated concepts.
 * `payload` lives on the per-kind interfaces below so consumers narrow on
 * `kind` and get the right underlying object without casting.
 */
export interface LogSearchResultBase {
  kind: LogSearchResultKind;
  /** Stable id within the response (food id, meal/recipe id, or food object id). */
  id: string;
  /** Display title. */
  title: string;
  /** Concept 1: which source/repository section produced this result. */
  sourceSection: LogSearchSectionKey;
  /** Concept 2: relationship/source badges layered on the result. */
  badges: LogSearchBadge[];
  /** Concept 3: what this result logs as. */
  loggableShape: LogSearchLoggableShape;
}

/** A food result — wraps the existing FoodSearchResult unchanged. */
export interface LogSearchFoodResult extends LogSearchResultBase {
  kind: 'food';
  food: FoodSearchResult;
}

/** A saved/assembled meal result — canonical MealDocument (kind='meal'). */
export interface LogSearchMealResult extends LogSearchResultBase {
  kind: 'meal';
  meal: MealDocument;
}

/** A recipe result — canonical MealDocument (kind='recipe'). */
export interface LogSearchRecipeResult extends LogSearchResultBase {
  kind: 'recipe';
  recipe: MealDocument;
}

/** A recently-logged food result. */
export interface LogSearchRecentResult extends LogSearchResultBase {
  kind: 'recent_entry';
  recent: RecentLoggedItem;
}

export type LogSearchResult =
  | LogSearchFoodResult
  | LogSearchMealResult
  | LogSearchRecipeResult
  | LogSearchRecentResult;

// ============================================================================
// Sections & response envelope
// ============================================================================

/**
 * A result bank/section. Food sections preserve their server-assigned `order`;
 * Meals/Recipes/Recent are appended after the food sections in a stable order.
 */
export interface LogSearchSection {
  key: LogSearchSectionKey;
  label: string;
  /** Display order (food sections keep their native order; banks come after). */
  order: number;
  /** Dominant result kind for this section. */
  kind: LogSearchResultKind;
  /** Total candidates before any cap. */
  total: number;
  /** Items shown after cap. */
  shown: number;
  /** True when total > shown. */
  hasMore: boolean;
  items: LogSearchResult[];
}

// ============================================================================
// Capture mode — future hooks (placeholders, not implemented here)
// ============================================================================

/** Capture tools surfaced by the Log Builder Capture mode. */
export type LogCaptureToolId = 'scan_label' | 'scan_meal' | 'barcode' | 'import_recipe';

/**
 * A Capture-mode action. `available: false` marks a future hook that is not
 * implemented yet (this packet does NOT implement Scan Label / Scan Meal /
 * Barcode / Import Recipe reliability work). `endpoint` points at an existing
 * surface when one is already wired.
 */
export interface LogCaptureAction {
  id: LogCaptureToolId;
  label: string;
  available: boolean;
  endpoint: string | null;
}

/** Per-bank counts, for diagnostics and UI summaries. */
export interface LogSearchBankSummary {
  foods: { sectionCount: number; total: number };
  meals: { total: number };
  recipes: { total: number };
  recent: { total: number };
}

/** Optional diagnostics — never required by consumers. */
export interface LogSearchDebug {
  query: string;
  normalizedQuery: string;
  includedBanks: LogSearchBankKey[];
  /** Passed through from the underlying food search when requested. */
  foodDebug?: unknown;
}

/** Which banks a caller asked for (Search vs Library can scope differently). */
export type LogSearchBankKey = 'foods' | 'meals' | 'recipes' | 'recent';

/**
 * Full read-only Log Builder search response. `sections` is the canonical
 * banked view; `results` is the flattened projection in section order (mirrors
 * the food search's `results`/`sections` duality so flat consumers work too).
 */
export interface LogSearchResponse {
  query: string;
  sections: LogSearchSection[];
  results: LogSearchResult[];
  banks: LogSearchBankSummary;
  /** Future Capture-mode hooks (placeholders unless already wired). */
  captureActions: LogCaptureAction[];
  debug?: LogSearchDebug;
}
