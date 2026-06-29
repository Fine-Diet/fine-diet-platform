'use client';

/**
 * /app/onboarding — Pre-app onboarding journey (Packet D)
 *
 * Collects foundational baseline data (intent, body, eating pattern,
 * preferences/constraints, planning/grocery) and persists it through the
 * existing guarded profile API (`POST /api/journal/profile`) into
 * `people.metadata`. The visual flow lives in
 * `components/onboarding/OnboardingFlowView.tsx`; option sets, step titles,
 * and the default answer shape live in `lib/onboarding/defaultOnboardingFlow.ts`;
 * the profile patch mapping lives in `lib/onboarding/buildProfilePatch.ts`.
 *
 * This route intentionally does NOT touch the assessment scoring backend
 * (`/api/assessments/*`, `calculateScoring`, submissions). Onboarding answers
 * are foundational profile/schedule/preference data, not a scored assessment.
 *
 * Persistence:
 *   - Canonical metadata fields that the rest of the app already reads are
 *     written directly (date_of_birth, sex, height_cm, weight_kg,
 *     primary_goal, dietary_style, allergies, eating_window,
 *     dining_out_frequency, shopping_mode_preference, household_size,
 *     meal_schedule).
 *   - Everything else lives under a single `onboarding` metadata blob.
 *   - Completion is tracked via `onboarding_completed_at`; returning completed
 *     users are routed to the app home instead of repeating the flow.
 *
 * Guardrails honored: age is never stored (only date_of_birth); no medical
 * diagnoses are collected; optional fields never block completion; existing
 * profile behavior is preserved (additive metadata only).
 *
 * Reachable at /app/onboarding (canonical) and /journal/onboarding via the
 * /app re-export. Sits inside the entitled app area, so it runs after a user
 * has journal access (post-purchase), before they dive into the app.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { OnboardingFlowView } from '@/components/onboarding/OnboardingFlowView';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { buildProfilePatch } from '@/lib/onboarding/buildProfilePatch';
import type { OnboardingAnswers } from '@/lib/onboarding/defaultOnboardingFlow';

export default function OnboardingPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'completed'>('loading');
  const startedRef = useRef(false);

  // Returning completed users skip onboarding. Pre-access users are already
  // gated to /journal-waitlist by middleware before reaching this page.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/journal/profile', { credentials: 'include' });
        if (res.ok) {
          const data = (await res.json()) as { profile?: Record<string, unknown> };
          if (data.profile?.onboarding_completed_at) {
            setLoadState('completed');
            void router.replace(APP_ROUTES.home);
            return;
          }
        }
      } catch {
        // Non-fatal: fall through and let the user onboard.
      }
      setLoadState('ready');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark onboarding_started_at once (fire-and-forget; never blocks the UI).
  const markStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    fetch('/api/journal/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ onboarding_started_at: new Date().toISOString() }),
    }).catch(() => {});
  }, []);

  const handleFinish = useCallback(
    async (answers: OnboardingAnswers, { skipRemaining }: { skipRemaining: boolean }) => {
      const patch = buildProfilePatch(answers);
      if (skipRemaining) {
        (patch as Record<string, unknown>).onboarding = {
          ...(patch.onboarding as Record<string, unknown>),
          skipped_remaining: true,
        };
      }
      const res = await fetch('/api/journal/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save your onboarding.');
      }
      void router.replace(`${APP_ROUTES.home}?onboarded=1`);
    },
    [router],
  );

  if (loadState === 'loading' || loadState === 'completed') {
    return (
      <div className="min-h-screen bg-[#CECAB9] flex items-center justify-center">
        <p className="text-[#4F4234] text-base">Loading…</p>
      </div>
    );
  }

  return <OnboardingFlowView onMarkStarted={markStarted} onFinish={handleFinish} />;
}
