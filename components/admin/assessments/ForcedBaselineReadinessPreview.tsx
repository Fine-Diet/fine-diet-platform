/**
 * ForcedBaselineReadinessPreview (Packet Q)
 *
 * Admin/dev-only QA harness for Baseline Readiness forced-result preview.
 * Same read-only contract as ForcedResultPreview (Gut Check) — no submissions,
 * emails, webhooks, claim, or analytics side effects.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { resolveResultsScreenContent } from '@/lib/assessments/results/resolveResultsScreenContent';
import { ResultsProgressBar } from '@/components/assessments/ResultsProgressBar';
import {
  FORCED_BASELINE_READINESS_LEVELS,
  type ForcedBaselineReadinessPreviewResult,
} from '@/lib/assessments/results/forcedPreviewBaselineReadiness';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';

interface ForcedBaselineReadinessPreviewProps {
  forced: ForcedBaselineReadinessPreviewResult;
}

type PackState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; pack: ResultsPack };

export function ForcedBaselineReadinessPreview({
  forced,
}: ForcedBaselineReadinessPreviewProps) {
  const [packState, setPackState] = useState<PackState>({ status: 'loading' });
  const [screenIndex, setScreenIndex] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    let cancelled = false;
    setPackState({ status: 'loading' });
    setScreenIndex(0);

    async function loadPack() {
      const params = new URLSearchParams({
        assessmentType: forced.assessmentType,
        resultsVersion: forced.resultsContentVersion,
        levelId: forced.primaryAvatar,
      });
      try {
        const response = await fetch(
          `/api/results-packs/resolve?${params.toString()}`
        );
        const result = await response.json();
        if (cancelled) return;
        if (!response.ok || !result.success || !result.pack) {
          throw new Error(result.error || 'Failed to load results pack');
        }
        setPackState({ status: 'ready', pack: result.pack as ResultsPack });
      } catch (err) {
        if (cancelled) return;
        setPackState({
          status: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Failed to load results pack for forced preview.',
        });
      }
    }

    loadPack();
    return () => {
      cancelled = true;
    };
  }, [forced.assessmentType, forced.resultsContentVersion, forced.primaryAvatar]);

  return (
    <section className="min-h-screen bg-brand-900 text-white antialiased">
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="mb-6 rounded-2xl border border-amber-300/40 bg-amber-100/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            Forced QA preview — internal proof, not a real result
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            Baseline Readiness · {forced.primaryAvatar}
          </h1>
          <p className="mt-3 text-sm text-white/80">
            Admin/dev-only forced render. No submission, email, webhook, claim,
            or analytics side effects.
          </p>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {FORCED_BASELINE_READINESS_LEVELS.map((lvl) => {
            const active = lvl === forced.primaryAvatar;
            return (
              <Link
                key={lvl}
                href={`/admin/assessments/baseline-readiness/preview?forceOutcome=${lvl}`}
                className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-denim-500 text-neutral-900'
                    : 'border border-white/30 text-white hover:bg-white/10'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {lvl}
              </Link>
            );
          })}
          <Link
            href="/admin/assessments/baseline-readiness"
            className="ml-auto inline-flex items-center justify-center rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            ← Internal hub
          </Link>
        </div>

        {packState.status === 'loading' && (
          <div className="rounded-2xl bg-white/5 p-10 text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-denim-500 border-t-transparent mb-3" />
            <p className="text-white/80">Loading results pack…</p>
          </div>
        )}

        {packState.status === 'error' && (
          <div className="rounded-2xl border border-red-300/40 bg-red-100/10 p-6">
            <h2 className="text-lg font-semibold text-red-200">
              Could not load results pack
            </h2>
            <p className="mt-2 text-sm text-white/80">{packState.message}</p>
            <p className="mt-3 text-xs text-white/60">
              Expected CMS results packs for{' '}
              <code className="text-white">{forced.primaryAvatar}</code> at
              results content version{' '}
              <code className="text-white">{forced.resultsContentVersion}</code>.
              Publish packs from Results Packs admin before retrying. This is
              expected for the internal proof until CMS content exists.
            </p>
          </div>
        )}

        {packState.status === 'ready' && (
          <ForcedFlowBody
            pack={packState.pack}
            levelId={forced.primaryAvatar}
            screenIndex={screenIndex}
            setScreenIndex={setScreenIndex}
          />
        )}
      </div>
    </section>
  );
}

interface ForcedFlowBodyProps {
  pack: ResultsPack;
  levelId: string;
  screenIndex: 0 | 1 | 2;
  setScreenIndex: (idx: 0 | 1 | 2) => void;
}

function ForcedFlowBody({
  pack,
  levelId,
  screenIndex,
  setScreenIndex,
}: ForcedFlowBodyProps) {
  const { renderMultiPage, page1, page2, page3, videoUrl } =
    resolveResultsScreenContent(pack, levelId);

  const handleNext = () => {
    setScreenIndex(screenIndex < 2 ? ((screenIndex + 1) as 0 | 1 | 2) : 2);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handleBack = () => {
    setScreenIndex(screenIndex > 0 ? ((screenIndex - 1) as 0 | 1 | 2) : 0);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!renderMultiPage) {
    return (
      <div className="rounded-2xl bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white/90">
          {pack.label || 'Results pack (no Flow v2 structure)'}
        </h2>
        <p className="mt-3 text-sm text-white/80">
          {pack.summary || 'No summary field on this pack.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/5 p-6">
      <div className="mb-8 px-4">
        <ResultsProgressBar currentPage={screenIndex + 1} totalPages={3} />
      </div>

      {screenIndex === 0 && (
        <div className="px-4">
          <h1 className="mb-6 text-3xl font-semibold sm:text-4xl">
            {page1.headline}
          </h1>
          {page1.body?.map((p, i) => (
            <p key={i} className="mb-4 text-lg leading-snug">
              {p}
            </p>
          ))}
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={handleNext}
              className="w-full rounded-lg bg-denim-900 px-6 py-3 text-base font-semibold text-white"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {screenIndex === 1 && (
        <div className="px-4">
          <h1 className="mb-6 text-3xl font-semibold sm:text-4xl">
            {page2.headline}
          </h1>
          {videoUrl && (
            <p className="mb-5 text-xs text-white/60">
              Video URL: <code className="text-white">{videoUrl}</code>
            </p>
          )}
          <div className="mt-8 flex flex-col items-center space-y-0">
            <button type="button" onClick={handleNext} className="w-full rounded-lg bg-denim-900 px-6 py-6 text-base font-bold text-white">
              Next
            </button>
            <button type="button" onClick={handleBack} className="w-full py-4 text-base font-semibold text-brand-300">
              Back
            </button>
          </div>
        </div>
      )}

      {screenIndex === 2 && (
        <div className="px-4">
          <h1 className="mb-3 text-3xl font-semibold sm:text-4xl">
            {page3.problemHeadline}
          </h1>
          <div className="mt-8 flex flex-col items-center">
            <button type="button" onClick={handleBack} className="w-full py-4 text-base font-semibold text-brand-300">
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
