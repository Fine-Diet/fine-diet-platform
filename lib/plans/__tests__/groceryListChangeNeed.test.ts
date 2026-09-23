import { createFakeSupabase, type Row } from './testSupabaseFake';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  changeGroceryListItemNeed,
  GroceryListValidationError,
  updateGroceryListItem,
} from '../groceryListService';

const PERSON = 'person-a';
const LIST_ID = 'list-1';
const ITEM_ID = 'item-1';

function installFake(initial: Record<string, Row[]> = {}) {
  const fake = createFakeSupabase(initial);
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => fake.from(table));
  return fake;
}

describe('changeGroceryListItemNeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects casual rename on resolved needs via updateGroceryListItem', async () => {
    installFake({
      generated_grocery_lists: [
        {
          id: LIST_ID,
          person_id: PERSON,
          title: 'Test',
          is_default: false,
          plan_id: null,
          archived_at: null,
        },
      ],
      grocery_items: [
        {
          id: ITEM_ID,
          grocery_list_id: LIST_ID,
          person_id: PERSON,
          name: 'Spinach',
          food_object_id: 'food-spinach',
          quantity: 1,
          unit: 'cup',
          notes: null,
          status: 'pending',
        },
      ],
    });

    await expect(
      updateGroceryListItem(PERSON, LIST_ID, ITEM_ID, { name: 'Kale' }),
    ).rejects.toBeInstanceOf(GroceryListValidationError);
  });

  it('updates need identity and clears list-scoped purchasing state', async () => {
    const fake = installFake({
      generated_grocery_lists: [
        {
          id: LIST_ID,
          person_id: PERSON,
          title: 'Test',
          is_default: false,
          plan_id: null,
          archived_at: null,
        },
      ],
      grocery_items: [
        {
          id: ITEM_ID,
          grocery_list_id: LIST_ID,
          person_id: PERSON,
          name: 'Spinach',
          food_object_id: 'food-spinach',
          quantity: 1,
          unit: 'cup',
          notes: null,
          status: 'pending',
        },
      ],
      food_objects: [
        { id: 'food-kale', canonical_name: 'Kale' },
      ],
      grocery_list_purchasing_choices: [
        {
          id: 'choice-1',
          grocery_list_id: LIST_ID,
          grocery_item_id: ITEM_ID,
          person_id: PERSON,
          match_key: 'food-spinach::cup',
          food_object_id: 'food-product',
          shopping_display_name: 'Brand Kale',
        },
      ],
      grocery_list_price_observations: [
        {
          id: 'price-1',
          person_id: PERSON,
          grocery_list_id: LIST_ID,
          grocery_item_id: ITEM_ID,
          match_key: 'food-spinach::cup',
          line_total: 4.99,
          currency: 'USD',
          product_title: 'Brand Kale',
          unit_price: 4.99,
          package_count: 1,
          source: 'manual',
          user_confirmed: true,
        },
      ],
    });

    const result = await changeGroceryListItemNeed(PERSON, LIST_ID, ITEM_ID, {
      food_object_id: 'food-kale',
    });

    expect(result.item.name).toBe('Kale');
    expect(result.item.food_object_id).toBe('food-kale');
    expect(result.cleared_purchasing).toBe(true);
    expect(fake.getTable('grocery_list_purchasing_choices')).toHaveLength(0);
    expect(fake.getTable('grocery_list_price_observations')).toHaveLength(0);
  });
});
