/**
 * Admin preview: /admin/app-settings/onboarding/preview
 *
 * Renders the real Journal onboarding flow for editors/admins WITHOUT
 * touching `people.metadata`. Mirrors the Start Pages admin preview pattern:
 *   - getServerSideProps enforces editor/admin role (no journal entitlement).
 *   - The page is a client component so Next/Back and persona switching work
 *     locally; it never calls `/api/journal/profile`.
 *
 * Query params (seed only — navigation after load is local):
 *   step=0..4           Starting step index (clamped).
 *   persona=blank|busy-parent|fitness|gut-health
 *                       Seed answer preset.
 *   completed=0|1       Start in the non-persistent preview-complete state.
 *
 * Behavior guarantees:
 *   - No POST to /api/journal/profile (no onboarding_started_at, no
 *     onboarding_completed_at, no profile patch).
 *   - No mutation of people.metadata, Stripe, billing, offers, or entitlements.
 *   - Finish / Skip render a non-persistent "Preview complete" screen.
 */

import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useCallback, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { OnboardingFlowView } from '@/components/onboarding/OnboardingFlowView';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import {
  ONBOARDING_PERSONAS,
  TOTAL_STEPS,
  getPersonaAnswers,
  isOnboardingPersona,
  type OnboardingAnswers,
  type OnboardingPersona,
} from '@/lib/onboarding/defaultOnboardingFlow';

interface PreviewProps {
  initialStep: number;
  persona: OnboardingPersona;
  initialCompleted: boolean;
}

function parseStep(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.trunc(n), 0), TOTAL_STEPS - 1);
}

function parseCompleted(raw: string | string[] | undefined): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === '1' || v === 'true';
}

function parsePersona(raw: string | string[] | undefined): OnboardingPersona {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return isOnboardingPersona(v) ? v : 'blank';
}

export default function OnboardingPreview({
  initialStep,
  persona: initialPersona,
  initialCompleted,
}: PreviewProps) {
  const router = useRouter();
  const [persona, setPersona] = useState<OnboardingPersona>(initialPersona);
  const [completed, setCompleted] = useState<boolean>(initialCompleted);

  // Seed answers come from the persona preset. `key` remounts the view when
  // the persona changes so the new seed answers take effect.
  const seedAnswers = useMemo<OnboardingAnswers>(
    () => getPersonaAnswers(persona),
    [persona],
  );

  // Keep the URL in sync (shallow — does not re-run getServerSideProps) so the
  // preview is shareable/bookmarkable. No network call is made.
  const syncUrl = useCallback(
    (next: { persona: OnboardingPersona; completed: boolean }) => {
      const qs = new URLSearchParams({
        persona: next.persona,
        completed: next.completed ? '1' : '0',
      });
      void router.replace(`/admin/app-settings/onboarding/preview?${qs.toString()}`, undefined, {
        shallow: true,
      });
    },
    [router],
  );

  const handlePersonaChange = useCallback(
    (next: OnboardingPersona) => {
      setPersona(next);
      setCompleted(false);
      syncUrl({ persona: next, completed: false });
    },
    [syncUrl],
  );

  const handleFinish = useCallback(() => {
    setCompleted(true);
    syncUrl({ persona, completed: true });
  }, [persona, syncUrl]);

  const handleReset = useCallback(() => {
    setCompleted(false);
    syncUrl({ persona, completed: false });
  }, [persona, syncUrl]);

  return (
    <>
      <Head>
        <title>Onboarding Preview • Fine Diet Admin</title>
      </Head>

      {/* Preview-only toolbar. Never rendered to real users. */}
      <div className="fixed inset-x-0 top-0 z-20 border-b border-[#4F4234]/10 bg-[#fffff6]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[760px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[#6AB1AE]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#6AB1AE]">
              Admin preview
            </span>
            <Link
              href="/admin/app-settings"
              className="text-sm text-[#4F4234]/70 hover:text-[#4F4234]"
            >
              ← App Settings
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[#4F4234]">
              <span className="text-[#4F4234]/60">Persona</span>
              <select
                value={persona}
                onChange={(e) => handlePersonaChange(e.target.value as OnboardingPersona)}
                className="rounded-full border border-[#4F4234]/15 bg-white px-3 py-1.5 text-sm text-[#4F4234] focus:border-[#6AB1AE] focus:outline-none"
              >
                {ONBOARDING_PERSONAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => (completed ? handleReset() : handleFinish())}
              className="rounded-full border border-[#4F4234]/15 bg-white px-3 py-1.5 text-sm text-[#4F4234] hover:bg-[#fffff6]"
            >
              {completed ? 'Show flow' : 'Show completed'}
            </button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[760px] px-5 pb-2 text-xs text-[#4F4234]/50">
          Non-persistent preview — no profile data is written. Starting step {initialStep} of{' '}
          {TOTAL_STEPS - 1}.
        </div>
      </div>

      <div className="pt-24">
        <OnboardingFlowView
          key={persona}
          initialAnswers={seedAnswers}
          initialStep={initialStep}
          completed={completed}
          onFinish={handleFinish}
          onReset={handleReset}
        />
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PreviewProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  return {
    props: {
      initialStep: parseStep(context.query.step),
      persona: parsePersona(context.query.persona),
      initialCompleted: parseCompleted(context.query.completed),
    },
  };
};
