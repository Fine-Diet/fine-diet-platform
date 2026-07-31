'use client';

/**
 * /app/onboarding — Pre-app onboarding journey (Package 2)
 *
 * Persistence goes through `/api/onboarding/persist` (single completion/skip
 * writer). Profile POST cannot independently complete onboarding.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { OnboardingFlowView } from '@/components/onboarding/OnboardingFlowView';
import {
  INITIAL_ANSWERS,
  type OnboardingAnswers,
} from '@/lib/onboarding/defaultOnboardingFlow';
import {
  resolveCompletedUserDestination,
  resolveOnboardingFinishDestination,
  resolveSkippedUserDestination,
} from '@/lib/onboarding/onboardingGate';
import type { OnboardingFlowConfig } from '@/lib/onboarding/onboardingFlowTypes';

function readReturnTo(query: ReturnType<typeof useRouter>['query']): string | null {
  const raw = Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo;
  return typeof raw === 'string' ? raw : null;
}

function coerceAnswers(raw: unknown): OnboardingAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return INITIAL_ANSWERS;
  return { ...INITIAL_ANSWERS, ...(raw as Partial<OnboardingAnswers>) };
}

async function persistOnboarding(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/onboarding/persist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Could not save your onboarding.');
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'leaving'>('loading');
  const [flowConfig, setFlowConfig] = useState<OnboardingFlowConfig | null>(null);
  const [initialAnswers, setInitialAnswers] = useState<OnboardingAnswers>(INITIAL_ANSWERS);
  const [initialStep, setInitialStep] = useState(0);
  const startedRef = useRef(false);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const returnTo = readReturnTo(router.query);
    (async () => {
      const [profileRes, flowRes] = await Promise.allSettled([
        fetch('/api/journal/profile', { credentials: 'include' }),
        fetch('/api/onboarding/flow', { credentials: 'include' }),
      ]);

      if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
        try {
          const data = (await profileRes.value.json()) as { profile?: Record<string, unknown> };
          const profile = data.profile ?? {};

          if (profile.onboarding_completed_at) {
            setLoadState('leaving');
            void router.replace(resolveCompletedUserDestination(returnTo));
            return;
          }

          if (profile.onboarding_skipped_at && !router.query.resume) {
            setLoadState('leaving');
            void router.replace(resolveSkippedUserDestination(returnTo));
            return;
          }

          const blob = profile.onboarding;
          if (blob && typeof blob === 'object' && !Array.isArray(blob)) {
            const answers = (blob as Record<string, unknown>).answers;
            setInitialAnswers(coerceAnswers(answers ?? blob));
          }
          if (typeof profile.onboarding_last_step === 'number') {
            setInitialStep(Math.max(0, Math.floor(profile.onboarding_last_step)));
          }
        } catch {
          // Non-fatal
        }
      }

      if (flowRes.status === 'fulfilled' && flowRes.value.ok) {
        try {
          const flow = (await flowRes.value.json()) as { config?: OnboardingFlowConfig };
          if (flow.config) setFlowConfig(flow.config);
        } catch {
          // Non-fatal
        }
      }

      setLoadState('ready');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void persistOnboarding({ mode: 'started' }).catch(() => {});
  }, []);

  const persistProgress = useCallback((answers: OnboardingAnswers, step: number) => {
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      void persistOnboarding({
        mode: 'progress',
        answers,
        lastStep: step,
      }).catch(() => {});
    }, 400);
  }, []);

  const handleFinish = useCallback(
    async (answers: OnboardingAnswers, { skipRemaining }: { skipRemaining: boolean }) => {
      await persistOnboarding({
        mode: skipRemaining ? 'skip' : 'complete',
        answers,
      });
      void router.replace(resolveOnboardingFinishDestination(readReturnTo(router.query)));
    },
    [router],
  );

  if (loadState === 'loading' || loadState === 'leaving') {
    return (
      <div className="min-h-screen bg-[#CECAB9] flex items-center justify-center">
        <p className="text-[#4F4234] text-base">Loading…</p>
      </div>
    );
  }

  return (
    <OnboardingFlowView
      flowConfig={flowConfig ?? undefined}
      initialAnswers={initialAnswers}
      initialStep={initialStep}
      onMarkStarted={markStarted}
      onFinish={handleFinish}
      onProgressChange={persistProgress}
    />
  );
}
