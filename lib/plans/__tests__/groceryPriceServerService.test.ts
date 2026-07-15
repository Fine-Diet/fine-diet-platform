import {
  confirmSourcedGroceryPrice,
  saveManualGroceryPrice,
} from '../groceryPriceServerService';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

jest.mock('../groceryShoppingOverrideStore', () => ({
  getShoppingOverrideByMatchKey: jest.fn().mockResolvedValue(null),
}));

jest.mock('../groceryPriceStore', () => ({
  getGroceryPriceObservationForItem: jest.fn(),
  upsertManualGroceryPriceObservation: jest.fn(),
  upsertSourcedGroceryPriceObservation: jest.fn(),
  getGroceryPriceSearchEvent: jest.fn(),
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  getGroceryPriceObservationForItem,
  getGroceryPriceSearchEvent,
  upsertManualGroceryPriceObservation,
  upsertSourcedGroceryPriceObservation,
} from '../groceryPriceStore';

const mockFrom = supabaseAdmin.from as jest.Mock;
const mockGetObservation = getGroceryPriceObservationForItem as jest.MockedFunction<
  typeof getGroceryPriceObservationForItem
>;
const mockGetSearchEvent = getGroceryPriceSearchEvent as jest.MockedFunction<
  typeof getGroceryPriceSearchEvent
>;
const mockUpsertManual = upsertManualGroceryPriceObservation as jest.MockedFunction<
  typeof upsertManualGroceryPriceObservation
>;
const mockUpsertSourced = upsertSourcedGroceryPriceObservation as jest.MockedFunction<
  typeof upsertSourcedGroceryPriceObservation
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
        upc: '085412000123',
        image_url: null,
        serving_size_text: '1 cup',
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

describe('groceryPriceServerService precedence and confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockItemScope();
  });

  it('records manual prices for owned grocery items', async () => {
    mockGetObservation.mockResolvedValue(null);
    mockUpsertManual.mockResolvedValue({
      id: 'obs-1',
      source: 'manual',
      unit_price: 4.5,
    } as never);

    await saveManualGroceryPrice({
      personId: 'person-1',
      input: {
        grocery_item_id: 'item-1',
        unit_price: 4.5,
      },
    });

    expect(mockUpsertManual).toHaveBeenCalledWith(
      expect.objectContaining({
        person_id: 'person-1',
        grocery_item_id: 'item-1',
        unit_price: 4.5,
      }),
    );
  });
});
