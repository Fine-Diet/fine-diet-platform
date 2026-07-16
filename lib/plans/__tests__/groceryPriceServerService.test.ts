import { saveManualGroceryPrice } from '../groceryPriceServerService';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

jest.mock('../groceryShoppingOverrideStore', () => ({
  getShoppingOverrideByMatchKey: jest.fn().mockResolvedValue(null),
}));

jest.mock('../groceryPriceStore', () => ({
  appendManualGroceryPriceObservation: jest.fn().mockResolvedValue({ id: 'obs-1', source: 'manual' }),
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { appendManualGroceryPriceObservation } from '../groceryPriceStore';

const mockFrom = supabaseAdmin.from as jest.Mock;
const mockAppendManual = appendManualGroceryPriceObservation as jest.MockedFunction<
  typeof appendManualGroceryPriceObservation
>;

const ITEM = {
  id: 'item-1',
  grocery_list_id: 'list-1',
  person_id: 'person-1',
  name: 'spinach',
  quantity: 2,
  unit: 'cup',
  aisle_category: null,
  food_object_id: 'food-1',
  source_planned_meal_ids: [],
  status: 'pending',
  notes: null,
};

function mockItemScope() {
  const groceryItemsChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: ITEM, error: null }),
  };
  const groceryListsChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: {
        plan_id: 'plan-1',
        date_range_start: '2026-07-15',
        date_range_end: '2026-07-15',
      },
      error: null,
    }),
  };
  const foodObjectsChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: {
        canonical_name: 'Baby Spinach',
        brand_name: 'Organic Girl',
        upc: null,
        image_url: null,
        serving_description: null,
      },
      error: null,
    }),
  };
  mockFrom.mockImplementation((table: string) => {
    if (table === 'grocery_items') return groceryItemsChain;
    if (table === 'generated_grocery_lists') return groceryListsChain;
    if (table === 'food_objects') return foodObjectsChain;
    throw new Error(`Unexpected table ${table}`);
  });
}

describe('groceryPriceServerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockItemScope();
  });

  it('records manual prices via append-only store path', async () => {
    await saveManualGroceryPrice({
      personId: 'person-1',
      input: {
        grocery_item_id: 'item-1',
        unit_price: 4.5,
      },
    });

    expect(mockAppendManual).toHaveBeenCalledWith(
      expect.objectContaining({
        person_id: 'person-1',
        match_key: 'food-1::cup',
        unit_price: 4.5,
      }),
    );
  });
});
