import {
  plansCaptureSearchBanks,
  rankPlansCaptureSearchResults,
} from '../plansCaptureSearch';
import type { LogSearchResult } from '../types';
import { mealDocumentToMealResult } from '../adapters';
import type { MealDocument } from '@/lib/meals/types';

const meal = {
  kind: 'meal',
  id: 'meal-1',
  title: 'Bean bowl',
  badges: [{ kind: 'saved_meal', label: 'Saved Meal' }],
} as LogSearchResult;
const food = {
  kind: 'food',
  id: 'food-1',
  title: 'Beans',
} as LogSearchResult;
const importedMeal = {
  kind: 'meal',
  id: 'import-1',
  title: 'Imported draft',
  badges: [{ kind: 'needs_review', label: 'Needs Review' }],
} as LogSearchResult;

describe('Plans capture search policy', () => {
  it('ranks matching Saved Meals ahead of generic foods without changing shared ordering', () => {
    expect(rankPlansCaptureSearchResults([food, meal], 'all')).toEqual([meal, food]);
    expect(plansCaptureSearchBanks('all')).toEqual(['foods', 'meals']);
  });

  it('excludes foods in Saved Meals mode', () => {
    expect(
      rankPlansCaptureSearchResults([food, importedMeal, meal], 'saved_meals'),
    ).toEqual([meal]);
    expect(plansCaptureSearchBanks('saved_meals')).toEqual(['meals']);
  });

  it('recognizes durable canonical MealDocuments as Saved Meals even with legacy manual source', () => {
    const canonical = mealDocumentToMealResult({
      id: 'document-1',
      kind: 'meal',
      title: 'Saved bowl',
      components: [],
      review_state: 'confirmed',
      source: { source_type: 'manual' },
    } as MealDocument);
    expect(canonical.badges).toContainEqual({ kind: 'saved_meal', label: 'Saved Meal' });
    expect(rankPlansCaptureSearchResults([food, canonical], 'all')).toEqual([
      canonical,
      food,
    ]);
  });
});
