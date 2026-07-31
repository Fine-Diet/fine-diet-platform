import { describe, expect, it } from '@jest/globals';
import { deriveOnboardingState } from '../onboardingState';

describe('deriveOnboardingState', () => {
  it('treats empty metadata as not_started and must enter onboarding', () => {
    const state = deriveOnboardingState({});
    expect(state.phase).toBe('not_started');
    expect(state.mustEnterOnboarding).toBe(true);
    expect(state.mayEnterApp).toBe(false);
  });

  it('treats started/progress as in_progress', () => {
    const state = deriveOnboardingState({
      onboarding_started_at: '2026-07-31T00:00:00Z',
      onboarding_last_step: 2,
    });
    expect(state.phase).toBe('in_progress');
    expect(state.mustEnterOnboarding).toBe(true);
    expect(state.mayEnterApp).toBe(false);
  });

  it('treats skip as app-enterable and resumable, not completed', () => {
    const state = deriveOnboardingState({
      onboarding_started_at: '2026-07-31T00:00:00Z',
      onboarding_skipped_at: '2026-07-31T01:00:00Z',
    });
    expect(state.phase).toBe('skipped');
    expect(state.mustEnterOnboarding).toBe(false);
    expect(state.mayEnterApp).toBe(true);
    expect(state.showFinishSetup).toBe(true);
    expect(state.completedAt).toBeNull();
  });

  it('treats completion as terminal may-enter, even if skip also present', () => {
    const state = deriveOnboardingState({
      onboarding_completed_at: '2026-07-31T02:00:00Z',
      onboarding_skipped_at: '2026-07-31T01:00:00Z',
    });
    expect(state.phase).toBe('completed');
    expect(state.mustEnterOnboarding).toBe(false);
    expect(state.mayEnterApp).toBe(true);
    expect(state.showFinishSetup).toBe(false);
  });
});
