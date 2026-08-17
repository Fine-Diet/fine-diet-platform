import fs from 'fs';
import path from 'path';
import { buildGroceryItemReadModel } from '@/lib/plans/groceryReadModel';
import { evaluateGroceryListReadiness } from '../policy';
import type { GroceryItem, PantryOnHandItem } from '@/lib/plans/types';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id: 'item-1',
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    name: 'Oats',
    quantity: 2,
    unit: 'cup',
    aisle_category: null,
    food_object_id: 'food-oats',
    source_planned_meal_ids: ['meal-1'],
    status: 'pending',
    notes: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function pantry(overrides: Partial<PantryOnHandItem> = {}): PantryOnHandItem {
  return {
    key: 'food-oats::cup',
    food_object_id: 'food-oats',
    name: 'Oats',
    quantity: 1,
    unit: 'cup',
    updated_at: '',
    ...overrides,
  };
}

describe('grocery list readiness pantry deduction hold', () => {
  it('treats pantry as presentation only and does not auto-mark have', () => {
    const deducted = buildGroceryItemReadModel(item(), [pantry()]);
    expect(deducted.stillToBuy.state).toBe('safe');
    expect(deducted.stillToBuy.label).toBe('Still to buy: 1 cup');
    expect(item().status).toBe('pending');

    const covered = buildGroceryItemReadModel(item({ quantity: 1 }), [pantry()]);
    expect(covered.stillToBuy.label).toBe('Still to buy: covered by pantry');
    const decision = evaluateGroceryListReadiness({
      items: [item({ quantity: 1, status: 'pending' })],
    });
    expect(decision.state).toBe('ready_to_shop');
    expect(decision.counts.have).toBe(0);
    expect(decision.reasonCodes).toContain('pantry_presentation_only');
  });

  it('does not treat missing pantry as zero on hand', () => {
    const missing = buildGroceryItemReadModel(item(), []);
    expect(missing.onHand).toBeNull();
    expect(missing.stillToBuy.state).toBe('none');
    expect(missing.required.label).toBe('Required: 2 cups');
  });

  it('does not deduct usually_have assumptions', () => {
    const groceryReadModel = read('lib/plans/groceryReadModel.ts');
    const readiness = read('lib/plans/groceryListReadiness/policy.ts');
    const listPage = read('pages/app/food/groceries/[listId].tsx');
    const quickStart = read('lib/plans/pantryQuickStart/proposalPolicy.ts');
    expect(groceryReadModel).not.toContain('usually_have');
    expect(readiness).not.toContain('usually_have');
    expect(listPage).not.toContain('usually_have');
    expect(quickStart).toContain('usually_have_not_persisted');
    expect(quickStart).toContain('not deductable Pantry');
  });
});
