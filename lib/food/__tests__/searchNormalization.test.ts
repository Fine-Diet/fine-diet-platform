import {
  countTokenGroupMatches,
  matchesBrandGroup,
  normalizeSearchQuery,
} from '../searchNormalization';

describe('searchNormalization word-prefix matching', () => {
  it('does not match short tokens inside unrelated words', () => {
    const { tokenGroups } = normalizeSearchQuery('tim tam');
    const result = countTokenGroupMatches(
      'Vitamin B6, Mozzarella Cheese, Low-Moisture, Part-Skim',
      tokenGroups
    );

    expect(result.matchCount).toBe(0);
    expect(result.brandGroupHits).toBe(0);
  });

  it('does not treat short generic tokens as prefixes of larger words', () => {
    const { tokenGroups } = normalizeSearchQuery('tim tam');
    const result = countTokenGroupMatches(
      'Tamale Pie NO TIME 2 COOK!',
      tokenGroups
    );

    expect(result.matchCount).toBe(0);
    expect(result.matchedVariants).toEqual([]);
  });

  it('still allows prefix matches at the start of a word', () => {
    const { tokenGroups } = normalizeSearchQuery('chob greek yogurt');
    const result = countTokenGroupMatches(
      'Greek Yogurt, Chobani Plain Non-Fat',
      tokenGroups
    );

    expect(result.matchCount).toBe(3);
    expect(result.matchedVariants).toEqual(
      expect.arrayContaining(['chob', 'greek', 'yogurt'])
    );
  });

  it('applies the same word-prefix rule to brand gating', () => {
    expect(matchesBrandGroup('Tim Tam Cookies', "Arnott's", ['tim'])).toBe(true);
    expect(matchesBrandGroup('Vitamin B6 Cheese', null, ['tim'])).toBe(false);
  });
});
