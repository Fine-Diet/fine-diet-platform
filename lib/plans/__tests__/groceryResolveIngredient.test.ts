process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const mockSaveShoppingOverride = jest.fn();
const mockSaveGroceryIngredientResolution = jest.fn();

jest.mock('../groceryShoppingOverrideStore', () => ({
  saveShoppingOverride: (...args: unknown[]) => mockSaveShoppingOverride(...args),
}));

jest.mock('../groceryStateStore', () => {
  const actual = jest.requireActual('../groceryStateStore');
  return {
    ...actual,
    listGroceryIngredientResolutions: jest.fn().mockResolvedValue([]),
    saveGroceryIngredientResolution: (...args: unknown[]) =>
      mockSaveGroceryIngredientResolution(...args),
  };
});

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { resolveGroceryItemIngredient } from '../groceryServerService';

const PERSON_ID = 'person-1';
const ITEM_ID = 'item-1';
const FOOD_ID = 'food-1';

function mockResolveTables() {
  const groceryItem = {
    id: ITEM_ID,
    grocery_list_id: 'list-1',
    person_id: PERSON_ID,
    name: 'baby spinach',
    quantity: 2,
    unit: 'cup',
    aisle_category: 'Produce',
    food_object_id: null,
    source_planned_meal_ids: ['meal-1'],
    status: 'pending',
    notes: null,
  };
  const groceryItemsChain = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: groceryItem, error: null }),
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { ...groceryItem, food_object_id: FOOD_ID, notes: 'resolved by user' },
              error: null,
            }),
          }),
        }),
      }),
    }),
  };
  const foodObjectsChain = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: FOOD_ID,
            canonical_name: 'Baby Spinach',
            brand_name: 'Organic Girl',
            image_url: 'https://example.com/spinach.jpg',
            upc: '123456789012',
          },
          error: null,
        }),
      }),
    }),
  };
  const groceryListsChain = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              plan_id: 'plan-1',
              date_range_start: '2026-07-15',
              date_range_end: '2026-07-15',
            },
            error: null,
          }),
        }),
      }),
    }),
  };
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'grocery_items') return groceryItemsChain;
    if (table === 'food_objects') return foodObjectsChain;
    if (table === 'generated_grocery_lists') return groceryListsChain;
    throw new Error(`Unexpected table ${table}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveGroceryIngredientResolution.mockResolvedValue(undefined);
  mockSaveShoppingOverride.mockResolvedValue({
    id: 'override-1',
    person_id: PERSON_ID,
    plan_id: 'plan-1',
    date_range_start: '2026-07-15',
    date_range_end: '2026-07-15',
    match_key: `${FOOD_ID}::cup`,
    food_object_id: FOOD_ID,
    unresolved_name: null,
    unresolved_unit: 'cup',
    shopping_display_name: 'Organic Girl — Baby Spinach',
    purchase_quantity: null,
    purchase_unit: null,
    preferred_product: null,
    aisle_category: 'Produce',
    note: null,
    match_status: 'active',
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
  });
});

describe('resolveGroceryItemIngredient', () => {
  it('grounds the row without mutating required name and seeds shopping identity', async () => {
    mockResolveTables();

    const result = await resolveGroceryItemIngredient({
      personId: PERSON_ID,
      itemId: ITEM_ID,
      foodObjectId: FOOD_ID,
    });

    expect(result.item.name).toBe('baby spinach');
    expect(result.item.food_object_id).toBe(FOOD_ID);
    expect(result.shopping_override.shopping_display_name).toBe('Organic Girl — Baby Spinach');
    expect(mockSaveShoppingOverride).toHaveBeenCalledWith(
      PERSON_ID,
      { planId: 'plan-1', dateStart: '2026-07-15', dateEnd: '2026-07-15' },
      expect.objectContaining({
        match_key: `${FOOD_ID}::cup`,
        shopping_display_name: 'Organic Girl — Baby Spinach',
      }),
    );
  });
});
