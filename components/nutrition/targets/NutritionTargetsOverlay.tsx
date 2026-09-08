'use client';

/**
 * NutritionTargetsOverlay — full-composition overlay for the Nutrition
 * Targets flow, delivered "in a modal/overlay interaction modeled on the
 * established Meal Rhythm interaction pattern" (governing doc, "Delivery:
 * shared modal/overlay interaction"). Directly mirrors
 * components/plans/rhythm/MealRhythmOverlay.tsx: same content-area bounds,
 * z-index, focus trap, and escape/dismiss rules — reusing the established
 * overlay/shell conventions rather than introducing a second modal
 * architecture.
 *
 * On Done → closes overlay + calls onSaved callback (Log home refetches
 * goals immediately).
 */

import { useId, useRef } from 'react';
import { useNutritionTargetsController } from './useNutritionTargetsController';
import { NutritionTargetsActivityStep } from './NutritionTargetsActivityStep';
import { NutritionTargetsSummary } from './NutritionTargetsSummary';
import { NutritionTargetsEditor } from './NutritionTargetsEditor';
import { NutritionTargetsConfirm } from './NutritionTargetsConfirm';
import { useNutritionTargetsOverlay } from './NutritionTargetsOverlayProvider';
import { useAccessibleDialog } from '@/components/ui/useAccessibleDialog';
import {
  APP_CHROME_OFFSET,
  APP_CHROME_OFFSET_WITH_NOTICE,
} from '@/components/app/AppNotificationBar';
// Shares the same content-area bounds class as Meal Rhythm — one overlay
// convention, not a second modal architecture.
import { MEAL_RHYTHM_OVERLAY_CONTENT_LEFT_CLASS } from '@/components/plans/rhythm/MealRhythmOverlay';

function NutritionTargetsOverlayContent({ onClose, onSaved }: { onClose: () => void; onSaved: (() => void) | null }) {
  const ctrl = useNutritionTargetsController();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  function dismissWithoutSave() {
    if (ctrl.phase === 'confirm') return;
    onClose();
  }

  useAccessibleDialog({
    open: true,
    containerRef: panelRef,
    onDismiss: dismissWithoutSave,
    closeOnEscape: ctrl.phase !== 'confirm',
    // Preserve the established full-content overlay scroll behavior.
    lockBodyScroll: false,
    focusKey: ctrl.phase,
  });

  function handleDone() {
    onSaved?.();
    onClose();
  }

  const showClose = ctrl.phase !== 'confirm';
  const isConfirm = ctrl.phase === 'confirm';

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="relative flex min-h-full w-full flex-col outline-none"
      aria-labelledby={titleId}
    >
      {showClose ? (
        <button
          type="button"
          onClick={dismissWithoutSave}
          className="absolute right-4 top-3 z-10 inline-flex h-8 w-8 items-center justify-center text-xl leading-none text-white/35 hover:text-white/60"
          aria-label="Close nutrition targets setup"
        >
          ×
        </button>
      ) : null}

      <div
        className={`mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 ${
          isConfirm ? 'pb-10 pt-16' : 'pb-10 pt-12'
        }`}
      >
        {ctrl.phase === 'loading' ? (
          <p id={titleId} className="text-sm text-white/55">
            Preparing your nutrition targets…
          </p>
        ) : ctrl.phase === 'error' ? (
          <div className="space-y-6">
            <p id={titleId} className="text-sm text-red-300">
              {ctrl.error || 'Could not load your nutrition targets.'}
            </p>
            <button
              type="button"
              onClick={dismissWithoutSave}
              className="w-full rounded-2xl border border-white/15 py-3.5 text-center text-sm font-semibold text-white hover:border-white/30"
            >
              Close
            </button>
          </div>
        ) : ctrl.phase === 'confirm' ? (
          <div id={titleId} className="flex min-h-[min(70vh,520px)] flex-1 flex-col">
            <NutritionTargetsConfirm onDone={handleDone} />
          </div>
        ) : ctrl.phase === 'activity' ? (
          <div id={titleId}>
            <NutritionTargetsActivityStep onChoose={ctrl.chooseActivity} disabled={ctrl.saving} />
          </div>
        ) : ctrl.phase === 'edit' ? (
          <div className="space-y-6">
            <div>
              <h2
                id={titleId}
                className="text-[1.65rem] font-light leading-tight tracking-[-0.02em] text-white antialiased sm:text-[1.85rem]"
              >
                Adjust your targets
              </h2>
              <p className="mt-2 text-sm text-white/50 antialiased">
                Set your own calorie target and, if you&apos;d like, macro targets.
              </p>
            </div>

            <NutritionTargetsEditor
              calories={ctrl.draftCalories}
              macros={ctrl.draftMacros}
              onChangeCalories={ctrl.updateDraftCalories}
              onChangeMacro={ctrl.updateDraftMacro}
              disabled={ctrl.saving}
            />

            {ctrl.error ? <p className="text-sm text-red-300">{ctrl.error}</p> : null}

            <button
              type="button"
              disabled={ctrl.saving || ctrl.draftCalories == null}
              onClick={() => void ctrl.saveEdit()}
              className="w-full rounded-2xl bg-neutral-200 py-3.5 text-center text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-50"
            >
              {ctrl.saving ? 'Saving…' : 'Save targets'}
            </button>

            <button
              type="button"
              disabled={ctrl.saving}
              onClick={ctrl.backToReview}
              className="w-full rounded-2xl border border-white/15 py-3.5 text-center text-sm font-semibold text-white hover:border-white/30 disabled:opacity-50"
            >
              Back to estimate
            </button>
          </div>
        ) : (
          <div id={titleId}>
            <NutritionTargetsSummary
              maintenanceCalories={ctrl.estimate?.maintenanceCalories ?? null}
              onLooksGood={() => void ctrl.acceptEstimate()}
              onAdjust={ctrl.startEditing}
              saving={ctrl.saving}
              error={ctrl.error}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function NutritionTargetsOverlay({
  hasFinishSetupNotice = false,
}: {
  hasFinishSetupNotice?: boolean;
}) {
  const { isOpen, onSaved, closeNutritionTargets } = useNutritionTargetsOverlay();

  if (!isOpen) return null;

  const topOffset = hasFinishSetupNotice ? APP_CHROME_OFFSET_WITH_NOTICE : APP_CHROME_OFFSET;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nutrition targets setup"
      className={`fixed bottom-0 right-0 z-[51] overflow-y-auto bg-[#16110d] text-white [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${MEAL_RHYTHM_OVERLAY_CONTENT_LEFT_CLASS}`}
      style={{ top: topOffset }}
    >
      <NutritionTargetsOverlayContent onClose={closeNutritionTargets} onSaved={onSaved} />
    </div>
  );
}
