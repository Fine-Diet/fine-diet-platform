import {
  canApplyReusableSnapshot,
  reusableApplyDisabledReason,
} from '@/lib/plans/reusableApplyGuard';

describe('reusableApplyGuard', () => {
  test('blocks apply while draft is dirty', () => {
    expect(canApplyReusableSnapshot({ dirty: true })).toBe(false);
    expect(reusableApplyDisabledReason({ dirty: true })).toMatch(/Save your changes/);
  });

  test('blocks apply while save is in progress', () => {
    expect(canApplyReusableSnapshot({ dirty: false, saveBusy: true })).toBe(false);
    expect(reusableApplyDisabledReason({ dirty: false, saveBusy: true })).toMatch(/Save in progress/);
  });

  test('allows apply when saved snapshot matches draft', () => {
    expect(canApplyReusableSnapshot({ dirty: false, saveBusy: false })).toBe(true);
    expect(reusableApplyDisabledReason({ dirty: false, saveBusy: false })).toBeNull();
  });
});
