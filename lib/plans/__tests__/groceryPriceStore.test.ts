import {
  upsertManualGroceryPriceObservation,
  upsertSourcedGroceryPriceObservation,
} from '../groceryPriceStore';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';

const mockFrom = supabaseAdmin.from as jest.Mock;

function mockExistingObservation(source: 'manual' | 'serpapi') {
  const observationsChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: { id: 'obs-1', source },
      error: null,
    }),
    single: jest.fn(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
  };
  mockFrom.mockImplementation((table: string) => {
    if (table === 'grocery_price_observations') return observationsChain;
    throw new Error(`Unexpected table ${table}`);
  });
  return observationsChain;
}

const BASE_ROW = {
  person_id: 'person-1',
  grocery_item_id: 'item-1',
  grocery_list_id: 'list-1',
  plan_id: 'plan-1',
  date_range_start: '2026-07-15',
  date_range_end: '2026-07-15',
  match_key: 'food-1::cup',
  food_object_id: 'food-1',
  retailer: 'Whole Foods Market',
  postal_code: '94110',
  product_title: 'Spinach',
  brand_name: 'Organic Girl',
  package_size: 5,
  package_unit: 'oz',
  unit_price: 3.99,
  currency: 'USD',
  package_count: 1,
  line_total: 3.99,
  product_url: null,
  image_url: null,
};

describe('groceryPriceStore precedence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not overwrite manual observations with sourced confirmation', async () => {
    const chain = mockExistingObservation('manual');
    await expect(
      upsertSourcedGroceryPriceObservation({
        ...BASE_ROW,
        provider_result_id: 'serpapi:0:spinach',
        search_event_id: 'event-1',
        match_confidence: 0.9,
      }),
    ).rejects.toThrow('manual grocery price observation');
    expect(chain.update).not.toHaveBeenCalled();
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('does not overwrite sourced observations with manual entry', async () => {
    const chain = mockExistingObservation('serpapi');
    await expect(
      upsertManualGroceryPriceObservation({
        ...BASE_ROW,
        retailer: null,
        postal_code: null,
        brand_name: null,
        package_size: null,
        package_unit: null,
      }),
    ).rejects.toThrow('sourced grocery price observation');
    expect(chain.update).not.toHaveBeenCalled();
    expect(chain.insert).not.toHaveBeenCalled();
  });
});
