import {
  groundedGroceryMatchKey,
  groceryItemMatchKey,
  normalizeGroceryUnit,
  unresolvedGroceryMatchKey,
} from '../groceryMatchKeys';

describe('groceryMatchKeys', () => {
  it('normalizes common unit aliases', () => {
    expect(normalizeGroceryUnit('cups')).toBe('cup');
    expect(normalizeGroceryUnit('Tablespoons')).toBe('tbsp');
  });

  it('builds grounded match keys from food identity and unit', () => {
    expect(groundedGroceryMatchKey('food-1', 'cups')).toBe('food-1::cup');
  });

  it('builds unresolved match keys from exact normalized name and unit', () => {
    expect(unresolvedGroceryMatchKey('Spinach', 'cup')).toBe('spinach::cup');
  });

  it('does not fuzzy-match similar unresolved names', () => {
    const spinach = unresolvedGroceryMatchKey('spinach', 'cup');
    const babySpinach = unresolvedGroceryMatchKey('baby spinach', 'cup');
    expect(spinach).not.toBe(babySpinach);
  });

  it('selects grounded key when food_object_id is present', () => {
    expect(
      groceryItemMatchKey({
        food_object_id: 'food-1',
        name: 'Spinach',
        unit: 'cup',
      }),
    ).toBe('food-1::cup');
  });
});
