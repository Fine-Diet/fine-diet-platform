import {
  PANTRY_QUICK_START_POLICY_ID,
  PANTRY_QUICK_START_POLICY_VERSION,
} from '../catalog';
import {
  acceptPantryQuickStartCategory,
  confirmHaveNowForAcceptedStaples,
  proposePantryQuickStart,
  setPantryQuickStartQuantity,
  skipPantryQuickStartCategory,
  togglePantryQuickStartItem,
  writesForAcceptedStaples,
} from '../proposalPolicy';
import type { PantryOnHandItem } from '@/lib/plans/types';

const OIL_ID = '11111111-1111-4111-8111-111111111111';
const SALT_ID = '22222222-2222-4222-8222-222222222222';

function saved(foodObjectId: string): PantryOnHandItem {
  return {
    key: `${foodObjectId}::item`,
    food_object_id: foodObjectId,
    name: 'Saved staple',
    quantity: 2,
    unit: 'item',
    updated_at: '2026-08-16T00:00:00.000Z',
  };
}

const resolved = {
  'oils.olive_oil': { id: OIL_ID, canonicalName: 'Olive oil' },
  'seasonings.salt': { id: SALT_ID, canonicalName: 'Salt' },
};

describe('proposePantryQuickStart', () => {
  it('proposes product defaults as suggestions and excludes saved pantry foods', () => {
    const proposal = proposePantryQuickStart({
      savedItems: [saved(OIL_ID)],
      resolvedFoods: resolved,
    });
    expect(proposal.policyId).toBe(PANTRY_QUICK_START_POLICY_ID);
    expect(proposal.policyVersion).toBe(PANTRY_QUICK_START_POLICY_VERSION);
    expect(proposal.source).toBe('saved_pantry');
    expect(proposal.confidence).toBe('unknown');
    expect(proposal.reasonCodes).toContain('product_default_assumption');
    expect(proposal.reasonCodes).toContain('saved_pantry_excluded');

    const oil = proposal.items.find((item) => item.stapleId === 'oils.olive_oil');
    const salt = proposal.items.find((item) => item.stapleId === 'seasonings.salt');
    expect(oil).toMatchObject({ alreadySaved: true, accepted: false, foodObjectId: OIL_ID });
    expect(salt).toMatchObject({
      alreadySaved: false,
      accepted: true,
      foodObjectId: SALT_ID,
      quantityMode: 'usually_have',
    });
    expect(proposal.reasonCodes).toContain('usually_have_not_persisted');
    expect(writesForAcceptedStaples(proposal)).toEqual([]);
  });

  it('does not accept unresolved catalog foods', () => {
    const proposal = proposePantryQuickStart({
      savedItems: [],
      resolvedFoods: { 'oils.olive_oil': null },
    });
    const oil = proposal.items.find((item) => item.stapleId === 'oils.olive_oil');
    expect(oil).toMatchObject({ resolvable: false, accepted: false, foodObjectId: null });
    expect(proposal.reasonCodes).toContain('unresolved_catalog_foods');
    expect(writesForAcceptedStaples(proposal)).toEqual([]);
  });

  it('lets users skip categories without writing habitual usually-have as pantry quantity', () => {
    let proposal = proposePantryQuickStart({
      savedItems: [],
      resolvedFoods: resolved,
    });
    proposal = skipPantryQuickStartCategory(proposal, 'oils_and_fats');
    expect(proposal.items.find((item) => item.stapleId === 'oils.olive_oil')?.accepted).toBe(false);
    expect(proposal.categories.find((category) => category.id === 'oils_and_fats')?.skipped).toBe(
      true,
    );

    proposal = acceptPantryQuickStartCategory(proposal, 'oils_and_fats');
    expect(proposal.items.find((item) => item.stapleId === 'oils.olive_oil')?.accepted).toBe(true);

    proposal = togglePantryQuickStartItem(proposal, 'seasonings.salt', false);
    expect(proposal.items.find((item) => item.stapleId === 'seasonings.salt')?.accepted).toBe(false);

    proposal = setPantryQuickStartQuantity(proposal, 'seasonings.salt', {
      quantityMode: 'tracked',
      quantity: 3,
      unit: 'tsp',
    });
    const salt = proposal.items.find((item) => item.stapleId === 'seasonings.salt');
    expect(salt).toMatchObject({ quantityMode: 'tracked', quantity: 3, unit: 'tsp' });

    proposal = setPantryQuickStartQuantity(proposal, 'seasonings.salt', {
      quantityMode: 'usually_have',
    });
    expect(proposal.items.find((item) => item.stapleId === 'seasonings.salt')).toMatchObject({
      quantityMode: 'usually_have',
      quantity: 1,
      unit: 'item',
    });
    expect(writesForAcceptedStaples(proposal)).toEqual([]);
  });

  it('writes quantity=1 item only after explicit have-now confirmation', () => {
    let proposal = proposePantryQuickStart({
      savedItems: [saved(OIL_ID)],
      resolvedFoods: resolved,
    });
    expect(writesForAcceptedStaples(proposal)).toEqual([]);

    proposal = setPantryQuickStartQuantity(proposal, 'seasonings.salt', {
      quantityMode: 'have_now',
    });
    expect(writesForAcceptedStaples(proposal)).toEqual([
      { stapleId: 'seasonings.salt', foodObjectId: SALT_ID, quantity: 1, unit: 'item' },
    ]);

    proposal = confirmHaveNowForAcceptedStaples(
      proposePantryQuickStart({
        savedItems: [saved(OIL_ID)],
        resolvedFoods: resolved,
      }),
    );
    expect(writesForAcceptedStaples(proposal).map((row) => row.foodObjectId)).toEqual([SALT_ID]);
    expect(writesForAcceptedStaples(proposal).map((row) => row.foodObjectId)).not.toContain(OIL_ID);
  });

  it('writes a tracked amount only when the user enters one, and never overwrites saved foods', () => {
    let proposal = proposePantryQuickStart({
      savedItems: [saved(OIL_ID)],
      resolvedFoods: resolved,
    });
    proposal = setPantryQuickStartQuantity(proposal, 'seasonings.salt', {
      quantityMode: 'tracked',
      quantity: 3,
      unit: 'tsp',
    });
    expect(writesForAcceptedStaples(proposal)).toEqual([
      { stapleId: 'seasonings.salt', foodObjectId: SALT_ID, quantity: 3, unit: 'tsp' },
    ]);
    expect(writesForAcceptedStaples(proposal).some((row) => row.foodObjectId === OIL_ID)).toBe(
      false,
    );
  });

  it('cannot accept an already-saved staple by toggling it back on', () => {
    let proposal = proposePantryQuickStart({
      savedItems: [saved(OIL_ID)],
      resolvedFoods: resolved,
    });
    proposal = togglePantryQuickStartItem(proposal, 'oils.olive_oil', true);
    expect(proposal.items.find((item) => item.stapleId === 'oils.olive_oil')?.accepted).toBe(false);
    expect(writesForAcceptedStaples(proposal).some((row) => row.foodObjectId === OIL_ID)).toBe(
      false,
    );
  });
});
