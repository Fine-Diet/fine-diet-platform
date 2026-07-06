/**
 * ForcedResultPreview (Packet P)
 *
 * Admin/dev-only QA harness that force-renders a Gut Check results pack for a
 * given level (`level1`–`level4`) on demand. It lets QA verify copy, results
 * pack rendering, CTA labels, video resolution, and result layout stability
 * WITHOUT writing a submission, running scoring, or triggering email /
 * webhook / claim / saved-account / analytics side effects.
 *
 * How it works:
 *   1. The parent admin route validates `forceOutcome` via
 *      `buildForcedGutCheckPreviewResult` and passes a confirmed
 *      `ForcedGutCheckPreviewResult` here.
 *   2. This component fetches the SAME published results pack the real
 *      `ResultsScreen` fetches (`GET /api/results-packs/resolve`), but with
 *      no `submissionId` and no pack-ref pinning — purely the pack content.
 *   3. It resolves the 3-page flow content with the SAME pure resolver the
 *      real screen uses (`resolveResultsScreenContent`), so QA sees the
 *      actual copy / CTA labels / video URL production would render.
 *   4. It renders the pages READ-ONLY. The email capture, PDF download,
 *      claim/login, saved-to-account banner, and analytics tracking that
 *      live in `ResultsScreen` are intentionally OMITTED — those depend on a
 *      real submission and must never fire from a forced preview.
 *
 * This is a QA diagnostic, not a user-facing results screen. It is gated to
 * editor/admin at the route level (see
 * `pages/admin/assessments/gut-check/preview.tsx`).
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { resolveResultsScreenContent } from '@/lib/assessments/results/resolveResultsScreenContent';
import { ResultsProgressBar } from '@/components/assessments/ResultsProgressBar';
import {
  FORCED_GUT_CHECK_LEVELS,
  type ForcedGutCheckPreviewResult,
} from '@/lib/assessments/results/forcedPreview';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';

interface ForcedResultPreviewProps {
  /** A validated forced-preview result (ok: true) for a Gut Check level. */
  forced: ForcedGutCheckPreviewResult;
}

type PackState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; pack: ResultsPack };

export function ForcedResultPreview({ forced }: ForcedResultPreviewProps) {
  const [packState, setPackState] = useState<PackState>({ status: 'loading' });
  const [screenIndex, setScreenIndex] = useState<0 | 1 | 2>(0);

  // Fetch the published results pack for the forced level. No submissionId,
  // no pack-ref pinning, no preview=1 (we want the published pack). This
  // route is read-only — the resolve API only returns pack content.
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
        {/* QA banner — makes it obvious this is not a real result */}
        <div className="mb-6 rounded-2xl border border-amber-300/40 bg-amber-100/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            Forced QA preview — not a real result
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            Gut Check · {forced.primaryAvatar}
          </h1>
          <p className="mt-3 text-sm text-white/80">
            This is an admin/dev-only forced render of the{' '}
            <code className="text-white">{forced.primaryAvatar}</code> results
            pack. No submission is written, no email / webhook / claim /
            saved-account flow is triggered, and no analytics event is fired.
            Copy, CTA labels, and the video URL below are the same content the
            real results screen would render for this level.
          </p>
          <p className="mt-3 text-xs text-white/60">
            Level:{' '}
            <code className="text-white">{forced.primaryAvatar}</code> ·
            resultsContentVersion:{' '}
            <code className="text-white">{forced.resultsContentVersion}</code>
            {forced.scoreMap[forced.primaryAvatar] != null && (
              <>
                {' '}
                · stub score:{' '}
                <code className="text-white">
                  {forced.scoreMap[forced.primaryAvatar]}
                </code>
              </>
            )}
          </p>
        </div>

        {/* Level selector */}
        <div className="mb-8 flex flex-wrap gap-2">
          {FORCED_GUT_CHECK_LEVELS.map((lvl) => {
            const active = lvl === forced.primaryAvatar;
            return (
              <Link
                key={lvl}
                href={`/admin/assessments/gut-check/preview?forceOutcome=${lvl}`}
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
            href="/admin/assessments"
            className="ml-auto inline-flex items-center justify-center rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            ← Back to admin
          </Link>
        </div>

        {/* Body */}
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
              This usually means no published results pack exists for
              {' '}
              <code className="text-white">{forced.primaryAvatar}</code> at
              results content version{' '}
              <code className="text-white">{forced.resultsContentVersion}</code>.
              Publish one from the Results Packs admin before retrying.
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

// ---------------------------------------------------------------------------
// Read-only 3-page flow body (no side-effecting handlers)
// ---------------------------------------------------------------------------

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
    // Pack lacks Flow v2 + legacy core fields. Show a read-only summary so
    // QA can still see what (little) would render.
    return (
      <div className="rounded-2xl bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white/90">
          {pack.label || 'Results pack (no Flow v2 structure)'}
        </h2>
        <p className="mt-3 text-sm text-white/80">
          {pack.summary || 'No summary field on this pack.'}
        </p>
        <p className="mt-4 text-xs text-white/60">
          This pack does not carry Flow v2 structure or the legacy core fields
          (summary / keyPatterns / firstFocusAreas), so the real results screen
          would fall back to its single-page legacy render. Forced preview
          shows the raw pack fields above for QA.
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
          {page1.body && page1.body.length > 0 && (
            <div className="mb-8 space-y-4">
              {page1.body.map((p, i) => (
                <p key={i} className="text-lg leading-snug">
                  {p}
                </p>
              ))}
            </div>
          )}
          {page1.snapshotTitle && (
            <div className="mb-6 mt-8">
              <h3 className="mb-3 text-2xl font-semibold text-neutral-50">
                {page1.snapshotTitle}
              </h3>
              {page1.snapshotBullets && page1.snapshotBullets.length > 0 && (
                <ul className="ml-10 space-y-1">
                  {page1.snapshotBullets.map((b, i) => (
                    <li key={i} className="flex items-start text-lg">
                      <span className="mr-2 text-xl">•</span>
                      <span className="leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {page1.meaningTitle && (
            <div className="pt-6">
              <h3 className="mb-3 text-2xl font-semibold text-neutral-50">
                {page1.meaningTitle}
              </h3>
              {page1.meaningBody && (
                <p className="text-lg leading-snug">{page1.meaningBody}</p>
              )}
            </div>
          )}
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={handleNext}
              className="w-full rounded-lg bg-denim-900 px-6 py-3 text-base font-semibold text-white transition-colors hover:opacity-90"
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
          {page2.stepBullets && page2.stepBullets.length > 0 && (
            <ul className="mb-8 ml-10 space-y-1">
              {page2.stepBullets.map((b, i) => (
                <li key={i} className="flex items-start text-lg">
                  <span className="mr-2 text-xl">•</span>
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          )}
          {videoUrl ? (
            <div className="mb-5">
              <div className="rounded-lg border-2 border-white p-5 text-base font-semibold">
                Video CTA: {page2.videoCtaLabel}
              </div>
              <p className="mt-2 text-xs text-white/60">
                Resolved video URL:{' '}
                <code className="text-white">{videoUrl}</code>
              </p>
            </div>
          ) : (
            <p className="mb-5 text-sm text-white/60">
              No video URL resolved for this level.
            </p>
          )}
          {/* Read-only QA markers for the side-effecting slots the real
              screen would render here. We deliberately do NOT render the
              email capture, PDF download, claim/login, or saved-account
              banner — those require a real submission. */}
          <div className="mt-6 space-y-2 rounded-lg border border-white/15 p-4 text-xs text-white/60">
            <p>
              <strong className="text-white/80">QA note:</strong> the real
              results screen renders email capture, PDF download, claim/login,
              and a saved-to-account banner on this page. They are omitted
              from forced preview because they require a real submission.
            </p>
            {page2.emailHelper && (
              <p>emailHelper copy: {page2.emailHelper}</p>
            )}
            {page2.pdfHelper && <p>pdfHelper copy: {page2.pdfHelper}</p>}
          </div>
          <div className="mt-8 flex flex-col items-center space-y-0">
            <button
              type="button"
              onClick={handleNext}
              className="w-full rounded-lg bg-denim-900 px-6 py-6 text-base font-bold text-white transition-colors hover:opacity-90"
            >
              Next
            </button>
            <button
              type="button"
              onClick={handleBack}
              className="w-full py-4 text-base font-semibold text-brand-300 transition-colors hover:opacity-70"
            >
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
          {page3.problemBody && page3.problemBody.length > 0 && (
            <div className="mb-8 space-y-4">
              {page3.problemBody.map((p, i) => (
                <p key={i} className="text-lg leading-snug">
                  {p}
                </p>
              ))}
            </div>
          )}
          {page3.tryTitle && (
            <div className="mt-8 border-t border-neutral-700">
              <h3 className="mb-1 mt-6 text-2xl font-semibold">
                {page3.tryTitle}
              </h3>
              {page3.tryBullets && page3.tryBullets.length > 0 && (
                <ul className="ml-10 space-y-0">
                  {page3.tryBullets.map((b, i) => (
                    <li key={i} className="flex items-start text-lg">
                      <span className="mr-2 text-xl">•</span>
                      <span className="leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              {page3.tryCloser && (
                <p className="ml-10 mt-0 text-sm font-light leading-relaxed">
                  {page3.tryCloser}
                </p>
              )}
            </div>
          )}
          {page3.mechanismTitle && (
            <div className="mt-8 border-t border-neutral-700 pt-6">
              <h3 className="mb-2 text-2xl font-semibold">
                {page3.mechanismTitle}
              </h3>
              {page3.mechanismBodyTop && (
                <p className="mb-3 ml-10 text-lg leading-relaxed">
                  {page3.mechanismBodyTop}
                </p>
              )}
              {page3.mechanismPills && page3.mechanismPills.length > 0 && (
                <div className="ml-10 mb-4 flex flex-col gap-3">
                  {page3.mechanismPills.map((pill, i) => (
                    <div
                      key={i}
                      className="w-full rounded-full border border-white/20 px-5 py-1 text-base font-medium text-white/60"
                    >
                      {pill}
                    </div>
                  ))}
                </div>
              )}
              {page3.mechanismBodyBottom && (
                <p className="ml-10 text-lg font-light leading-relaxed">
                  {page3.mechanismBodyBottom}
                </p>
              )}
            </div>
          )}
          {page3.methodTitle && (
            <div className="mt-8 border-t border-neutral-700 pt-6">
              <h3 className="mb-3 text-2xl font-semibold">
                {page3.methodTitle}
              </h3>
              {page3.methodBody && page3.methodBody.length > 0 && (
                <div className="ml-10 mb-3 space-y-0">
                  {page3.methodBody.map((p, i) => (
                    <p key={i} className="text-lg leading-relaxed">
                      {p}
                    </p>
                  ))}
                </div>
              )}
              {page3.methodLearnTitle && (
                <div className="ml-10">
                  <h4 className="mb-2 text-lg font-semibold">
                    {page3.methodLearnTitle}
                  </h4>
                  {page3.methodLearnBullets &&
                    page3.methodLearnBullets.length > 0 && (
                      <ul className="ml-10 space-y-2">
                        {page3.methodLearnBullets.map((b, i) => (
                          <li key={i} className="flex items-start text-lg">
                            <span className="mr-2 text-xl">•</span>
                            <span className="leading-relaxed">{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              )}
              <div className="mt-8 space-y-4">
                <div className="w-full rounded-lg bg-denim-900 px-6 py-8 text-center text-base font-semibold text-white">
                  Method CTA: {page3.methodCtaLabel}
                  <p className="mt-2 text-xs font-normal text-white/60">
                    URL: <code className="text-white">{page3.methodCtaUrl}</code>
                  </p>
                </div>
                <p className="text-center text-sm font-normal text-white/70">
                  Email link label: {page3.methodEmailLinkLabel}
                </p>
              </div>
            </div>
          )}
          <div className="mt-8 flex flex-col items-center">
            <button
              type="button"
              onClick={handleBack}
              className="w-full py-4 text-base font-semibold text-brand-300 transition-colors hover:opacity-70"
            >
              Back
            </button>
          </div>
        </div>
      )}

      <div className="mt-9 border-t border-neutral-700 pt-2">
        <p className="text-center text-sm text-neutral-400">
          This assessment is for educational purposes only and is not a medical
          diagnosis. It does not replace personalized medical advice.
        </p>
      </div>
    </div>
  );
}
