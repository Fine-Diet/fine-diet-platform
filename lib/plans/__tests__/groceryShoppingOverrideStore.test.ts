import { retireShoppingOverride } from '../groceryShoppingOverrideStore';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';

describe('retireShoppingOverride', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects retiring active overrides', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'override-1',
        person_id: 'person-1',
        plan_id: 'plan-1',
        date_range_start: '2026-07-15',
        date_range_end: '2026-07-15',
        match_key: 'food-1::cup',
        food_object_id: 'food-1',
        unresolved_name: null,
        unresolved_unit: null,
        shopping_display_name: 'Bag spinach',
        purchase_quantity: 1,
        purchase_unit: 'bag',
        preferred_product: null,
        aisle_category: null,
        note: null,
        match_status: 'active',
        created_at: '2026-07-15T00:00:00.000Z',
        updated_at: '2026-07-15T00:00:00.000Z',
      },
      error: null,
    });
    const select = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ maybeSingle }),
      }),
    });
    (supabaseAdmin.from as jest.Mock).mockReturnValue({ select });

    await expect(retireShoppingOverride('person-1', 'override-1')).rejects.toThrow(
      /Only unmatched shopping overrides can be retired/i,
    );
  });
});
