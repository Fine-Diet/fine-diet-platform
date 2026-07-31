/**
 * Package 2 — single onboarding lifecycle derivation.
 *
 * Canonical metadata fields (people.metadata):
 *   - onboarding_started_at
 *   - onboarding_last_step
 *   - onboarding_skipped_at
 *   - onboarding_completed_at
 *   - optional onboarding_restarted_at
 *   - onboarding (progress/answers blob)
 *
 * Completion and skip are distinct. Skip permits app entry and later resume.
 * Profile edits must never write completion.
 */

export type OnboardingPhase = 'not_started' | 'in_progress' | 'skipped' | 'completed';

export interface OnboardingLifecycleState {
  phase: OnboardingPhase;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  restartedAt: string | null;
  lastStep: number | null;
  /** True when middleware must send the user into /app/onboarding. */
  mustEnterOnboarding: boolean;
  /** True when the user may enter normal app routes. */
  mayEnterApp: boolean;
  /** True when Finish Setup should be offered (skipped, not completed). */
  showFinishSetup: boolean;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStep(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

export function deriveOnboardingState(
  metadata: Record<string, unknown> | null | undefined,
): OnboardingLifecycleState {
  const md = metadata ?? {};
  const completedAt = asNonEmptyString(md.onboarding_completed_at);
  const skippedAt = asNonEmptyString(md.onboarding_skipped_at);
  const startedAt = asNonEmptyString(md.onboarding_started_at);
  const restartedAt = asNonEmptyString(md.onboarding_restarted_at);
  const lastStep = asStep(md.onboarding_last_step);

  // Completion wins if both somehow exist (should not be written that way).
  if (completedAt) {
    return {
      phase: 'completed',
      startedAt,
      completedAt,
      skippedAt,
      restartedAt,
      lastStep,
      mustEnterOnboarding: false,
      mayEnterApp: true,
      showFinishSetup: false,
    };
  }

  if (skippedAt) {
    return {
      phase: 'skipped',
      startedAt,
      completedAt: null,
      skippedAt,
      restartedAt,
      lastStep,
      mustEnterOnboarding: false,
      mayEnterApp: true,
      showFinishSetup: true,
    };
  }

  if (startedAt || lastStep !== null) {
    return {
      phase: 'in_progress',
      startedAt,
      completedAt: null,
      skippedAt: null,
      restartedAt,
      lastStep,
      mustEnterOnboarding: true,
      mayEnterApp: false,
      showFinishSetup: false,
    };
  }

  return {
    phase: 'not_started',
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    restartedAt,
    lastStep: null,
    mustEnterOnboarding: true,
    mayEnterApp: false,
    showFinishSetup: false,
  };
}

/** @deprecated Prefer deriveOnboardingState(...).phase === 'completed' */
export function isOnboardingCompleteFlag(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return deriveOnboardingState(metadata).phase === 'completed';
}

export function readOnboardingProgressAnswers(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const blob = metadata?.onboarding;
  if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return null;
  const answers = (blob as Record<string, unknown>).answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null;
  return answers as Record<string, unknown>;
}
