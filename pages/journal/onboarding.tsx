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
import { buildProfilePatch } from '@/lib/onboarding/buildProfilePatch';
import type { OnboardingAnswers } from '@/lib/onboarding/defaultOnboardingFlow';
import {
  resolveCompletedUserDestination,
  resolveOnboardingFinishDestination,
} from '@/lib/onboarding/onboardingGate';
import type { OnboardingFlowConfig } from '@/lib/onboarding/onboardingFlowTypes';

/** Read a single-string `returnTo` query param, or null when absent/invalid. */
function readReturnTo(query: ReturnType<typeof useRouter>['query']): string | null {
  const raw = Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo;
  return typeof raw === 'string' ? raw : null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'completed'>('loading');
  const [flowConfig, setFlowConfig] = useState<OnboardingFlowConfig | null>(null);
  const startedRef = useRef(false);

  // Returning completed users skip onboarding. Pre-access users are already
  // gated to /journal-waitlist by middleware before reaching this page. When
  // the middleware sent us here with ?returnTo=<safe app path>, honor it on
  // completion/finish; otherwise fall back to /app.
  //
  // The flow config (admin-authored copy/config) is loaded in parallel from
  // /api/onboarding/flow. If that fetch fails or no published flow exists, the
  // view falls back to the code-owned default config — onboarding always
  // renders.
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
          if (data.profile?.onboarding_completed_at) {
            setLoadState('completed');
            void router.replace(resolveCompletedUserDestination(returnTo));
            return;
          }
        } catch {
          // Non-fatal: fall through and let the user onboard.
        }
      }

      if (flowRes.status === 'fulfilled' && flowRes.value.ok) {
        try {
          const flow = (await flowRes.value.json()) as { config?: OnboardingFlowConfig };
          if (flow.config) setFlowConfig(flow.config);
        } catch {
          // Non-fatal: view renders with default config.
        }
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
      // Honor a safe returnTo (set by the middleware gate); else /app?onboarded=1.
      void router.replace(resolveOnboardingFinishDestination(readReturnTo(router.query)));
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

  return <OnboardingFlowView flowConfig={flowConfig ?? undefined} onMarkStarted={markStarted} onFinish={handleFinish} />;
}
