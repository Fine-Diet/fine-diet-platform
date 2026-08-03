import {
  canonicalWeekEndDate,
  validatePlanDateRange,
} from '../planDateRangeContract';

describe('validatePlanDateRange', () => {
  it('accepts a valid week range', () => {
    expect(
      validatePlanDateRange({
        start_date: '2026-07-12',
        end_date: '2026-07-18',
        plan_shape: 'week',
      }),
    ).toEqual({
      ok: true,
      start_date: '2026-07-12',
      end_date: '2026-07-18',
    });
  });

  it('rejects inverted ranges', () => {
    const result = validatePlanDateRange({
      start_date: '2026-07-18',
      end_date: '2026-07-12',
      plan_shape: 'week',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/on or after start_date/i);
    }
  });

  it('rejects malformed dates', () => {
    expect(
      validatePlanDateRange({
        start_date: '2026-13-40',
        end_date: null,
        plan_shape: 'week',
      }).ok,
    ).toBe(false);
  });

  it('requires day end_date null or equal to start', () => {
    expect(
      validatePlanDateRange({
        start_date: '2026-07-12',
        end_date: null,
        plan_shape: 'day',
      }),
    ).toMatchObject({ ok: true, end_date: null });

    expect(
      validatePlanDateRange({
        start_date: '2026-07-12',
        end_date: '2026-07-12',
        plan_shape: 'day',
      }),
    ).toMatchObject({ ok: true, end_date: '2026-07-12' });

    const bad = validatePlanDateRange({
      start_date: '2026-07-12',
      end_date: '2026-07-13',
      plan_shape: 'day',
    });
    expect(bad.ok).toBe(false);
  });

  it('allows missing week end for generation fallback', () => {
    expect(
      validatePlanDateRange({
        start_date: '2026-07-12',
        end_date: null,
        plan_shape: 'week',
        allowMissingWeekEnd: true,
      }),
    ).toMatchObject({ ok: true, end_date: null });
    expect(canonicalWeekEndDate('2026-07-12')).toBe('2026-07-18');
  });
});
