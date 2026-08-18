import {
  canonicalCreateMealReturnTo,
  isSafeAppReturnPath,
  PLAN_TODAY_RETURN_PATH,
  PLAN_WEEK_RETURN_PATH,
} from '../returnPath';

describe('create-meal returnTo allowlist', () => {
  it('allows only exact Plan Today and Plan Week paths', () => {
    expect(PLAN_TODAY_RETURN_PATH).toBe('/app/plans/today');
    expect(PLAN_WEEK_RETURN_PATH).toBe('/app/plans/week');
    expect(canonicalCreateMealReturnTo('/app/plans/week')).toBe('/app/plans/week');
    expect(canonicalCreateMealReturnTo('/app/plans/today')).toBe('/app/plans/today');
    expect(canonicalCreateMealReturnTo('/app/plans/week?action=generate')).toBeNull();
    expect(canonicalCreateMealReturnTo('/app/settings')).toBeNull();
    expect(isSafeAppReturnPath('https://evil.example')).toBe(false);
  });
});
