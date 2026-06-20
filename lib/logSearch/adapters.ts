/**
 * Log Builder Search — Pure adapters
 *
 * Maps the existing food/meal shapes into the unified `LogSearchResult`
 * envelope WITHOUT mutating them:
 *
 *   - Food results keep their canonical `FoodSearchResult` verbatim; the
 *     adapter only derives the source-section badge + loggable shape and wraps
 *     it. Food result semantics are never modified.
 *   - Meals/Recipes are adapted from the canonical `MealDocument` (produced by
 *     the existing lib/meals adapters), so this layer never re-invents meal
 *     shape.
 *
 * No I/O, no DB, no network. Deterministic and side-effect free.
 */

import type { MealDocument } from '@/lib/meals/types';
import type { FoodSearchResult, SectionKey as FoodSectionKey } from '@/lib/food/types';
import { formatFoodName } from '@/lib/food/types';
import type {
  LogSearchBadge,
  LogSearchFoodResult,
  LogSearchMealResult,
  LogSearchRecentResult,
  LogSearchRecipeResult,
  RecentLoggedItem,
} from './types';

// ============================================================================
// Food source-section → badge
// ============================================================================

/**
 * Compact source badge echoing the food's repository category. This is purely
 * metadata layered on the row — it does NOT replace the section the food sits
 * in. Returns null for sections that need no badge (e.g. `my_foods` already
 * reads as the user's own, `other`).
 */
function foodSourceBadge(section: FoodSectionKey): LogSearchBadge | null {
  switch (section) {
    case 'branded':
      return { kind: 'branded', label: 'Branded' };
    case 'common':
      return { kind: 'common', label: 'Common' };
    case 'scanned':
      return { kind: 'scanned', label: 'Scanned' };
    case 'my_foods':
      return { kind: 'my_food', label: 'My Food' };
    case 'promoted_off':
    case 'off':
      return { kind: 'open_food_facts', label: 'Open Food Facts' };
    default:
      return null;
  }
}

/**
 * food (FoodSearchResult) → LogSearchFoodResult.
 *
 * `section` is the source section the food was placed in by the food search.
 * `relationshipBadges` (optional) carries cross-bank relationship badges such
 * as "Used in Meals" / "In Recipes" computed by the caller from the user's
 * library; passing them here keeps relationship metadata on the row without
 * altering food result semantics.
 */
export function foodResultToLogSearchResult(
  food: FoodSearchResult,
  section: FoodSectionKey,
  relationshipBadges: LogSearchBadge[] = [],
): LogSearchFoodResult {
  const badges: LogSearchBadge[] = [];
  const sourceBadge = foodSourceBadge(section);
  if (sourceBadge) badges.push(sourceBadge);
  for (const b of relationshipBadges) badges.push(b);

  return {
    kind: 'food',
    id: food.food.id,
    title: formatFoodName(food.food),
    sourceSection: section,
    badges,
    loggableShape: 'single_item',
    food,
  };
}

// ============================================================================
// MealDocument → meal / recipe result
// ============================================================================

/** Relationship/source badges derived purely from the MealDocument itself. */
function mealDocumentBadges(doc: MealDocument): LogSearchBadge[] {
  const badges: LogSearchBadge[] = [];

  if (doc.kind === 'recipe') {
    badges.push({ kind: 'recipe', label: 'Recipe' });
  }
  if (doc.source.source_type === 'saved_meal') {
    badges.push({ kind: 'saved_meal', label: 'Saved Meal' });
  }
  if (doc.review_state !== 'confirmed') {
    badges.push({ kind: 'needs_review', label: 'Needs Review' });
  }

  return badges;
}

/**
 * Canonical MealDocument (kind='meal') → LogSearchMealResult.
 *
 * Loggable shape: a meal with more than one component logs as a
 * `multi_item_meal`; a single-component meal logs as a `full_meal`.
 */
export function mealDocumentToMealResult(doc: MealDocument): LogSearchMealResult {
  return {
    kind: 'meal',
    id: doc.id ?? `meal_${doc.title}`,
    title: doc.title,
    sourceSection: 'meals',
    badges: mealDocumentBadges(doc),
    loggableShape: doc.components.length > 1 ? 'multi_item_meal' : 'full_meal',
    meal: doc,
  };
}

/**
 * Canonical MealDocument (kind='recipe') → LogSearchRecipeResult.
 * Recipes always log as the `recipe` shape (portion of a yield).
 */
export function mealDocumentToRecipeResult(doc: MealDocument): LogSearchRecipeResult {
  return {
    kind: 'recipe',
    id: doc.id ?? `recipe_${doc.title}`,
    title: doc.title,
    sourceSection: 'recipes',
    badges: mealDocumentBadges(doc),
    loggableShape: 'recipe',
    recipe: doc,
  };
}

// ============================================================================
// Recent logged item → recent result
// ============================================================================

/** RecentLoggedItem → LogSearchRecentResult (always a single loggable item). */
export function recentItemToLogSearchResult(item: RecentLoggedItem): LogSearchRecentResult {
  return {
    kind: 'recent_entry',
    id: item.foodObjectId,
    title: item.name,
    sourceSection: 'recent',
    badges: [{ kind: 'recently_logged', label: 'Recently Logged' }],
    loggableShape: 'single_item',
    recent: item,
  };
}
