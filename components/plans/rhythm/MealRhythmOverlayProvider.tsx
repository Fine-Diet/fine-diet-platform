'use client';

/**
 * MealRhythmOverlayProvider — context for opening the Meal Rhythm overlay
 * from anywhere under AppShell.
 *
 * Desktop: scrim covers content area only (lg:left-[250px]), topnav stays
 * visible but inert while overlay open. Footer sits under scrim. No backdrop blur.
 * Mobile: full content area under topnav.
 * Outside click does NOT dismiss. Escape closes review/edit/error, not confirm.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type MealRhythmTrigger = 'plans' | 'plans_today' | 'plans_week' | 'home';

export interface MealRhythmOverlayContext {
  openMealRhythm: (opts: { trigger: MealRhythmTrigger; onSaved?: () => void }) => void;
  closeMealRhythm: () => void;
  isOpen: boolean;
  trigger: MealRhythmTrigger | null;
  onSaved: (() => void) | null;
  /** Element that opened the overlay; restored on close when still in document. */
  openerElement: HTMLElement | null;
}

const Ctx = createContext<MealRhythmOverlayContext | null>(null);

export function useMealRhythmOverlay(): MealRhythmOverlayContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      openMealRhythm: () => undefined,
      closeMealRhythm: () => undefined,
      isOpen: false,
      trigger: null,
      onSaved: null,
      openerElement: null,
    };
  }
  return ctx;
}

export function MealRhythmOverlayProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [trigger, setTrigger] = useState<MealRhythmTrigger | null>(null);
  const [onSaved, setOnSaved] = useState<(() => void) | null>(null);
  const [openerElement, setOpenerElement] = useState<HTMLElement | null>(null);

  const openMealRhythm = useCallback(
    (opts: { trigger: MealRhythmTrigger; onSaved?: () => void }) => {
      const active = document.activeElement;
      setOpenerElement(active instanceof HTMLElement ? active : null);
      setTrigger(opts.trigger);
      setOnSaved(() => opts.onSaved ?? null);
      setIsOpen(true);
    },
    [],
  );

  const closeMealRhythm = useCallback(() => {
    setIsOpen(false);
    setTrigger(null);
    setOnSaved(null);
    setOpenerElement((prev) => {
      if (prev && document.contains(prev)) {
        window.requestAnimationFrame(() => prev.focus());
      }
      return null;
    });
  }, []);

  return (
    <Ctx.Provider
      value={{ openMealRhythm, closeMealRhythm, isOpen, trigger, onSaved, openerElement }}
    >
      {children}
    </Ctx.Provider>
  );
}
