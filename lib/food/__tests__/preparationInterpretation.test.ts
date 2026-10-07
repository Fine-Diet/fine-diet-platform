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
    expect(butter?.status).toBe('unspecified_preparation');
    expect(butter?.note).toBe('Requested: with butter. Listed as: preparation unspecified.');
    expect(butter?.note).not.toContain('Amount not specified.');

    const statedButter = qualifyFoodPreparation('Broccoli with butter', interpretFoodQuery('broccoli with butter'));
    expect(statedButter?.note).toContain('Listed as: with butter.');
    expect(statedButter?.note).toContain('Amount not specified.');
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

  it('distinguishes stated absence, stated presence, and unknown ingredients', () => {
    const withoutOil = interpretFoodQuery('roasted broccoli without oil');
    const statedAbsence = qualifyFoodPreparation('Broccoli, roasted, without oil', withoutOil);
    expect(statedAbsence?.status).toBe('exact_preparation');

    const notFried = qualifyFoodPreparation('Broccoli, not fried', interpretFoodQuery('fried broccoli'));
    expect(notFried?.status).not.toBe('exact_preparation');
    expect(notFried?.status).toBe('conflicting_preparation');
    expect(notFried?.note).toContain('Listed as: not fried.');

    const cookedWithOil = qualifyFoodPreparation('Broccoli, cooked, with olive oil', withoutOil);
    expect(cookedWithOil?.status).toBe('conflicting_preparation');
    expect(cookedWithOil?.note).toContain('with olive oil');
    expect(cookedWithOil?.listedMethods).not.toContain('roasted');

    const both = interpretFoodQuery('roasted broccoli without oil and butter');
    expect(both.exclusions.join(' ')).toContain('oil');
    expect(both.exclusions.join(' ')).toContain('butter');
    const butterOnly = qualifyFoodPreparation('Broccoli, roasted, with butter', both);
    const oilOnly = qualifyFoodPreparation('Broccoli, roasted, with olive oil', both);
    const neither = qualifyFoodPreparation('Broccoli, roasted, without oil, without butter', both);
    expect(butterOnly?.status).toBe('conflicting_preparation');
    expect(oilOnly?.status).toBe('conflicting_preparation');
    expect(neither?.status).toBe('exact_preparation');
  });

  it('keeps requested constraints visible for method and ingredient states', () => {
    const rows: Array<{
      query: string;
      name: string;
      status: string;
      note: string | null;
      absent?: string;
    }> = [
      {
        query: 'roasted broccoli with butter',
        name: 'Broccoli, roasted',
        status: 'exact_preparation',
        note: 'Requested: roasted, with butter. Listed as: roasted. Butter is not stated on this record.',
        absent: 'Amount not specified.',
      },
      {
        query: 'roasted broccoli without oil and butter',
        name: 'Broccoli, roasted, without oil and butter',
        status: 'exact_preparation',
        note: null,
        absent: 'with butter',
      },
      {
        query: 'roasted broccoli without oil and butter',
        name: 'Broccoli, roasted, without oil, with butter',
        status: 'conflicting_preparation',
        note: 'Requested: roasted, without oil and butter. Listed as: roasted, without oil; with butter.',
      },
      {
        query: 'roasted broccoli without oil and butter',
        name: 'Broccoli, roasted, without oil and with butter',
        status: 'conflicting_preparation',
        note: 'Requested: roasted, without oil and butter. Listed as: roasted, without oil; with butter.',
      },
      {
        query: 'broccoli with butter',
        name: 'Broccoli, steamed, with butter',
        status: 'unspecified_preparation',
        note: 'Requested: with butter. Listed as: steamed, with butter. Amount not specified.',
      },
      {
        query: 'broccoli with butter',
        name: 'Broccoli, without butter',
        status: 'conflicting_preparation',
        note: 'Requested: with butter. Listed as: without butter.',
        absent: 'Without .',
      },
      {
        query: 'broccoli with butter',
        name: 'Broccoli',
        status: 'unspecified_preparation',
        note: 'Requested: with butter. Listed as: preparation unspecified.',
        absent: 'Amount not specified.',
      },
      {
        query: 'fried broccoli',
        name: 'Broccoli, not fried',
        status: 'conflicting_preparation',
        note: 'Requested: fried. Listed as: not fried.',
      },
    ];

    for (const row of rows) {
      const match = qualifyFoodPreparation(row.name, interpretFoodQuery(row.query));
      expect(match?.status).toBe(row.status);
      expect(match?.note).toBe(row.note);
      if (row.absent) expect(match?.note ?? '').not.toContain(row.absent);
      expect(match?.listedLabel ?? '').not.toContain('With .');
    }
  });

  it('parses decimals and fractions before punctuation is destroyed and rejects negatives', () => {
    const one = interpretFoodQuery('1 cup steamed broccoli');
    const decimal = interpretFoodQuery('1.5 cups steamed broccoli');
    const halfWord = interpretFoodQuery('0.5 cup steamed broccoli');
    const fraction = interpretFoodQuery('1/2 cup steamed broccoli');
    const negative = interpretFoodQuery('-1 cup steamed broccoli');
    expect(one.quantity).toEqual({ amount: 1, unit: 'cup' });
    expect(decimal.quantity).toEqual({ amount: 1.5, unit: 'cup' });
    expect(halfWord.quantity).toEqual({ amount: 0.5, unit: 'cup' });
    expect(fraction.quantity).toEqual({ amount: 0.5, unit: 'cup' });
    expect(negative.quantity).toBeNull();
    expect(negative.quantity?.amount).not.toBe(1);
    for (const parsed of [one, decimal, halfWord, fraction, negative]) {
      expect(parsed.identityTokens).toEqual(['broccoli']);
      expect(parsed.requestedMethods).toEqual(['steamed']);
      expect(parsed.identityTokens).not.toContain('cup');
    }
  });
});
