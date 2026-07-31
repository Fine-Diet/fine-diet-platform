import { describe, expect, it } from '@jest/globals';
import { buildProfilePatch } from '../buildProfilePatch';
import { INITIAL_ANSWERS } from '../defaultOnboardingFlow';

describe('buildProfilePatch Package 2 modes', () => {
  it('complete mode writes completion and clears skip', () => {
    const patch = buildProfilePatch(INITIAL_ANSWERS, { mode: 'complete' });
    expect(patch.onboarding_completed_at).toBeTruthy();
    expect(patch.onboarding_skipped_at).toBeNull();
    expect((patch.onboarding as { completed_at?: string }).completed_at).toBeTruthy();
  });

  it('skip mode writes skip and never completion', () => {
    const patch = buildProfilePatch(INITIAL_ANSWERS, { mode: 'skip' });
    expect(patch.onboarding_skipped_at).toBeTruthy();
    expect(patch.onboarding_completed_at).toBeUndefined();
    expect((patch.onboarding as { skipped_remaining?: boolean }).skipped_remaining).toBe(true);
  });

  it('progress mode persists answers/step without completion or skip', () => {
    const patch = buildProfilePatch(INITIAL_ANSWERS, { mode: 'progress', lastStep: 3 });
    expect(patch.onboarding_last_step).toBe(3);
    expect(patch.onboarding_completed_at).toBeUndefined();
    expect(patch.onboarding_skipped_at).toBeUndefined();
    expect((patch.onboarding as { answers?: unknown }).answers).toBeTruthy();
  });
});
