import {
  assertPlannedMealDateBinding,
  plannedMealMatchesRequestedDate,
} from '../plannedMealDateBinding';

describe('plannedMealDateBinding', () => {
  it('accepts when requested date matches the meal plan day', () => {
    expect(() =>
      assertPlannedMealDateBinding('2026-07-14', '2026-07-14'),
    ).not.toThrow();
    expect(plannedMealMatchesRequestedDate('2026-07-14', '2026-07-14')).toBe(true);
  });

  it('accepts when no requested date is supplied', () => {
    expect(() => assertPlannedMealDateBinding('2026-07-14', undefined)).not.toThrow();
    expect(plannedMealMatchesRequestedDate('2026-07-14', undefined)).toBe(true);
  });

  it('rejects a valid owned meal id paired with the wrong date', () => {
    expect(() =>
      assertPlannedMealDateBinding('2026-07-14', '2026-07-15'),
    ).toThrow(/not found for this date/i);
    expect(plannedMealMatchesRequestedDate('2026-07-14', '2026-07-15')).toBe(false);
  });
});
