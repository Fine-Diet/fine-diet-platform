import { resolveFoodSearchShoppingSizeLabel } from '../groceryResolutionCandidateDisplay';

function candidate(overrides: {
  householdServingText?: string | null;
  servingDescription?: string | null;
  offServingText?: string | null;
}) {
  return {
    food: {
      householdServingText: overrides.householdServingText ?? null,
      servingDescription: overrides.servingDescription ?? null,
      servingSizeG: 100,
      servingUnit: 'g',
    },
    offNormalization:
      overrides.offServingText === undefined
        ? undefined
        : {
            serving_size_text: overrides.offServingText,
          },
  } as never;
}

describe('resolveFoodSearchShoppingSizeLabel', () => {
  it('shows explicit package or serving metadata already returned by food search', () => {
    expect(
      resolveFoodSearchShoppingSizeLabel(
        candidate({
          householdServingText: '16 oz',
          offServingText: '16 oz',
        }),
      ),
    ).toBe('16 oz');
  });

  it('omits size when no shopping-appropriate metadata exists', () => {
    expect(
      resolveFoodSearchShoppingSizeLabel(
        candidate({
          servingDescription: '100g',
        }),
      ),
    ).toBeNull();
  });

  it('does not promote a nutrition serving default into package presentation', () => {
    expect(
      resolveFoodSearchShoppingSizeLabel(
        candidate({
          householdServingText: null,
          servingDescription: '1 serving (100g)',
        }),
      ),
    ).toBeNull();
  });

  it('omits conflicting explicit serving metadata as ambiguous', () => {
    expect(
      resolveFoodSearchShoppingSizeLabel(
        candidate({
          householdServingText: '16 oz',
          offServingText: '32 oz',
        }),
      ),
    ).toBeNull();
  });
});
