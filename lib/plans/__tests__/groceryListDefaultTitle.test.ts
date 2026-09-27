import { defaultNamedGroceryListTitle } from '@/lib/plans/groceryListDefaultTitle';

describe('defaultNamedGroceryListTitle', () => {
  it('uses List — MMM D, YYYY in local semantics', () => {
    const title = defaultNamedGroceryListTitle(new Date(2026, 8, 26, 12, 0, 0));
    expect(title).toBe('List — Sep 26, 2026');
  });
});
