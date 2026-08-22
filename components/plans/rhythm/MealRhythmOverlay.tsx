'use client';

/**
 * MealRhythmOverlay — full-composition overlay for the Meal Rhythm flow.
 *
 * Desktop layering:
 *   - Scrim covers content area only (left-0 lg:left-[250px]), NOT the left rail
 *   - Scrim starts below topnav so topnav stays visually above the scrim
 *   - Topnav/main/side chrome are inert while open (AppShell + focus trap)
 *   - Footer sits under scrim
 *   - No backdrop blur
 *   - Outside click does NOT dismiss
 *   - Escape closes review/edit/error but NOT confirm
 *   - Explicit close control on non-confirm states
 *
 * On Done → closes overlay + calls onSaved callback if set.
 */

import { useEffect, useId, useRef } from 'react';
import { useMealRhythmController } from './useMealRhythmController';
import { MealRhythmSummary } from './MealRhythmSummary';
import { MealRhythmEditor } from './MealRhythmEditor';
import { MealRhythmConfirm } from './MealRhythmConfirm';
import { useMealRhythmOverlay } from './MealRhythmOverlayProvider';
import {
  APP_CHROME_OFFSET,
  APP_CHROME_OFFSET_WITH_NOTICE,
} from '@/components/app/AppNotificationBar';

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
}

function MealRhythmOverlayContent({
  triggerContext,
  onClose,
  onSaved,
}: {
  triggerContext: string;
  onClose: () => void;
  onSaved: (() => void) | null;
}) {
  const ctrl = useMealRhythmController({ acceptTriggerContext: triggerContext });
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  function dismissWithoutSave() {
    if (ctrl.phase === 'confirm') return;
    if (ctrl.phase === 'review' || ctrl.phase === 'edit') {
      ctrl.cancel();
    }
    onClose();
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (ctrl.phase === 'confirm') return;
      if (
        ctrl.phase === 'review' ||
        ctrl.phase === 'edit' ||
        ctrl.phase === 'loading' ||
        ctrl.phase === 'error'
      ) {
        event.preventDefault();
        dismissWithoutSave();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismiss uses current phase/cancel
  }, [ctrl.phase, ctrl.cancel, onClose]);

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

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="w-full max-w-[480px] mx-auto px-6 py-8 outline-none"
      aria-labelledby={titleId}
    >
      {showClose ? (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={dismissWithoutSave}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-lg leading-none text-white/70 hover:border-white/40 hover:text-white"
            aria-label="Close meal rhythm"
          >
            ×
          </button>
        </div>
      ) : null}

      {ctrl.phase === 'loading' ? (
        <p id={titleId} className="text-sm text-white/55">
          Preparing your rhythm…
        </p>
      ) : ctrl.phase === 'error' ? (
        <div className="space-y-4">
          <p id={titleId} className="text-sm text-red-300">
            {ctrl.error || 'Could not load your meal rhythm.'}
          </p>
          <button
            type="button"
            onClick={dismissWithoutSave}
            className="w-full rounded-full border border-white/15 py-3 text-center text-sm font-semibold text-white hover:border-white/30"
          >
            Close
          </button>
        </div>
      ) : ctrl.phase === 'confirm' ? (
        <div id={titleId}>
          <MealRhythmConfirm onDone={handleDone} />
        </div>
      ) : ctrl.phase === 'edit' ? (
        <div className="space-y-5">
          <div>
            <h2 id={titleId} className="text-xl font-semibold text-white antialiased">
              Edit your rhythm
            </h2>
            <p className="mt-1 text-sm text-white/55 antialiased">
              Toggle occasions on or off and adjust times.
            </p>
          </div>

          {ctrl.draft ? (
            <MealRhythmEditor
              draft={ctrl.draft}
              onUpdateSlot={ctrl.updateSlot}
              disabled={ctrl.saving}
            />
          ) : null}

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
        <div id={titleId}>
          <MealRhythmSummary
            schedule={ctrl.draft}
            onLooksGood={() => void ctrl.persist()}
            onEdit={ctrl.startEditing}
            saving={ctrl.saving}
            error={ctrl.error}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Content-area bounds: mobile full-bleed left; desktop leaves 250px rail outside. */
export const MEAL_RHYTHM_OVERLAY_CONTENT_LEFT_CLASS = 'left-0 lg:left-[250px]';

export function MealRhythmOverlay({
  hasFinishSetupNotice = false,
}: {
  hasFinishSetupNotice?: boolean;
}) {
  const { isOpen, trigger, onSaved, closeMealRhythm } = useMealRhythmOverlay();

  if (!isOpen) return null;

  const topOffset = hasFinishSetupNotice ? APP_CHROME_OFFSET_WITH_NOTICE : APP_CHROME_OFFSET;

  return (
    <>
      {/* Scrim — content area only, below topnav, outside left rail */}
      <div
        aria-hidden
        className={`fixed bottom-0 right-0 z-50 bg-black/50 ${MEAL_RHYTHM_OVERLAY_CONTENT_LEFT_CLASS}`}
        style={{ top: topOffset }}
      />

      {/* Panel — same content-area bounds; outside click does not dismiss */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Meal Rhythm setup"
        className={`fixed bottom-0 right-0 z-[51] flex items-start justify-center overflow-y-auto pb-24 pt-6 ${MEAL_RHYTHM_OVERLAY_CONTENT_LEFT_CLASS}`}
        style={{ top: topOffset }}
      >
        <div className="w-full rounded-3xl bg-[#16110d] text-white shadow-2xl lg:max-w-[540px]">
          <MealRhythmOverlayContent
            triggerContext={trigger ?? 'overlay'}
            onClose={closeMealRhythm}
            onSaved={onSaved}
          />
        </div>
      </div>
    </>
  );
}
