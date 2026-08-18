import { pantrySignalFromSummary, pantrySignalFromViewModel } from '../pantrySignal';
import type { PantryReadinessSummary } from '@/lib/plans/types';
import type { PlansPantryReadinessViewModel } from '@/lib/plans/home/types';

function summary(
  overrides: Partial<PantryReadinessSummary> = {},
): PantryReadinessSummary {
  return {
    state: 'has_grocery',
    pantry_presence: (overrides.pantry_items_saved ?? 4) > 0 ? 'present' : 'empty',
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
        summary({ state: 'no_pantry', pantry_presence: 'empty', pantry_items_saved: 0 }),
      ),
    ).toEqual({ kind: 'weak', reason: 'no_pantry', pantryItemsSaved: 0 });
  });

  it('does not treat missing grocery list as pantry weakness when pantry items exist', () => {
    expect(
      pantrySignalFromSummary(
        'ready',
        summary({ state: 'no_grocery_list', pantry_presence: 'present', pantry_items_saved: 3 }),
      ),
    ).toEqual({ kind: 'ok', pantryItemsSaved: 3 });
  });

  it('treats a ready summary without payload as error, not empty pantry', () => {
    expect(pantrySignalFromSummary('ready', null)).toEqual({ kind: 'error' });
  });
});

describe('pantrySignalFromViewModel', () => {
  it('maps empty fixtures to weak without inventing populated certainty', () => {
    const empty: PlansPantryReadinessViewModel = {
      status: 'empty',
      columns: [],
      managePantryHref: '/app/food/pantry',
      groceryListId: null,
    };
    expect(pantrySignalFromViewModel(empty).kind).toBe('weak');
  });

  it('does not treat grocery-list absence as confident no_pantry', () => {
    const noList: PlansPantryReadinessViewModel = {
      status: 'no_list',
      columns: [],
      managePantryHref: '/app/food/pantry',
      groceryListId: null,
    };
    expect(pantrySignalFromViewModel(noList).kind).toBe('ok');
  });
});
