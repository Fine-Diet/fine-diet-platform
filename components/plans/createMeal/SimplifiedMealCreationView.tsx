'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { isMealSlotKey } from '@/lib/journal/mealScheduleAssignment';
import type { MealDocumentSearchResult } from '@/lib/meals/searchTypes';
import type { MealDocument } from '@/lib/meals/types';
import {
  mealTypeForSlotKey,
  proposeMealCreationCandidates,
  type MealCreationCandidate,
  type MealCreationCandidateProposal,
} from '@/lib/plans/mealCreation/candidatePolicy';
import { emitMealCreationEvent } from '@/lib/plans/mealCreation/emitEvent';
import { buildSimpleMealDocument } from '@/lib/plans/mealCreation/simpleMeal';
import {
  attachCanonicalMealToPlan,
  createCanonicalSimpleMeal,
  fetchCanonicalMealDocument,
} from '@/lib/plans/mealCreation/write';
import { planService } from '@/lib/plans/planService';
import { resolvePlanSlotForCreateKey } from '@/lib/plans/resolvePlanSlotForCreateKey';
import { MEAL_SLOT_DEFAULT_LABELS, type MealSlotKey } from '@/lib/plans/types';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import { isSafeAppReturnPath } from '@/lib/plans/planToday/policy';

type FlowState = 'loading' | 'candidates' | 'share' | 'review' | 'working' | 'error';

function returnHref(date: string, planId: string | null, returnTo: string | null): string {
  if (returnTo && isSafeAppReturnPath(returnTo)) return returnTo;
  if (planId) return APP_ROUTE_BUILDERS.planDayWithPlan(date, planId);
  return APP_ROUTES.plans;
}

export function SimplifiedMealCreationView() {
  const router = useRouter();
  const date = typeof router.query.date === 'string' ? router.query.date : '';
  const slotRaw = typeof router.query.slot === 'string' ? router.query.slot : '';
  const planId = typeof router.query.planId === 'string' ? router.query.planId : null;
  const hintedPlanDayId =
    typeof router.query.planDayId === 'string' ? router.query.planDayId : null;
  const hintedPlanSlotId =
    typeof router.query.planSlotId === 'string' ? router.query.planSlotId : null;
  const returnTo =
    typeof router.query.returnTo === 'string' && isSafeAppReturnPath(router.query.returnTo)
      ? router.query.returnTo
      : null;
  const slotKey: MealSlotKey | null = isMealSlotKey(slotRaw) ? slotRaw : null;

  const [flow, setFlow] = useState<FlowState>('loading');
  const [proposal, setProposal] = useState<MealCreationCandidateProposal | null>(null);
  const [shareTitle, setShareTitle] = useState('');
  const [reviewDocument, setReviewDocument] = useState<MealDocument | null>(null);
  const [error, setError] = useState('');
  const shownRef = useRef(false);
  const abandonedRef = useRef(false);
  const attachInFlightRef = useRef(false);

  useEffect(() => {
    if (!router.isReady || !slotKey) return;
    let cancelled = false;
    (async () => {
      setFlow('loading');
      try {
        const res = await fetch('/api/journal/meals/documents/search?mode=all&limit=20', {
          credentials: 'include',
        });
        const json = (await res.json().catch(() => ({}))) as {
          results?: MealDocumentSearchResult[];
        };
        const library = (json.results ?? [])
          .filter((row) => row.type === 'meal_document')
          .map((row) => ({
            id: row.id,
            title: row.title,
            document_kind: row.document_kind,
            intents: row.intents,
            archived: row.archived,
            updated_at: row.updated_at,
          }));
        const next = proposeMealCreationCandidates({ slotKey, library });
        if (cancelled) return;
        setProposal(next);
        setFlow('candidates');
      } catch {
        if (cancelled) return;
        setError('Could not load your meals.');
        setFlow('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, slotKey]);

  useEffect(() => {
    if (flow !== 'candidates' || !proposal || !slotKey || shownRef.current) return;
    shownRef.current = true;
    emitMealCreationEvent({
      event: 'meal_creation_candidates_shown',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'exposed',
      reasonCodes: proposal.reasonCodes,
      candidateCount: proposal.candidates.length,
      slotKey,
      selectedSource: null,
      attached: false,
    });
  }, [flow, proposal, slotKey]);

  const markAbandoned = useCallback(() => {
    if (abandonedRef.current || !proposal || !slotKey) return;
    abandonedRef.current = true;
    emitMealCreationEvent({
      event: 'meal_creation_abandoned',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'cancel',
      reasonCodes: [...proposal.reasonCodes, 'user_cancelled'],
      candidateCount: proposal.candidates.length,
      slotKey,
      selectedSource: null,
      attached: false,
    });
  }, [proposal, slotKey]);

  async function resolvePlanTarget(): Promise<
    | { ok: true; planDayId: string; planSlotId: string }
    | { ok: false; error: string }
  > {
    if (!planId) return { ok: false, error: 'No plan to attach this meal to yet.' };
    if (!date || !slotKey) return { ok: false, error: 'Missing day or occasion.' };
    const detail = await planService.getDetail(planId);
    const day = detail.days.find((row) => row.date_local === date);
    if (!day) return { ok: false, error: 'That day is not in this plan.' };
    const daySlots = detail.slots.filter((row) => row.plan_day_id === day.id);
    const slot = resolvePlanSlotForCreateKey(slotKey, daySlots);
    if (!slot) return { ok: false, error: 'That occasion is not on this plan day.' };
    if (
      hintedPlanDayId &&
      hintedPlanSlotId &&
      hintedPlanDayId === day.id &&
      hintedPlanSlotId === slot.id
    ) {
      return { ok: true, planDayId: hintedPlanDayId, planSlotId: hintedPlanSlotId };
    }
    return { ok: true, planDayId: day.id, planSlotId: slot.id };
  }

  async function attachAndReturn(document: MealDocument, selectedSource: 'saved_library' | 'share_new') {
    if (!proposal || !slotKey) return;
    if (!planId) {
      abandonedRef.current = true;
      await router.replace(returnHref(date, planId, returnTo));
      return;
    }
    attachInFlightRef.current = true;
    const target = await resolvePlanTarget();
    if (!target.ok) {
      attachInFlightRef.current = false;
      setError(target.error);
      setFlow('error');
      return;
    }
    const attached = await attachCanonicalMealToPlan({
      planId,
      planDayId: target.planDayId,
      planSlotId: target.planSlotId,
      mealType: mealTypeForSlotKey(slotKey),
      document,
    });
    if (!attached.ok) {
      attachInFlightRef.current = false;
      setError(attached.error);
      setFlow('error');
      return;
    }
    emitMealCreationEvent({
      event: 'meal_creation_attached_to_plan',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'primary',
      reasonCodes: [
        ...proposal.reasonCodes,
        attached.reused ? 'planned_meal_pointer_reused' : 'planned_meal_pointer',
      ],
      candidateCount: proposal.candidates.length,
      slotKey,
      selectedSource,
      attached: true,
    });
    abandonedRef.current = true;
    await router.replace(returnHref(date, planId, returnTo));
  }

  async function selectExisting(candidate: MealCreationCandidate) {
    if (!proposal || !slotKey || attachInFlightRef.current) return;
    attachInFlightRef.current = true;
    setFlow('working');
    setError('');
    emitMealCreationEvent({
      event: 'meal_creation_existing_selected',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'primary',
      reasonCodes: candidate.reasonCodes,
      candidateCount: proposal.candidates.length,
      slotKey,
      selectedSource: 'saved_library',
      attached: false,
    });
    const loaded = await fetchCanonicalMealDocument(candidate.id);
    if (!loaded.ok) {
      attachInFlightRef.current = false;
      setError(loaded.error);
      setFlow('error');
      return;
    }
    await attachAndReturn(loaded.document, 'saved_library');
  }

  function startShare() {
    if (!proposal || !slotKey) return;
    emitMealCreationEvent({
      event: 'meal_creation_share_started',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'secondary',
      reasonCodes: [...proposal.reasonCodes, 'share_what_you_are_having'],
      candidateCount: proposal.candidates.length,
      slotKey,
      selectedSource: 'share_new',
      attached: false,
    });
    setFlow('share');
  }

  function goToReview() {
    if (!slotKey) return;
    const built = buildSimpleMealDocument({ title: shareTitle, slotKey });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError('');
    setReviewDocument(built.document);
    setFlow('review');
  }

  async function confirmNewMeal() {
    if (!proposal || !slotKey || !reviewDocument || attachInFlightRef.current) return;
    attachInFlightRef.current = true;
    setFlow('working');
    const created = await createCanonicalSimpleMeal(reviewDocument);
    if (!created.ok) {
      attachInFlightRef.current = false;
      setError(created.error);
      setFlow('error');
      return;
    }
    emitMealCreationEvent({
      event: 'meal_creation_created',
      policyId: proposal.policyId,
      policyVersion: proposal.policyVersion,
      path: 'primary',
      reasonCodes: [...proposal.reasonCodes, 'canonical_meal_document'],
      candidateCount: proposal.candidates.length,
      slotKey,
      selectedSource: 'share_new',
      attached: false,
    });
    await attachAndReturn(created.document, 'share_new');
  }

  const occasionLabel = slotKey ? MEAL_SLOT_DEFAULT_LABELS[slotKey] : 'Meal';
  const backHref = returnHref(date, planId, returnTo);

  return (
    <div className="flex min-h-screen flex-col bg-[#000000] text-white">
      <div className="flex-1 overflow-y-auto pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        <StackedPageHero className="overflow-hidden bg-gradient-to-b from-neutral-900 to-brand-700 to-80%">
          <div className="relative z-10 mx-auto flex min-h-[220px] w-full max-w-[650px] flex-col justify-center px-6 pb-14 pt-12 sm:min-h-[240px]">
            <Link
              href={backHref}
              onClick={markAbandoned}
              className="text-xs text-white/60 hover:text-white/80"
            >
              ← Plans
            </Link>
            <h1 className="mt-4 max-w-[520px] text-4xl font-semibold tracking-[-0.03em] text-white antialiased sm:text-5xl">
              {occasionLabel}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-snug text-white/78 antialiased">
              {planId
                ? 'Pick a meal from your library, or share what you’re having.'
                : 'Pick or share a reusable meal. It is saved to your library, not added to a plan yet.'}
            </p>
          </div>
        </StackedPageHero>

        <StackedPageSection layer={1} className="bg-[#16110d] pb-24">
          {!slotKey && router.isReady ? (
            <p className="text-sm text-white/70">This flow needs a meal occasion.</p>
          ) : flow === 'loading' ? (
            <p className="text-sm text-white/55">Looking for meals in your library…</p>
          ) : flow === 'error' ? (
            <p className="text-sm text-red-300">{error || 'Something went wrong.'}</p>
          ) : flow === 'working' ? (
            <p className="text-sm text-white/55">Saving…</p>
          ) : flow === 'candidates' && proposal ? (
            <div className="space-y-4">
              {!planId ? (
                <p className="text-sm text-white/55">
                  Selecting a meal keeps it in your library. It is not added to a plan yet.
                </p>
              ) : null}
              {proposal.candidates.length > 0 ? (
                <div className="space-y-2">
                  {proposal.candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => void selectExisting(candidate)}
                      className="flex w-full items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3 text-left"
                    >
                      <span className="text-sm font-medium text-white">{candidate.title}</span>
                      <span className="text-[11px] text-white/40">
                        {candidate.reasonCodes.includes('occasion_intent_match')
                          ? 'Fits this occasion'
                          : 'In your library'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/55">
                  No saved meals to suggest yet. Share what you’re having.
                </p>
              )}
              <button
                type="button"
                onClick={startShare}
                className="w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black"
              >
                Share what you’re having
              </button>
              <button
                type="button"
                onClick={() => {
                  markAbandoned();
                  void router.push(backHref);
                }}
                className="w-full py-2 text-center text-sm text-white/45 hover:text-white/70"
              >
                Not now
              </button>
            </div>
          ) : flow === 'share' ? (
            <div className="space-y-4">
              <p className="text-sm text-white/70">
                A simple meal is enough. Example: Chicken + rice + broccoli.
              </p>
              <input
                value={shareTitle}
                onChange={(event) => setShareTitle(event.target.value)}
                placeholder="Share what you’re having"
                className="w-full rounded-full border border-white/10 bg-neutral-900 px-5 py-3 text-sm text-brand-50"
              />
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <button
                type="button"
                onClick={goToReview}
                className="w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black"
              >
                Review meal
              </button>
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setFlow('candidates');
                }}
                className="w-full py-2 text-center text-sm text-white/45"
              >
                Back to suggestions
              </button>
            </div>
          ) : flow === 'review' && reviewDocument ? (
            <div className="space-y-4">
              <p className="text-sm text-white/70">
                {planId
                  ? 'Review before saving this reusable meal.'
                  : 'This saves a reusable meal. It is not added to a plan yet.'}
              </p>
              <div className="rounded-2xl bg-white/[0.04] p-4 space-y-2">
                <p className="text-sm font-semibold text-white">{reviewDocument.title}</p>
                {reviewDocument.components.map((component) => (
                  <p key={component.component_id} className="text-sm text-white/60">
                    {component.name}
                  </p>
                ))}
                <p className="text-[11px] text-white/40">
                  Nutrition stays unknown until items are matched. That’s okay.
                </p>
              </div>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <button
                type="button"
                onClick={() => void confirmNewMeal()}
                className="w-full rounded-full bg-brand-50 py-3 text-center text-sm font-semibold text-black"
              >
                Save meal
              </button>
              <button
                type="button"
                onClick={() => setFlow('share')}
                className="w-full py-2 text-center text-sm text-white/45"
              >
                Change it
              </button>
            </div>
          ) : null}
        </StackedPageSection>
      </div>
      <JournalFooterNav />
    </div>
  );
}
