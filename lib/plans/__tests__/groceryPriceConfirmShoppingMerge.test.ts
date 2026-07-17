import { applyOfferPackageToShoppingDetails } from '../groceryPriceConfirmShoppingMerge';

jest.mock('../groceryShoppingOverrideStore', () => ({
  getShoppingOverrideByMatchKey: jest.fn(),
  saveShoppingOverride: jest.fn(),
}));

import {
  getShoppingOverrideByMatchKey,
  saveShoppingOverride,
} from '../groceryShoppingOverrideStore';

const mockGetOverride = getShoppingOverrideByMatchKey as jest.MockedFunction<
  typeof getShoppingOverrideByMatchKey
>;
const mockSaveOverride = saveShoppingOverride as jest.MockedFunction<typeof saveShoppingOverride>;

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
  status: 'pending' as const,
  notes: null,
};

const SCOPE = { planId: 'plan-1', dateStart: '2026-07-15', dateEnd: '2026-07-15' };

describe('applyOfferPackageToShoppingDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates shopping package fields from offer when override is missing', async () => {
    mockGetOverride.mockResolvedValue(null);
    mockSaveOverride.mockResolvedValue({
      id: 'override-1',
      purchase_quantity: 5,
      purchase_unit: 'oz',
    } as never);

    await applyOfferPackageToShoppingDetails({
      personId: 'person-1',
      item: ITEM,
      scope: SCOPE,
      offer: { package_size: 5, package_unit: 'oz' },
    });

    expect(mockSaveOverride).toHaveBeenCalledWith(
      'person-1',
      SCOPE,
      expect.objectContaining({
        match_key: 'food-1::cup',
        purchase_quantity: 5,
        purchase_unit: 'oz',
      }),
    );
  });

  it('preserves existing shopping details when package fields are already set', async () => {
    mockGetOverride.mockResolvedValue({
      id: 'override-1',
      match_key: 'food-1::cup',
      shopping_display_name: 'Baby Spinach',
      purchase_quantity: 2,
      purchase_unit: 'bag',
      preferred_product: 'Organic Girl',
      note: 'Keep cold',
    } as never);

    const saved = await applyOfferPackageToShoppingDetails({
      personId: 'person-1',
      item: ITEM,
      scope: SCOPE,
      offer: { package_size: 5, package_unit: 'oz' },
    });

    expect(mockSaveOverride).not.toHaveBeenCalled();
    expect(saved?.purchase_quantity).toBe(2);
    expect(saved?.purchase_unit).toBe('bag');
  });

  it('fills only empty package fields on an existing override', async () => {
    mockGetOverride.mockResolvedValue({
      id: 'override-1',
      match_key: 'food-1::cup',
      shopping_display_name: 'Baby Spinach',
      purchase_quantity: null,
      purchase_unit: 'bag',
      preferred_product: 'Organic Girl',
      note: null,
    } as never);
    mockSaveOverride.mockResolvedValue({
      id: 'override-1',
      purchase_quantity: 5,
      purchase_unit: 'bag',
    } as never);

    await applyOfferPackageToShoppingDetails({
      personId: 'person-1',
      item: ITEM,
      scope: SCOPE,
      offer: { package_size: 5, package_unit: 'oz' },
    });

    expect(mockSaveOverride).toHaveBeenCalledWith(
      'person-1',
      SCOPE,
      expect.objectContaining({
        shopping_display_name: 'Baby Spinach',
        preferred_product: 'Organic Girl',
        purchase_quantity: 5,
        purchase_unit: 'bag',
      }),
    );
  });
});
