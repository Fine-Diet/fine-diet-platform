'use client';

/**
 * NutritionTargetsOverlayProvider — context for opening the Nutrition
 * Targets overlay from anywhere under AppShell.
 *
 * Directly mirrors MealRhythmOverlayProvider (components/plans/rhythm/) —
 * same trigger/onSaved/opener-element contract, so AppShell, focus
 * restoration, and Log-refresh-on-save behave identically.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type NutritionTargetsTrigger = 'log';

export interface NutritionTargetsOverlayContext {
  openNutritionTargets: (opts: { trigger: NutritionTargetsTrigger; onSaved?: () => void }) => void;
  closeNutritionTargets: () => void;
  isOpen: boolean;
  trigger: NutritionTargetsTrigger | null;
  onSaved: (() => void) | null;
  openerElement: HTMLElement | null;
}

const Ctx = createContext<NutritionTargetsOverlayContext | null>(null);

export function useNutritionTargetsOverlay(): NutritionTargetsOverlayContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      openNutritionTargets: () => undefined,
      closeNutritionTargets: () => undefined,
      isOpen: false,
      trigger: null,
      onSaved: null,
      openerElement: null,
    };
  }
  return ctx;
}

export function NutritionTargetsOverlayProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [trigger, setTrigger] = useState<NutritionTargetsTrigger | null>(null);
  const [onSaved, setOnSaved] = useState<(() => void) | null>(null);
  const [openerElement, setOpenerElement] = useState<HTMLElement | null>(null);

  const openNutritionTargets = useCallback(
    (opts: { trigger: NutritionTargetsTrigger; onSaved?: () => void }) => {
      const active = document.activeElement;
      setOpenerElement(active instanceof HTMLElement ? active : null);
      setTrigger(opts.trigger);
      setOnSaved(() => opts.onSaved ?? null);
      setIsOpen(true);
    },
    [],
  );

  const closeNutritionTargets = useCallback(() => {
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
      value={{ openNutritionTargets, closeNutritionTargets, isOpen, trigger, onSaved, openerElement }}
    >
      {children}
    </Ctx.Provider>
  );
}
