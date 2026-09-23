import {
  formatGroceryListNeedQuantityLabel,
  GROCERY_LIST_IMPLICIT_NEED_UNIT,
  groceryListNeedUnitPlaceholder,
} from '../groceryListNeedQuantity';

describe('groceryListNeedQuantity', () => {
  it('uses implicit item label when unit is null', () => {
    expect(formatGroceryListNeedQuantityLabel(1, null)).toBe(`1 ${GROCERY_LIST_IMPLICIT_NEED_UNIT}`);
    expect(formatGroceryListNeedQuantityLabel(1, '')).toBe(`1 ${GROCERY_LIST_IMPLICIT_NEED_UNIT}`);
  });

  it('preserves explicit units', () => {
    expect(formatGroceryListNeedQuantityLabel(2, 'cup')).toBe('2 cup');
  });

  it('documents the editor placeholder', () => {
    expect(groceryListNeedUnitPlaceholder()).toContain(GROCERY_LIST_IMPLICIT_NEED_UNIT);
  });
});
