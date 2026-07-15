import {
  clearShoppingOverride,
  retireShoppingOverride,
  saveShoppingOverride,
} from '../groceryShoppingOverrideStore';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';

const PERSON_A = 'person-a';
const SCOPE = { planId: 'plan-1', dateStart: '2026-07-15', dateEnd: '2026-07-15' };

function sampleRow(status: 'active' | 'unmatched' | 'retired' = 'active') {
  return {
    id: 'override-1',
    person_id: PERSON_A,
    plan_id: SCOPE.planId,
    date_range_start: SCOPE.dateStart,
    date_range_end: SCOPE.dateEnd,
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
    match_status: status,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
  };
}

describe('saveShoppingOverride', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts person-scoped shopping overrides on the composite key', async () => {
    const single = jest.fn().mockResolvedValue({ data: sampleRow(), error: null });
    const upsert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single }) });
    (supabaseAdmin.from as jest.Mock).mockReturnValue({ upsert });

    const saved = await saveShoppingOverride(PERSON_A, SCOPE, {
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
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ person_id: PERSON_A, match_key: 'food-1::cup' }),
      { onConflict: 'person_id,plan_id,date_range_start,date_range_end,match_key' },
    );
    expect(saved.match_status).toBe('active');
  });
});

describe('clearShoppingOverride', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes only the caller-owned override row', async () => {
    const select = jest.fn().mockResolvedValue({ data: [{ id: 'override-1' }], error: null });
    const chain = { eq: jest.fn(), select };
    chain.eq.mockImplementation(() => chain);
    const deleteFn = jest.fn().mockReturnValue(chain);
    (supabaseAdmin.from as jest.Mock).mockReturnValue({ delete: deleteFn });

    const cleared = await clearShoppingOverride(PERSON_A, SCOPE, 'food-1::cup');
    expect(cleared).toBe(true);
    expect(deleteFn).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('person_id', PERSON_A);
    expect(chain.eq).toHaveBeenCalledWith('match_key', 'food-1::cup');
  });
});

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
