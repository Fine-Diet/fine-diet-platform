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

import { useEffect, useId, useRef } from 'react';
import { useNutritionTargetsController } from './useNutritionTargetsController';
import { NutritionTargetsActivityStep } from './NutritionTargetsActivityStep';
import { NutritionTargetsSummary } from './NutritionTargetsSummary';
import { NutritionTargetsEditor } from './NutritionTargetsEditor';
import { NutritionTargetsConfirm } from './NutritionTargetsConfirm';
import { useNutritionTargetsOverlay } from './NutritionTargetsOverlayProvider';
import {
  APP_CHROME_OFFSET,
  APP_CHROME_OFFSET_WITH_NOTICE,
} from '@/components/app/AppNotificationBar';
// Shares the same content-area bounds class as Meal Rhythm — one overlay
// convention, not a second modal architecture.
import { MEAL_RHYTHM_OVERLAY_CONTENT_LEFT_CLASS } from '@/components/plans/rhythm/MealRhythmOverlay';

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
}

function NutritionTargetsOverlayContent({ onClose, onSaved }: { onClose: () => void; onSaved: (() => void) | null }) {
  const ctrl = useNutritionTargetsController();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  function dismissWithoutSave() {
    if (ctrl.phase === 'confirm') return;
    onClose();
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (ctrl.phase === 'confirm') return;
      event.preventDefault();
      dismissWithoutSave();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismiss uses current phase
  }, [ctrl.phase, onClose]);

  // Initial focus + Tab trap inside dialog
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const focusables = getFocusable(panel);
    const initial = focusables[0] ?? panel;
    initial.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = getFocusable(panelRef.current);
      if (items.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panelRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [ctrl.phase]);

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
