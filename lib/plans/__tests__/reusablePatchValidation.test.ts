import { normalizeTemplatePatchBody } from '@/lib/plans/reusablePatchValidation';

describe('normalizeTemplatePatchBody', () => {
  test('accepts valid patch fields only', () => {
    expect(
      normalizeTemplatePatchBody({
        name: 'Weekday lunch',
        slots: [],
        unassigned_meals: [],
        extra: 'ignored',
      }),
    ).toEqual({
      name: 'Weekday lunch',
      slots: [],
      unassigned_meals: [],
    });
  });

  test('ignores malformed field types', () => {
    expect(
      normalizeTemplatePatchBody({
        name: 123,
        slots: 'bad',
        unassigned_meals: null,
      }),
    ).toEqual({});
  });
});
