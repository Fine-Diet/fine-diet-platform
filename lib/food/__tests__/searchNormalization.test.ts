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

  it('keeps brand-token matching invariant when the brand appears first or last in the query', () => {
    const combinedText = 'Breakfast Time Chicken Mini Links Amylu Foods LLC';
    const first = countTokenGroupMatches(
      combinedText,
      normalizeSearchQuery('Amylu Breakfast Time Chicken Mini Links').tokenGroups
    );
    const last = countTokenGroupMatches(
      combinedText,
      normalizeSearchQuery('Breakfast Time Chicken Mini Links Amylu').tokenGroups
    );

    expect(first.matchCount).toBe(last.matchCount);
    expect(first.brandGroupHits).toBe(last.brandGroupHits);
    expect(first.matchCount).toBe(6);
    expect(first.brandGroupHits).toBe(1);
  });

  it('does not treat generic product descriptors as brand-like Amylu gates', () => {
    const { tokenGroups } = normalizeSearchQuery('Amylu Breakfast Time Chicken Mini Links');
    const brandLikeTokens = tokenGroups
      .filter((group) => group.isBrandLike)
      .map((group) => group.canonical);

    expect(brandLikeTokens).toEqual(['amylu']);
  });
});
