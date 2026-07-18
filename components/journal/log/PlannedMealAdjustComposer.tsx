'use client';

/**
 * Packet 2 — Pre-log actual-consumption composer for a planned meal snapshot.
 *
 * Edits a MealDocument snapshot in memory only. Submitting writes one grouped
 * journal entry via log_adjusted and never mutates the planned meal payload.
 *
 * Plans Authoring Convergence — Phase 2: migrated onto the shared Meal
 * Composer (mode='adjust-and-log') to prove the extraction. Component-list
 * editing (add/remove/move/duplicate/food-search) now goes through the
 * shared engine (lib/meals/composer/*), which is exactly the same underlying
 * MealComponent[] shape this surface always used. Submission STILL goes
 * through the existing, unchanged lib/plans/plannedMealAdjustDerivation.ts
 * (deriveAdjustedConsumption) and planService.executeMeal(..., 'log_adjusted',
 * ...) — this phase does not touch planned-meal execution or idempotency.
 */
import { useCallback, useMemo, useReducer, useState } from 'react';
import { useRouter } from 'next/router';

import { MealComposer, type MealComposerActionHandlers } from '@/components/meals/composer/MealComposer';
import { plannedMealToMealDocument } from '@/lib/meals/adapters';
import { composerReducer, createComposerState } from '@/lib/meals/composer/state';
import { planService, type PlannedMeal } from '@/lib/plans';
import {
  deriveAdjustedConsumption,
  formatConsumedNutritionPreview,
} from '@/lib/plans/plannedMealAdjustDerivation';

function toOccurredAtIso(dateKey: string, time: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const occurred = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isFinite(hh) && Number.isFinite(mm)) {
    occurred.setHours(hh, mm, 0, 0);
  }
  return occurred.toISOString();
}

export interface PlannedMealAdjustComposerProps {
  plannedMeal: PlannedMeal;
  dateKey: string;
  time: string;
  redirectTarget: string;
  onLogged?: () => void;
}

export function PlannedMealAdjustComposer({
  plannedMeal,
  dateKey,
  time,
  redirectTarget,
  onLogged,
}: PlannedMealAdjustComposerProps) {
  const router = useRouter();
  const baseDocument = useMemo(
    () => plannedMealToMealDocument(plannedMeal),
    [plannedMeal],
  );

  const [state, dispatch] = useReducer(
    composerReducer,
    createComposerState('adjust-and-log', baseDocument, { consumedServingsInput: '1' }),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedServings = Number(state.consumedServingsInput);
  const servingsValid = Number.isFinite(parsedServings) && parsedServings > 0;
  const nameValid = state.document.title.trim().length > 0;

  // Single source of truth for both the preview and the submitted payload —
  // unchanged from the pre-migration implementation.
  const derivation = useMemo(
    () =>
      deriveAdjustedConsumption({
        baseDocument,
        title: state.document.title,
        components: state.document.components,
        consumedServings: servingsValid ? parsedServings : 1,
        note: state.instanceNote.trim() || null,
      }),
    [baseDocument, state.document.title, state.document.components, state.instanceNote, parsedServings, servingsValid],
  );

  const previewLabel = formatConsumedNutritionPreview(derivation.consumedNutrition, derivation.needsReview);

  const handleSubmit = useCallback(async () => {
    if (!servingsValid || !nameValid) {
      setError('Enter a meal name and servings greater than 0.');
      return;
    }
    if (derivation.needsReview) {
      setError('Nutrition needs review — adjust components or match foods before logging.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await planService.executeMeal(
        plannedMeal.id,
        'log_adjusted',
        toOccurredAtIso(dateKey, time),
        derivation.intakePayload,
      );
      onLogged?.();
      await router.push(redirectTarget);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to log adjusted meal.');
    } finally {
      setSubmitting(false);
    }
  }, [servingsValid, nameValid, derivation, plannedMeal.id, dateKey, time, onLogged, router, redirectTarget]);

  const actions: MealComposerActionHandlers = {
    log_adjusted: {
      disabled: !servingsValid || !nameValid || derivation.needsReview,
      onRun: handleSubmit,
    },
  };

  return (
    <div className="px-6 pt-2 pb-4">
      <div className="rounded-2xl border border-brand-200/40 bg-brand-900/60 p-4">
        <MealComposer
          state={state}
          dispatch={dispatch}
          actions={actions}
          headerTitle="Adjust & log actual consumption"
          helperText="Changes here record what you ate. Your plan stays unchanged unless you use Edit plan."
          error={error}
          nutritionPreview={previewLabel}
          submitting={submitting}
        />
      </div>
    </div>
  );
}

export default PlannedMealAdjustComposer;
