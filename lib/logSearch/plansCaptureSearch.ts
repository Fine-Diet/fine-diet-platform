import type {
  LogSearchBankKey,
  LogSearchFoodResult,
  LogSearchMealResult,
  LogSearchResult,
} from './types';

export type PlansCaptureSearchFilter = 'all' | 'saved_meals';

export function plansCaptureSearchBanks(
  filter: PlansCaptureSearchFilter,
): LogSearchBankKey[] {
  return filter === 'saved_meals' ? ['meals'] : ['foods', 'meals'];
}

/**
 * Plans-only presentation policy. Log search keeps its existing default order.
 */
export function rankPlansCaptureSearchResults(
  results: readonly LogSearchResult[],
  filter: PlansCaptureSearchFilter,
): Array<LogSearchMealResult | LogSearchFoodResult> {
  const meals = results.filter(
    (result): result is LogSearchMealResult =>
      result.kind === 'meal' &&
      result.badges.some((badge) => badge.kind === 'saved_meal'),
  );
  if (filter === 'saved_meals') return meals;
  const foods = results.filter(
    (result): result is LogSearchFoodResult => result.kind === 'food',
  );
  return [...meals, ...foods];
}
