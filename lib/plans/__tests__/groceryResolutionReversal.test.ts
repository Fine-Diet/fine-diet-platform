process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const mockSaveShoppingOverride = jest.fn();
const mockUnmatchShoppingOverride = jest.fn();
const mockSaveGroceryIngredientResolution = jest.fn();
const mockRevokeGroceryIngredientResolution = jest.fn();
const mockListGroceryIngredientResolutions = jest.fn();

jest.mock('../groceryShoppingOverrideStore', () => ({
  saveShoppingOverride: (...args: unknown[]) => mockSaveShoppingOverride(...args),
  unmatchShoppingOverrideByMatchKey: (...args: unknown[]) => mockUnmatchShoppingOverride(...args),
}));

jest.mock('../groceryStateStore', () => {
  const actual = jest.requireActual('../groceryStateStore');
  return {
    ...actual,
    listGroceryIngredientResolutions: (...args: unknown[]) =>
      mockListGroceryIngredientResolutions(...args),
    saveGroceryIngredientResolution: (...args: unknown[]) =>
      mockSaveGroceryIngredientResolution(...args),
    revokeGroceryIngredientResolution: (...args: unknown[]) =>
      mockRevokeGroceryIngredientResolution(...args),
  };
});

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  changeGroceryItemResolution,
  deriveItemsFromMeals,
  markGroceryItemUnresolved,
} from '../groceryServerService';

const PERSON_ID = 'person-1';
const ITEM_ID = 'item-1';
const OLD_FOOD_ID = 'food-1';
const NEW_FOOD_ID = 'food-2';

function groundedGroceryItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ITEM_ID,
    grocery_list_id: 'list-1',
    person_id: PERSON_ID,
    name: 'baby spinach',
    quantity: 2,
    unit: 'cup',
    aisle_category: 'Produce',
    food_object_id: OLD_FOOD_ID,
    source_planned_meal_ids: ['meal-1'],
    status: 'pending',
    notes: 'resolved by user',
    ...overrides,
  };
}

function mockResolutionTables(options?: {
  item?: Record<string, unknown>;
  food?: Record<string, unknown>;
}) {
  const groceryItem = groundedGroceryItem(options?.item);
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
            single: jest.fn().mockImplementation(async () => ({
              data: groceryItem,
              error: null,
            })),
          }),
        }),
      }),
    }),
  };

  const foodObjectsChain = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: options?.food ?? {
            id: NEW_FOOD_ID,
            canonical_name: 'Organic Spinach',
            brand_name: 'Earthbound',
            image_url: null,
            upc: null,
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

  return { groceryItemsChain, groceryItem };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListGroceryIngredientResolutions.mockResolvedValue([
    {
      key: 'baby spinach::cup',
      raw_name: 'baby spinach',
      unit: 'cup',
      food_object_id: OLD_FOOD_ID,
      canonical_name: 'Baby Spinach',
      created_at: '2026-07-15T00:00:00.000Z',
      updated_at: '2026-07-15T00:00:00.000Z',
    },
  ]);
  mockSaveGroceryIngredientResolution.mockResolvedValue(undefined);
  mockRevokeGroceryIngredientResolution.mockResolvedValue(undefined);
  mockUnmatchShoppingOverride.mockResolvedValue({
    id: 'override-old',
    match_key: `${OLD_FOOD_ID}::cup`,
    match_status: 'unmatched',
  });
  mockSaveShoppingOverride.mockResolvedValue({
    id: 'override-new',
    match_key: `${NEW_FOOD_ID}::cup`,
    shopping_display_name: 'Earthbound — Organic Spinach',
    match_status: 'active',
  });
});

describe('changeGroceryItemResolution', () => {
  it('updates learned mapping and current row without mutating required truth', async () => {
    const { groceryItemsChain, groceryItem } = mockResolutionTables();
    groceryItemsChain.update.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                ...groceryItem,
                food_object_id: NEW_FOOD_ID,
                notes: 'resolved by user',
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    const result = await changeGroceryItemResolution({
      personId: PERSON_ID,
      itemId: ITEM_ID,
      foodObjectId: NEW_FOOD_ID,
    });

    expect(result.item.name).toBe('baby spinach');
    expect(result.item.quantity).toBe(2);
    expect(result.item.unit).toBe('cup');
    expect(result.item.source_planned_meal_ids).toEqual(['meal-1']);
    expect(result.item.status).toBe('pending');
    expect(result.item.food_object_id).toBe(NEW_FOOD_ID);
    expect(result.previous_match_key).toBe(`${OLD_FOOD_ID}::cup`);
    expect(mockSaveGroceryIngredientResolution).toHaveBeenCalledWith(
      PERSON_ID,
      expect.objectContaining({
        key: 'baby spinach::cup',
        food_object_id: NEW_FOOD_ID,
      }),
    );
    expect(mockUnmatchShoppingOverride).toHaveBeenCalledWith(
      PERSON_ID,
      { planId: 'plan-1', dateStart: '2026-07-15', dateEnd: '2026-07-15' },
      `${OLD_FOOD_ID}::cup`,
    );
    expect(mockSaveShoppingOverride).toHaveBeenCalledWith(
      PERSON_ID,
      { planId: 'plan-1', dateStart: '2026-07-15', dateEnd: '2026-07-15' },
      expect.objectContaining({
        match_key: `${NEW_FOOD_ID}::cup`,
        food_object_id: NEW_FOOD_ID,
      }),
    );
  });
});

describe('markGroceryItemUnresolved', () => {
  it('revokes learned mapping and downgrades the row without mutating required truth', async () => {
    const { groceryItemsChain, groceryItem } = mockResolutionTables();
    groceryItemsChain.update.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                ...groceryItem,
                food_object_id: null,
                notes: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    const result = await markGroceryItemUnresolved({
      personId: PERSON_ID,
      itemId: ITEM_ID,
    });

    expect(result.item.name).toBe('baby spinach');
    expect(result.item.quantity).toBe(2);
    expect(result.item.unit).toBe('cup');
    expect(result.item.source_planned_meal_ids).toEqual(['meal-1']);
    expect(result.item.status).toBe('pending');
    expect(result.item.food_object_id).toBeNull();
    expect(result.item.notes).toBeNull();
    expect(mockRevokeGroceryIngredientResolution).toHaveBeenCalledWith(
      PERSON_ID,
      'baby spinach::cup',
    );
    expect(mockSaveShoppingOverride).not.toHaveBeenCalled();
    expect(result.shopping_override).toBeNull();
    expect(result.retired_override?.match_status).toBe('unmatched');
  });
});

describe('deriveItemsFromMeals regeneration persistence', () => {
  it('keeps a changed learned mapping after regeneration', () => {
    const derived = deriveItemsFromMeals(
      [
        {
          id: 'meal-1',
          plan_id: 'plan-1',
          plan_day_id: 'day-1',
          plan_slot_id: 'slot-1',
          person_id: PERSON_ID,
          name: 'Dinner',
          meal_type: 'dinner',
          payload: {
            items: [{ name: 'baby spinach', quantity: 2, unit: 'cup', food_object_id: null }],
          },
          source_template_id: null,
          source_imported_meal_id: null,
          reusable_provenance: null,
          execution_state: 'pending',
          journal_entry_id: null,
          protein_score_10: null,
          is_main_meal: false,
          psq_multiplier: 1,
          meal_derived_data: {},
          nds_confidence: 'medium',
          nds_version: '1',
          classifier_version: '1',
          created_at: '',
          updated_at: '',
        },
      ],
      [
        {
          key: 'baby spinach::cup',
          raw_name: 'baby spinach',
          unit: 'cup',
          food_object_id: NEW_FOOD_ID,
          canonical_name: 'Organic Spinach',
          created_at: '2026-07-15T00:00:00.000Z',
          updated_at: '2026-07-15T00:00:00.000Z',
        },
      ],
    );

    expect(derived[0]?.food_object_id).toBe(NEW_FOOD_ID);
    expect(derived[0]?.name).toBe('baby spinach');
  });

  it('does not reapply a revoked learned mapping after regeneration', () => {
    const derived = deriveItemsFromMeals(
      [
        {
          id: 'meal-1',
          plan_id: 'plan-1',
          plan_day_id: 'day-1',
          plan_slot_id: 'slot-1',
          person_id: PERSON_ID,
          name: 'Dinner',
          meal_type: 'dinner',
          payload: {
            items: [{ name: 'baby spinach', quantity: 2, unit: 'cup', food_object_id: null }],
          },
          source_template_id: null,
          source_imported_meal_id: null,
          reusable_provenance: null,
          execution_state: 'pending',
          journal_entry_id: null,
          protein_score_10: null,
          is_main_meal: false,
          psq_multiplier: 1,
          meal_derived_data: {},
          nds_confidence: 'medium',
          nds_version: '1',
          classifier_version: '1',
          created_at: '',
          updated_at: '',
        },
      ],
      [],
    );

    expect(derived[0]?.food_object_id).toBeNull();
    expect(derived[0]?.name).toBe('baby spinach');
  });
});
