/**
 * Recipe-import missing items stay on their own path. Journal search
 * eligibility must not drop short unresolved ingredient text.
 */

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { missingItemInputsFromIngredientMatches } from '../missingItemRequestServerService';

describe('recipe import missing-item capture', () => {
  it('still enqueues short unresolved ingredient text', () => {
    const inputs = missingItemInputsFromIngredientMatches({
      personId: 'person-1',
      sourceRef: 'import-1',
      matches: [
        { raw_text: 'br', normalized_name: 'br', match_status: 'none' },
        { raw_text: 'olive oil', normalized_name: 'olive oil', match_status: 'matched' },
        { raw_text: 'chaqi', normalized_name: 'chaqi', match_status: 'guessed' },
      ],
    });

    expect(inputs.map((input) => input.rawInput)).toEqual(['br', 'chaqi']);
    expect(inputs.every((input) => input.context === 'recipe_import')).toBe(true);
    expect(inputs.every((input) => input.sourceKind === 'import')).toBe(true);
  });
});
