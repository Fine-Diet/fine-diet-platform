process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const mockSaveShoppingOverride = jest.fn();
const mockClearShoppingOverride = jest.fn();
const mockListShoppingOverridesForScope = jest.fn();
const mockListShoppingOverridesOverlappingScope = jest.fn();
const mockSetShoppingOverrideMatchStatuses = jest.fn();
const mockRetireShoppingOverride = jest.fn();

jest.mock('../groceryShoppingOverrideStore', () => ({
  saveShoppingOverride: (...args: unknown[]) => mockSaveShoppingOverride(...args),
  clearShoppingOverride: (...args: unknown[]) => mockClearShoppingOverride(...args),
  listShoppingOverridesForScope: (...args: unknown[]) => mockListShoppingOverridesForScope(...args),
  listShoppingOverridesOverlappingScope: (...args: unknown[]) =>
    mockListShoppingOverridesOverlappingScope(...args),
  setShoppingOverrideMatchStatuses: (...args: unknown[]) =>
    mockSetShoppingOverrideMatchStatuses(...args),
  retireShoppingOverride: (...args: unknown[]) => mockRetireShoppingOverride(...args),
  getShoppingOverrideByMatchKey: jest.fn(),
}));

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  clearGroceryShoppingDetails,
  reconcileShoppingOverridesAfterRegeneration,
  saveGroceryShoppingDetails,
} from '../groceryShoppingOverrideService';
import type { GroceryItem, GroceryShoppingOverride } from '../types';

const PERSON_A = 'person-a';
const PERSON_B = 'person-b';
const ITEM_ID = 'item-1';
const PLAN_ID = 'plan-1';

function sampleItem(): GroceryItem {
  return {
    id: ITEM_ID,
    grocery_list_id: 'list-1',
    person_id: PERSON_A,
    name: 'Spinach',
    quantity: 2,
    unit: 'cup',
    aisle_category: 'Produce',
    food_object_id: 'food-1',
    source_planned_meal_ids: ['meal-1'],
    status: 'pending',
    notes: null,
    created_at: '',
    updated_at: '',
  };
}

function sampleOverride(status: GroceryShoppingOverride['match_status'] = 'active'): GroceryShoppingOverride {
  return {
    id: 'override-1',
    person_id: PERSON_A,
    plan_id: PLAN_ID,
    date_range_start: '2026-07-15',
    date_range_end: '2026-07-15',
    match_key: 'food-1::cup',
    food_object_id: 'food-1',
    unresolved_name: null,
    unresolved_unit: null,
    shopping_display_name: 'Frozen spinach',
    purchase_quantity: 1,
    purchase_unit: 'bag',
    preferred_product: null,
    aisle_category: null,
    note: null,
    match_status: status,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
  };
}

function mockGroceryItemLookup(personId: string, item: GroceryItem | null, list: Record<string, unknown> | null) {
  const groceryItemsChain = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: item,
            error: item ? null : { message: 'not found' },
          }),
        }),
      }),
    }),
  };
  const groceryListsChain = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: list,
            error: list ? null : { message: 'not found' },
          }),
        }),
      }),
    }),
  };
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'grocery_items') return groceryItemsChain;
    if (table === 'generated_grocery_lists') return groceryListsChain;
    throw new Error(`Unexpected table ${table}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('saveGroceryShoppingDetails', () => {
  it('persists shopping details without mutating required grocery item fields', async () => {
    const item = sampleItem();
    mockGroceryItemLookup(PERSON_A, item, {
      plan_id: PLAN_ID,
      date_range_start: '2026-07-15',
      date_range_end: '2026-07-15',
    });
    mockSaveShoppingOverride.mockResolvedValue(sampleOverride());

    await saveGroceryShoppingDetails({
      personId: PERSON_A,
      itemId: ITEM_ID,
      input: {
        shopping_display_name: 'Frozen spinach',
        purchase_quantity: 1,
        purchase_unit: 'bag',
      },
    });

    expect(mockSaveShoppingOverride).toHaveBeenCalledWith(
      PERSON_A,
      { planId: PLAN_ID, dateStart: '2026-07-15', dateEnd: '2026-07-15' },
      expect.objectContaining({
        match_key: 'food-1::cup',
        purchase_quantity: 1,
        shopping_display_name: 'Frozen spinach',
      }),
    );
    expect(item.quantity).toBe(2);
    expect(item.source_planned_meal_ids).toEqual(['meal-1']);
  });

  it('denies cross-person item access via grocery item ownership lookup', async () => {
    mockGroceryItemLookup(PERSON_B, null, null);

    await expect(
      saveGroceryShoppingDetails({
        personId: PERSON_B,
        itemId: ITEM_ID,
        input: { shopping_display_name: 'Frozen spinach' },
      }),
    ).rejects.toThrow(/not found/i);
    expect(mockSaveShoppingOverride).not.toHaveBeenCalled();
  });
});

describe('clearGroceryShoppingDetails', () => {
  it('clears only the caller-owned override for the item match key', async () => {
    mockGroceryItemLookup(PERSON_A, sampleItem(), {
      plan_id: PLAN_ID,
      date_range_start: '2026-07-15',
      date_range_end: '2026-07-15',
    });
    mockClearShoppingOverride.mockResolvedValue(true);

    const cleared = await clearGroceryShoppingDetails({ personId: PERSON_A, itemId: ITEM_ID });
    expect(cleared).toBe(true);
    expect(mockClearShoppingOverride).toHaveBeenCalledWith(
      PERSON_A,
      { planId: PLAN_ID, dateStart: '2026-07-15', dateEnd: '2026-07-15' },
      'food-1::cup',
    );
  });
});

describe('reconcileShoppingOverridesAfterRegeneration', () => {
  it('marks missing ingredients unmatched and reactivates returning ingredients', async () => {
    const activeOverride = sampleOverride('active');
    const staleActiveKale = {
      ...sampleOverride('active'),
      id: 'override-2',
      match_key: 'kale::cup',
      unresolved_name: 'kale',
    };
    mockListShoppingOverridesForScope
      .mockResolvedValueOnce([activeOverride, staleActiveKale])
      .mockResolvedValueOnce([
        activeOverride,
        { ...staleActiveKale, match_status: 'unmatched' as const },
      ]);
    mockSetShoppingOverrideMatchStatuses.mockResolvedValue(undefined);

    const bundle = await reconcileShoppingOverridesAfterRegeneration(
      PERSON_A,
      { planId: PLAN_ID, dateStart: '2026-07-15', dateEnd: '2026-07-15' },
      [{ food_object_id: 'food-1', name: 'Spinach', unit: 'cup' }],
    );

    expect(mockSetShoppingOverrideMatchStatuses).toHaveBeenCalledWith(
      PERSON_A,
      { planId: PLAN_ID, dateStart: '2026-07-15', dateEnd: '2026-07-15' },
      [{ match_key: 'kale::cup', match_status: 'unmatched' }],
    );
    expect(bundle.by_match_key['food-1::cup']).toBeTruthy();
    expect(bundle.unmatched.some((row) => row.match_key === 'kale::cup')).toBe(true);
  });
});
