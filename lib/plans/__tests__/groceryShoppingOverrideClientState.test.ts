import { applyConfirmedShoppingOverride } from '../groceryShoppingOverrideClientState';

describe('applyConfirmedShoppingOverride', () => {
  it('makes confirmation hydration available to the current UI immediately', () => {
    const existing = {
      by_match_key: {},
      unmatched: [
        {
          id: 'override-1',
          match_key: 'food-1::oz',
        },
      ],
    } as never;
    const confirmed = {
      id: 'override-1',
      match_key: 'food-1::oz',
      shopping_display_name: 'Whole Foods Almond Butter',
      purchase_quantity: 28,
      purchase_unit: 'oz',
      preferred_product: 'Whole Foods Market',
    } as never;

    expect(applyConfirmedShoppingOverride(existing, confirmed)).toEqual({
      by_match_key: {
        'food-1::oz': confirmed,
      },
      unmatched: [],
    });
  });

  it('leaves current state unchanged when confirmation did not create or update an override', () => {
    const existing = { by_match_key: {}, unmatched: [] };
    expect(applyConfirmedShoppingOverride(existing, null)).toBe(existing);
  });
});
