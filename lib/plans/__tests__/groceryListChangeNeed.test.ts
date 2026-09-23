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
import { updateGroceryListPurchasingChoiceDetails } from '../groceryListPurchasingChoiceService';

const PERSON = 'person-a';
const LIST_ID = 'list-1';
const ITEM_ID = 'item-1';

function installFake(initial: Record<string, Row[]> = {}) {
  const fake = createFakeSupabase(initial);
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => fake.from(table));
  return fake;
}

const listRow = {
  id: LIST_ID,
  person_id: PERSON,
  title: 'Test',
  is_default: false,
  plan_id: null,
  archived_at: null,
};

describe('changeGroceryListItemNeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects casual rename on resolved needs via updateGroceryListItem', async () => {
    installFake({
      generated_grocery_lists: [listRow],
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

  it('updates need identity, clears choice/active quote, and preserves price history', async () => {
    const fake = installFake({
      generated_grocery_lists: [listRow],
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
      food_objects: [{ id: 'food-kale', canonical_name: 'Kale' }],
      grocery_list_purchasing_choices: [
        {
          id: 'choice-1',
          grocery_list_id: LIST_ID,
          grocery_item_id: ITEM_ID,
          person_id: PERSON,
          status: 'list_owner_resolved',
          match_key: 'food-spinach::cup',
          food_object_id: 'food-product',
          shopping_display_name: 'Brand Kale',
          required_name_snapshot: 'Spinach',
          required_unit_snapshot: 'cup',
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
      grocery_list_item_active_quotes: [
        {
          id: 'active-1',
          person_id: PERSON,
          grocery_list_id: LIST_ID,
          grocery_item_id: ITEM_ID,
          observation_id: 'price-1',
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
    expect(fake.getTable('grocery_list_price_observations')).toHaveLength(1);
    expect(fake.getTable('grocery_list_item_active_quotes')).toHaveLength(0);
  });

  it('clears incompatible purchasing on unit change without touching quantity-only edits', async () => {
    const fake = installFake({
      generated_grocery_lists: [listRow],
      grocery_items: [
        {
          id: ITEM_ID,
          grocery_list_id: LIST_ID,
          person_id: PERSON,
          name: 'Spinach',
          food_object_id: null,
          quantity: 1,
          unit: 'cup',
          notes: null,
          status: 'pending',
        },
      ],
      grocery_list_purchasing_choices: [
        {
          id: 'choice-1',
          grocery_list_id: LIST_ID,
          grocery_item_id: ITEM_ID,
          person_id: PERSON,
          status: 'list_owner_resolved',
          match_key: 'food-product::cup',
          food_object_id: 'food-product',
          shopping_display_name: 'Brand Spinach',
          required_name_snapshot: 'Spinach',
          required_unit_snapshot: 'cup',
        },
      ],
      grocery_list_item_active_quotes: [
        {
          id: 'active-1',
          person_id: PERSON,
          grocery_list_id: LIST_ID,
          grocery_item_id: ITEM_ID,
          observation_id: 'price-1',
        },
      ],
    });

    const unitChange = await updateGroceryListItem(PERSON, LIST_ID, ITEM_ID, {
      unit: 'oz',
    });
    expect(unitChange.cleared_purchasing).toBe(true);
    expect(fake.getTable('grocery_list_purchasing_choices')).toHaveLength(0);
    expect(fake.getTable('grocery_list_item_active_quotes')).toHaveLength(0);

    fake.getTable('grocery_list_purchasing_choices').push({
      id: 'choice-2',
      grocery_list_id: LIST_ID,
      grocery_item_id: ITEM_ID,
      person_id: PERSON,
      status: 'list_owner_resolved',
      match_key: 'food-product::oz',
      food_object_id: 'food-product',
      shopping_display_name: 'Brand Spinach',
      required_name_snapshot: 'Spinach',
      required_unit_snapshot: 'oz',
    });

    const quantityChange = await updateGroceryListItem(PERSON, LIST_ID, ITEM_ID, {
      quantity: 2,
    });
    expect(quantityChange.cleared_purchasing).toBe(false);
    expect(fake.getTable('grocery_list_purchasing_choices')).toHaveLength(1);
  });

  it('persists purchase_quantity and purchase_unit on the purchasing choice', async () => {
    installFake({
      generated_grocery_lists: [listRow],
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
      grocery_list_purchasing_choices: [
        {
          id: 'choice-1',
          grocery_list_id: LIST_ID,
          grocery_item_id: ITEM_ID,
          person_id: PERSON,
          status: 'list_owner_resolved',
          match_key: 'food-product::cup',
          food_object_id: 'food-product',
          shopping_display_name: 'Brand Spinach',
          required_name_snapshot: 'Spinach',
          required_unit_snapshot: 'cup',
          purchase_quantity: null,
          purchase_unit: null,
        },
      ],
    });

    const result = await updateGroceryListPurchasingChoiceDetails({
      personId: PERSON,
      listId: LIST_ID,
      itemId: ITEM_ID,
      purchase_quantity: 2,
      purchase_unit: 'bag',
    });

    expect(result.choice.purchase_quantity).toBe(2);
    expect(result.choice.purchase_unit).toBe('bag');
  });
});
