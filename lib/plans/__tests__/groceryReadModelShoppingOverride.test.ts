import { buildGroceryItemReadModel } from '../groceryReadModel';
import type { GroceryItem, GroceryShoppingOverride, PantryOnHandItem } from '../types';

function sampleItem(): GroceryItem {
  return {
    id: 'item-1',
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    name: 'Spinach',
    quantity: 2,
    unit: 'cup',
    aisle_category: null,
    food_object_id: 'food-1',
    source_planned_meal_ids: ['meal-1'],
    status: 'pending',
    notes: null,
    created_at: '',
    updated_at: '',
  };
}

function sampleOverride(): GroceryShoppingOverride {
  return {
    id: 'override-1',
    person_id: 'person-1',
    plan_id: 'plan-1',
    date_range_start: '2026-07-15',
    date_range_end: '2026-07-15',
    match_key: 'food-1::cup',
    food_object_id: 'food-1',
    unresolved_name: null,
    unresolved_unit: null,
    shopping_display_name: 'frozen chopped spinach',
    purchase_quantity: 1,
    purchase_unit: 'bag',
    preferred_product: 'Store brand',
    aisle_category: 'Frozen',
    note: 'Buy organic if available',
    match_status: 'active',
    created_at: '',
    updated_at: '',
  };
}

describe('buildGroceryItemReadModel shopping overrides', () => {
  it('shows required and buy truths separately when customized', () => {
    const readModel = buildGroceryItemReadModel(sampleItem(), [], sampleOverride());
    expect(readModel.required.label).toBe('Required: 2 cups');
    expect(readModel.shopping.buyLabel).toBe('Buy: frozen chopped spinach · 1 bag · Store brand');
    expect(readModel.shopping.isCustomized).toBe(true);
  });

  it('continues to derive still-to-buy from required truth, not purchase packaging', () => {
    const pantry: PantryOnHandItem[] = [{
      key: 'food-1::cup',
      food_object_id: 'food-1',
      name: 'Spinach',
      quantity: 1,
      unit: 'cup',
      updated_at: '',
    }];
    const readModel = buildGroceryItemReadModel(sampleItem(), pantry, sampleOverride());
    expect(readModel.stillToBuy.label).toBe('Still to buy: 1 cup');
    expect(readModel.shopping.buyLabel).toContain('1 bag');
  });

  it('restores required-only presentation when override is cleared', () => {
    const readModel = buildGroceryItemReadModel(sampleItem(), [], null);
    expect(readModel.shopping.isCustomized).toBe(false);
    expect(readModel.shopping.buyLabel).toBeNull();
    expect(readModel.required.label).toBe('Required: 2 cups');
  });
});
