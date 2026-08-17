import fs from 'fs';
import path from 'path';
import { buildGroceryItemReadModel } from '@/lib/plans/groceryReadModel';
import type { GroceryItem, PantryOnHandItem } from '@/lib/plans/types';

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

describe('plan grocery handoff pantry deduction hold', () => {
  it('deducts only on saved pantry identity + unit matches and keeps required amounts primary', () => {
    const deducted = buildGroceryItemReadModel(item(), [pantry()]);
    expect(deducted.required.label).toBe('Required: 2 cups');
    expect(deducted.stillToBuy.state).toBe('safe');
    expect(deducted.stillToBuy.label).toBe('Still to buy: 1 cup');
  });

  it('does not treat missing pantry as confirmed zero or fabricated availability', () => {
    const missing = buildGroceryItemReadModel(item(), []);
    expect(missing.onHand).toBeNull();
    expect(missing.stillToBuy.state).toBe('none');
    expect(missing.required.label).toBe('Required: 2 cups');
  });

  it('does not deduct unresolved rows or unit mismatches', () => {
    const unresolved = buildGroceryItemReadModel(item({ food_object_id: null }), [pantry()]);
    expect(unresolved.stillToBuy.state).toBe('unsafe');
    expect(unresolved.stillToBuy.note).toMatch(/resolve ingredient before pantry deduction/i);

    const otherUnit = buildGroceryItemReadModel(item(), [pantry({ unit: 'g', key: 'food-oats::g' })]);
    expect(otherUnit.onHand).toBeNull();
    expect(otherUnit.stillToBuy.state).toBe('none');
    expect(otherUnit.required.label).toBe('Required: 2 cups');

    const mismatch = buildGroceryItemReadModel(item(), [pantry({ unit: 'g', key: 'food-oats::cup' })]);
    expect(mismatch.stillToBuy.state).toBe('unsafe');
    expect(mismatch.stillToBuy.note).toMatch(/unit does not safely match/i);
  });

  it('does not let Packet 5 habitual usually-have assumptions enter grocery deduction', () => {
    const groceryReadModel = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/groceryReadModel.ts'),
      'utf8',
    );
    const generate = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/groceryServerService.ts'),
      'utf8',
    );
    const handoff = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/planGroceryHandoff/policy.ts'),
      'utf8',
    );
    const quickStart = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/pantryQuickStart/proposalPolicy.ts'),
      'utf8',
    );
    expect(groceryReadModel).not.toContain('usually_have');
    expect(generate).not.toContain('usually_have');
    expect(handoff).not.toContain('usually_have');
    expect(quickStart).toContain('usually_have_not_persisted');
    expect(quickStart).toContain('not deductable Pantry');
  });
});
