import {
  buildInstantiateAppendBody,
  resolveAppendConfirmDecision,
} from '@/lib/plans/reusableAppendConfirm';

describe('reusableAppendConfirm', () => {
  test('empty target proceeds without allow_duplicate_append', () => {
    expect(resolveAppendConfirmDecision(false, false)).toEqual({ shouldProceed: true });
    expect(
      buildInstantiateAppendBody({ plan_id: 'p1', target_plan_day_id: 'd1' }, {
        shouldProceed: true,
      }),
    ).toEqual({ plan_id: 'p1', target_plan_day_id: 'd1' });
  });

  test('populated target without confirmation is rejected', () => {
    expect(resolveAppendConfirmDecision(true, false)).toEqual({ shouldProceed: false });
  });

  test('populated target with confirmation sends allow_duplicate_append only then', () => {
    const decision = resolveAppendConfirmDecision(true, true);
    expect(decision).toEqual({ shouldProceed: true, allowDuplicateAppend: true });
    expect(
      buildInstantiateAppendBody({ plan_id: 'p1', target_plan_day_id: 'd1' }, decision),
    ).toEqual({
      plan_id: 'p1',
      target_plan_day_id: 'd1',
      allow_duplicate_append: true,
    });
  });

  test('second apply on now-populated day requires fresh confirmation flag', () => {
    const first = resolveAppendConfirmDecision(false, false);
    expect(first.shouldProceed).toBe(true);
    expect(first.allowDuplicateAppend).toBeUndefined();

    const secondWithoutConfirm = resolveAppendConfirmDecision(true, false);
    expect(secondWithoutConfirm.shouldProceed).toBe(false);

    const secondWithConfirm = resolveAppendConfirmDecision(true, true);
    expect(secondWithConfirm.allowDuplicateAppend).toBe(true);
  });
});
