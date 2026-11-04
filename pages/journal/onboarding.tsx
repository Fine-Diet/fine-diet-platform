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
  OnboardingPersistenceCoordinator,
  persistOnboarding,
} from '@/lib/onboarding/onboardingPersistence';
import {
  resolveCompletedUserDestination,
  resolveOnboardingFinishDestination,
  resolveSkippedUserDestination,
} from '@/lib/onboarding/onboardingGate';
import { replaceOnboardingRoute } from '@/lib/onboarding/onboardingNavigation';
import type { OnboardingFlowConfig } from '@/lib/onboarding/onboardingFlowTypes';

function readReturnTo(query: ReturnType<typeof useRouter>['query']): string | null {
  const raw = Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo;
  return typeof raw === 'string' ? raw : null;
}

function coerceAnswers(raw: unknown): OnboardingAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return INITIAL_ANSWERS;
  return { ...INITIAL_ANSWERS, ...(raw as Partial<OnboardingAnswers>) };
}

export default function OnboardingPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'leaving'>('loading');
  const [flowConfig, setFlowConfig] = useState<OnboardingFlowConfig | null>(null);
  const [initialAnswers, setInitialAnswers] = useState<OnboardingAnswers>(INITIAL_ANSWERS);
  const [initialStep, setInitialStep] = useState(0);
  const startedRef = useRef(false);
  const persistenceRef = useRef<OnboardingPersistenceCoordinator | null>(null);
  if (!persistenceRef.current) {
    persistenceRef.current = new OnboardingPersistenceCoordinator(persistOnboarding);
  }
  const persistence = persistenceRef.current;

  useEffect(() => () => persistence.cancelPendingProgress(), [persistence]);

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
    persistence.markStarted();
  }, [persistence]);

  const persistProgress = useCallback((answers: OnboardingAnswers, step: number) => {
    persistence.scheduleProgress(answers, step);
  }, [persistence]);

  const handleFinish = useCallback(
    async (answers: OnboardingAnswers, { skipRemaining }: { skipRemaining: boolean }) => {
      await persistence.finalize({
        mode: skipRemaining ? 'skip' : 'complete',
        answers,
      });
      await replaceOnboardingRoute(
        (destination) => router.replace(destination),
        resolveOnboardingFinishDestination(readReturnTo(router.query)),
      );
    },
    [persistence, router],
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
