import { interpretFoodQuery, qualifyFoodPreparation } from '../preparationInterpretation';

describe('preparation interpretation', () => {
  it('treats broccoli steamed and steamed broccoli as the same intent', () => {
    const leading = interpretFoodQuery('broccoli steamed');
    const trailing = interpretFoodQuery('steamed broccoli');
    expect(leading.retrieval).toBe('identity');
    expect(trailing.retrieval).toBe('identity');
    expect(leading.identityTokens).toEqual(['broccoli']);
    expect(trailing.identityTokens).toEqual(['broccoli']);
    expect(leading.requestedMethods).toEqual(['steamed']);
    expect(trailing.requestedMethods).toEqual(['steamed']);
  });

  it('keeps roasted on a misspelled food and does not equate methods', () => {
    const parsed = interpretFoodQuery('roasted brocoli');
    expect(parsed.identityTokens).toEqual(['brocoli']);
    expect(parsed.requestedMethods).toEqual(['roasted']);
    expect(parsed.requestedMethods).not.toContain('baked');
    expect(parsed.requestedMethods).not.toContain('boiled');
  });

  it('keeps raw, boiled, and roasted distinct', () => {
    expect(interpretFoodQuery('raw broccoli').requestedMethods).toEqual(['raw']);
    expect(interpretFoodQuery('boiled broccoli').requestedMethods).toEqual(['boiled']);
    expect(interpretFoodQuery('roasted broccoli').requestedMethods).toEqual(['roasted']);
    expect(interpretFoodQuery('sautéed broccoli').requestedMethods).toEqual(['sauteed']);
  });

  it('preserves additions and negations without a fat quantity', () => {
    const butter = interpretFoodQuery('broccoli with butter');
    expect(butter.identityTokens).toEqual(['broccoli']);
    expect(butter.additions).toEqual(['butter']);
    expect(butter.quantity).toBeNull();

    const oil = interpretFoodQuery('roasted broccoli without oil');
    expect(oil.requestedMethods).toEqual(['roasted']);
    expect(oil.exclusions).toEqual(['oil']);

    const fried = interpretFoodQuery('broccoli not fried');
    expect(fried.requestedMethods).toEqual([]);
    expect(fried.exclusions).toEqual(['fried']);
    expect(fried.identityTokens).toEqual(['broccoli']);
  });

  it('parses one cup without turning it into grams', () => {
    const parsed = interpretFoodQuery('1 cup steamed broccoli');
    expect(parsed.quantity).toEqual({ amount: 1, unit: 'cup' });
    expect(parsed.requestedMethods).toEqual(['steamed']);
    expect(parsed.identityTokens).toEqual(['broccoli']);
  });

  it('protects dish names, raw sugar, and peanut butter', () => {
    for (const query of ['chicken fried rice', 'raw sugar', 'peanut butter']) {
      const parsed = interpretFoodQuery(query);
      expect(parsed.retrieval).toBe('unchanged');
      expect(parsed.requestedMethods).toEqual([]);
      expect(parsed.additions).toEqual([]);
    }
  });

  it('leaves an ordinary query and an ambiguous double method unchanged', () => {
    expect(interpretFoodQuery('banana').retrieval).toBe('unchanged');
    expect(interpretFoodQuery('br').retrieval).toBe('unchanged');
    expect(interpretFoodQuery('steamed roasted broccoli').retrieval).toBe('unchanged');
    expect(interpretFoodQuery('steamed').retrieval).toBe('unchanged');
  });

  it('allows frozen and chopped beside one method', () => {
    const parsed = interpretFoodQuery('frozen chopped steamed broccoli');
    expect(parsed.retrieval).toBe('identity');
    expect(parsed.requestedMethods).toEqual(['steamed']);
    expect(parsed.formDescriptors).toEqual(expect.arrayContaining(['frozen', 'chopped']));
    expect(parsed.identityTokens).toEqual(['broccoli']);
  });

  it('does not call a different method or a plain record exact', () => {
    const steamed = interpretFoodQuery('steamed broccoli');
    const boiled = qualifyFoodPreparation('Broccoli, boiled', steamed);
    const plain = qualifyFoodPreparation('Broccoli', steamed);
    const cooked = qualifyFoodPreparation('Broccoli, cooked', steamed);
    const exact = qualifyFoodPreparation('Broccoli, steamed', steamed);
    expect(boiled?.status).toBe('conflicting_preparation');
    expect(boiled?.note).toBe('Requested: steamed. Listed as: boiled.');
    expect(plain?.status).toBe('unspecified_preparation');
    expect(plain?.note).toBe('Requested: steamed. Listed as: preparation unspecified.');
    expect(cooked?.status).toBe('approximate_preparation');
    expect(cooked?.note).toBe('Requested: steamed. Listed as: cooked, preparation unspecified.');
    expect(exact?.status).toBe('exact_preparation');
    expect(exact?.note).toBeNull();
  });

  it('keeps oil unknown unless the record states it', () => {
    const query = interpretFoodQuery('roasted broccoli without oil');
    const plain = qualifyFoodPreparation('Broccoli, roasted', query);
    const withOil = qualifyFoodPreparation('Broccoli, roasted, with olive oil', query);
    expect(plain?.status).toBe('exact_preparation');
    expect(plain?.note).toContain('Oil is not stated on this record.');
    expect(withOil?.status).toBe('conflicting_preparation');
    expect(withOil?.note).toBe(
      'Requested: roasted, without oil. Listed as: roasted, with olive oil.',
    );
    const butter = qualifyFoodPreparation('Broccoli', interpretFoodQuery('broccoli with butter'));
    expect(butter?.note).toBe('With butter. Amount not specified.');
  });

  it('uses a cup measure only when the record has one', () => {
    const query = interpretFoodQuery('1 cup steamed broccoli');
    const supported = qualifyFoodPreparation(
      'Broccoli, steamed',
      query,
      [{ unit: 'cup', grams: 156 }],
      91,
    );
    const unsupported = qualifyFoodPreparation('Broccoli, steamed', query, null, 91);
    expect(supported?.quantitySupported).toBe(true);
    expect(unsupported?.quantitySupported).toBe(false);
    expect(unsupported?.note).toContain('Requested amount: 1 cup.');
    expect(unsupported?.note).toContain('No cup measure on this record.');
  });
});
