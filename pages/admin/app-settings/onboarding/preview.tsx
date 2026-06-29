/**
 * Admin preview: /admin/app-settings/onboarding/preview
 *
 * Renders the real Journal onboarding flow for editors/admins WITHOUT
 * touching `people.metadata`. Mirrors the Start Pages admin preview pattern:
 *   - getServerSideProps enforces editor/admin role (no journal entitlement).
 *   - The page is a client component so Next/Back, persona, and source
 *     switching work locally; it never calls `/api/journal/profile`.
 *
 * Query params (seed only — navigation after load is local):
 *   step=0..4           Starting step index (clamped).
 *   persona=blank|busy-parent|fitness|gut-health
 *                       Seed answer preset.
 *   completed=0|1       Start in the non-persistent preview-complete state.
 *   source=draft|published|default
 *                       Which config to render. Defaults to `draft` (falls
 *                       back to published → default). Shown in the toolbar.
 *
 * Behavior guarantees:
 *   - No POST to /api/journal/profile (no onboarding_started_at, no
 *     onboarding_completed_at, no profile patch).
 *   - No mutation of people.metadata, Stripe, billing, offers, or entitlements.
 *   - Finish / Skip render a non-persistent "Preview complete" screen.
 */

import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { OnboardingFlowView } from '@/components/onboarding/OnboardingFlowView';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import {
  ONBOARDING_PERSONAS,
  getPersonaAnswers,
  isOnboardingPersona,
  type OnboardingAnswers,
  type OnboardingPersona,
} from '@/lib/onboarding/defaultOnboardingFlow';
import type { OnboardingFlowConfig } from '@/lib/onboarding/onboardingFlowTypes';
import {
  DEFAULT_ONBOARDING_FLOW_CONFIG,
  MAX_ONBOARDING_PAGES,
} from '@/lib/onboarding/onboardingFlowTypes';
import type { OnboardingFlowSource } from '@/lib/onboarding/onboardingFlowServerService';

const VALID_SOURCES: readonly OnboardingFlowSource[] = ['draft', 'published', 'default'];

interface PreviewProps {
  initialStep: number;
  persona: OnboardingPersona;
  initialCompleted: boolean;
  source: OnboardingFlowSource;
}

function parseStep(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.trunc(n), 0), MAX_ONBOARDING_PAGES - 1);
}

function parseCompleted(raw: string | string[] | undefined): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === '1' || v === 'true';
}

function parsePersona(raw: string | string[] | undefined): OnboardingPersona {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return isOnboardingPersona(v) ? v : 'blank';
}

function parseSource(raw: string | string[] | undefined): OnboardingFlowSource {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (VALID_SOURCES as readonly string[]).includes(v as string)
    ? (v as OnboardingFlowSource)
    : 'draft';
}

export default function OnboardingPreview({
  initialStep,
  persona: initialPersona,
  initialCompleted,
  source: initialSource,
}: PreviewProps) {
  const router = useRouter();
  const [persona, setPersona] = useState<OnboardingPersona>(initialPersona);
  const [completed, setCompleted] = useState<boolean>(initialCompleted);
  const [source, setSource] = useState<OnboardingFlowSource>(initialSource);
  const [flowConfig, setFlowConfig] = useState<OnboardingFlowConfig | null>(null);
  const [effectiveSource, setEffectiveSource] = useState<OnboardingFlowSource>(initialSource);
  const [loadingFlow, setLoadingFlow] = useState<boolean>(true);

  // Seed answers come from the persona preset. `key` remounts the view when
  // the persona changes so the new seed answers take effect.
  const seedAnswers = useMemo<OnboardingAnswers>(
    () => getPersonaAnswers(persona),
    [persona],
  );

  // Load the selected flow config from the admin flow API. Never calls
  // /api/journal/profile. Falls back to the code-owned default on any error.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingFlow(true);
      try {
        const res = await fetch(`/api/admin/onboarding/flow?source=${encodeURIComponent(source)}`, {
          headers: { 'Cache-Control': 'no-store' },
        });
        if (res.ok) {
          const json = (await res.json()) as {
            config?: OnboardingFlowConfig;
            source?: OnboardingFlowSource;
          };
          if (!cancelled) {
            setFlowConfig(json.config ?? DEFAULT_ONBOARDING_FLOW_CONFIG);
            setEffectiveSource(json.source ?? source);
          }
          return;
        }
      } catch {
        // fall through to default
      }
      if (!cancelled) {
        setFlowConfig(DEFAULT_ONBOARDING_FLOW_CONFIG);
        setEffectiveSource('default');
      }
    })().finally(() => {
      if (!cancelled) setLoadingFlow(false);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Keep the URL in sync (shallow — does not re-run getServerSideProps) so the
  // preview is shareable/bookmarkable. No network call is made.
  const syncUrl = useCallback(
    (next: { persona: OnboardingPersona; completed: boolean; source: OnboardingFlowSource }) => {
      const qs = new URLSearchParams({
        persona: next.persona,
        completed: next.completed ? '1' : '0',
        source: next.source,
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
      syncUrl({ persona: next, completed: false, source });
    },
    [syncUrl, source],
  );

  const handleSourceChange = useCallback(
    (next: OnboardingFlowSource) => {
      setSource(next);
      setCompleted(false);
      syncUrl({ persona, completed: false, source: next });
    },
    [syncUrl, persona],
  );

  const handleFinish = useCallback(() => {
    setCompleted(true);
    syncUrl({ persona, completed: true, source });
  }, [persona, source, syncUrl]);

  const handleReset = useCallback(() => {
    setCompleted(false);
    syncUrl({ persona, completed: false, source });
  }, [persona, source, syncUrl]);

  const sourceBadge =
    effectiveSource === 'published'
      ? { label: 'Published', cls: 'bg-green-100 text-green-800' }
      : effectiveSource === 'draft'
        ? { label: 'Draft', cls: 'bg-amber-100 text-amber-800' }
        : { label: 'Default', cls: 'bg-gray-200 text-gray-700' };

  return (
    <>
      <Head>
        <title>Onboarding Preview • Fine Diet Admin</title>
      </Head>

      {/* Preview-only toolbar. Never rendered to real users. */}
      <div className="fixed inset-x-0 top-0 z-20 border-b border-[#4F4234]/10 bg-[#fffff6]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[820px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[#6AB1AE]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#6AB1AE]">
              Admin preview
            </span>
            <Link
              href="/admin/app-settings/onboarding"
              className="text-sm text-[#4F4234]/70 hover:text-[#4F4234]"
            >
              ← Authoring
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[#4F4234]">
              <span className="text-[#4F4234]/60">Source</span>
              <select
                value={source}
                onChange={(e) => handleSourceChange(e.target.value as OnboardingFlowSource)}
                className="rounded-full border border-[#4F4234]/15 bg-white px-3 py-1.5 text-sm text-[#4F4234] focus:border-[#6AB1AE] focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="default">Default</option>
              </select>
            </label>

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
        <div className="mx-auto flex w-full max-w-[820px] items-center gap-2 px-5 pb-2 text-xs text-[#4F4234]/50">
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${sourceBadge.cls}`}>
            Rendering: {sourceBadge.label}
          </span>
          <span>Non-persistent preview — no profile data is written. Starting page {initialStep + 1}.</span>
        </div>
      </div>

      <div className="pt-24">
        {loadingFlow ? (
          <div className="min-h-screen bg-[#CECAB9] flex items-center justify-center">
            <p className="text-[#4F4234] text-base">Loading flow…</p>
          </div>
        ) : (
          <OnboardingFlowView
            key={`${persona}:${effectiveSource}`}
            initialAnswers={seedAnswers}
            initialStep={initialStep}
            flowConfig={flowConfig ?? undefined}
            completed={completed}
            onFinish={handleFinish}
            onReset={handleReset}
          />
        )}
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
      source: parseSource(context.query.source),
    },
  };
};
