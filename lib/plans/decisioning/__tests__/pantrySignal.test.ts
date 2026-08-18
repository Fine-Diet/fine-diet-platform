import { pantrySignalFromSummary, pantrySignalFromViewModel } from '../pantrySignal';
import type { PantryReadinessSummary } from '@/lib/plans/types';
import type { PlansPantryReadinessViewModel } from '@/lib/plans/home/types';

function summary(
  overrides: Partial<PantryReadinessSummary> = {},
): PantryReadinessSummary {
  return {
    state: 'has_grocery',
    pantry_items_saved: 4,
    active_plan: { id: 'plan-1', title: 'Week' },
    grocery_scope: { date_start: '2026-08-16', date_end: '2026-08-22' },
    list_context: null,
    coverage: {
      rows_total: 10,
      rows_safe_match: 6,
      rows_covered_full: 4,
      rows_partial: 2,
      rows_to_buy: 4,
      rows_unresolved_identity: 0,
      rows_unit_or_amount_review: 0,
    },
    ...overrides,
  };
}

describe('pantrySignalFromSummary', () => {
  it('does not treat loading or error as weak pantry certainty', () => {
    expect(pantrySignalFromSummary('loading', null)).toEqual({ kind: 'loading' });
    expect(pantrySignalFromSummary('error', null)).toEqual({ kind: 'error' });
  });

  it('marks zero saved pantry items as inferred-weak', () => {
    expect(
      pantrySignalFromSummary(
        'ready',
        summary({ state: 'no_pantry', pantry_items_saved: 0 }),
      ),
    ).toEqual({ kind: 'weak', reason: 'no_pantry', pantryItemsSaved: 0 });
  });
});

describe('pantrySignalFromViewModel', () => {
  it('maps empty/no_list fixtures to weak without inventing populated certainty', () => {
    const empty: PlansPantryReadinessViewModel = {
      status: 'empty',
      columns: [],
      managePantryHref: '/app/food/pantry',
      groceryListId: null,
    };
    expect(pantrySignalFromViewModel(empty).kind).toBe('weak');
  });
});
