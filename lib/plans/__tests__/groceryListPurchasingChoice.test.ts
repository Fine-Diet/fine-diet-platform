import {
  activePurchasingMatchKeyForItem,
  resolveListShoppingDisplayName,
} from '../groceryListPurchasingChoiceDisplay';
import type { GroceryItem, GroceryListPurchasingChoice } from '../types';
import { LIST_RESOLVE_QA_CASES, isListResolveQaEnabled } from '../listPurchasingChoiceQaCases';

function item(overrides: Partial<GroceryItem> & Pick<GroceryItem, 'id' | 'name'>): GroceryItem {
  return {
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    quantity: 1,
    unit: 'cup',
    aisle_category: null,
    food_object_id: null,
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

function choice(
  overrides: Partial<GroceryListPurchasingChoice>,
): GroceryListPurchasingChoice {
  return {
    id: 'choice-1',
    grocery_list_id: 'list-1',
    grocery_item_id: 'item-1',
    person_id: 'person-1',
    match_key: 'food-spinach::cup',
    status: 'list_owner_resolved',
    food_object_id: 'food-spinach',
    shopping_display_name: 'Organic Girl — Baby Spinach',
    purchase_quantity: null,
    purchase_unit: null,
    preferred_product: null,
    aisle_category: null,
    note: null,
    required_name_snapshot: 'baby spinach',
    required_unit_snapshot: 'cup',
    source_plan_id: 'plan-a',
    source_date_range_start: '2026-07-30',
    source_date_range_end: '2026-07-30',
    applied_to_person_resolution_at: null,
    applied_to_plan_override_id: null,
    suggested_by_person_id: null,
    reviewed_at: null,
    review_note: null,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('list purchasing choice helpers', () => {
  it('prefers list choice match key over item derivation identity', () => {
    const row = item({
      id: 'item-1',
      name: 'baby spinach',
      food_object_id: null,
      unit: 'cup',
    });
    expect(activePurchasingMatchKeyForItem(row, choice({}))).toBe('food-spinach::cup');
    expect(activePurchasingMatchKeyForItem(row, null)).toBe('baby spinach::cup');
  });

  it('shows list shopping label while required name remains derivation truth', () => {
    const row = item({ id: 'item-1', name: 'baby spinach' });
    expect(resolveListShoppingDisplayName({ item: row, choice: choice({}) })).toBe(
      'Organic Girl — Baby Spinach',
    );
    expect(resolveListShoppingDisplayName({ item: row, choice: null })).toBe('baby spinach');
  });
});

describe('list resolve QA cases catalog', () => {
  it('includes the founder-requested case ids', () => {
    expect(LIST_RESOLVE_QA_CASES.map((c) => c.id)).toEqual([
      'matched',
      'typo',
      'ambiguous',
      'unresolved',
      'list_only',
      'save_to_source',
      'remember_for_future',
    ]);
  });

  it('disables QA banner in production', () => {
    const original = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true,
    });
    expect(isListResolveQaEnabled('cases')).toBe(false);
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: original,
      writable: true,
      configurable: true,
    });
  });
});
