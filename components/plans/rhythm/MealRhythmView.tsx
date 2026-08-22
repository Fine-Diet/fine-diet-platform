'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { useMealRhythmController } from './useMealRhythmController';
import { MealRhythmSummary } from './MealRhythmSummary';
import { MealRhythmEditor } from './MealRhythmEditor';
import { MealRhythmConfirm } from './MealRhythmConfirm';
import { resolveSafeMealRhythmReturnTo } from '@/lib/plans/mealRhythm/returnTo';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

export function MealRhythmView() {
  const router = useRouter();
  const returnToRaw =
    typeof router.query.returnTo === 'string' ? router.query.returnTo : null;
  const returnTo = resolveSafeMealRhythmReturnTo(returnToRaw, APP_ROUTES.plans);

  const ctrl = useMealRhythmController({ acceptTriggerContext: 'route' });

  // Escape cancels review/edit on the route host (does not skip confirm Done)
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (ctrl.phase === 'confirm') return;
      if (ctrl.phase === 'review' || ctrl.phase === 'edit') {
        ctrl.markAbandoned();
        void router.push(returnTo);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [ctrl.phase, ctrl.markAbandoned, returnTo, router]);

  function handleDone() {
    void router.replace(returnTo);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#000000] text-white">
      <div className="flex-1 overflow-y-auto pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        <StackedPageHero className="overflow-hidden bg-gradient-to-b from-neutral-900 to-brand-700 to-80%">
          <div className="relative z-10 mx-auto flex min-h-[180px] w-full max-w-[650px] flex-col justify-center px-6 pb-10 pt-12 sm:min-h-[200px]">
            <Link
              href={returnTo}
              onClick={() => ctrl.markAbandoned()}
              className="text-xs text-white/60 hover:text-white/80"
            >
              ← Plans
            </Link>
            <h1 className="mt-4 max-w-[520px] text-4xl font-semibold tracking-[-0.03em] text-white antialiased sm:text-5xl">
              Meal rhythm
            </h1>
          </div>
        </StackedPageHero>

        <StackedPageSection layer={1} className="bg-[#16110d] pb-24">
          {ctrl.phase === 'loading' ? (
            <p className="text-sm text-white/55">Preparing a starting rhythm…</p>
          ) : ctrl.phase === 'error' ? (
            <p className="text-sm text-red-300">
              {ctrl.error || 'Could not load your meal rhythm.'}
            </p>
          ) : ctrl.phase === 'confirm' ? (
            <MealRhythmConfirm onDone={handleDone} />
          ) : ctrl.phase === 'edit' && ctrl.draft ? (
            <div className="space-y-5">
              <p className="text-sm text-white/55 antialiased">
                Toggle occasions on or off and adjust times.
              </p>
              <MealRhythmEditor
                draft={ctrl.draft}
                onUpdateSlot={ctrl.updateSlot}
                disabled={ctrl.saving}
              />
              {ctrl.error ? <p className="text-sm text-red-300">{ctrl.error}</p> : null}
              <button
                type="button"
                disabled={ctrl.saving}
                onClick={() => void ctrl.persist()}
                className="w-full rounded-full bg-neutral-200 py-3 text-center text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-50"
              >
                {ctrl.saving ? 'Saving…' : 'Save rhythm'}
              </button>
              <button
                type="button"
                disabled={ctrl.saving}
                onClick={ctrl.resetDraftFromProposal}
                className="w-full rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white hover:border-white/30 disabled:opacity-50"
              >
                Back to proposal
              </button>
            </div>
          ) : ctrl.draft ? (
            <MealRhythmSummary
              schedule={ctrl.draft}
              onLooksGood={() => void ctrl.persist()}
              onEdit={ctrl.startEditing}
              saving={ctrl.saving}
              error={ctrl.error}
            />
          ) : null}
        </StackedPageSection>
      </div>
      <JournalFooterNav />
    </div>
  );
}
