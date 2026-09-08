'use client';

import {
  type RefObject,
  useEffect,
  useRef,
} from 'react';

export const APP_DIALOG_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getDialogFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(APP_DIALOG_FOCUSABLE_SELECTOR),
  ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);
}

interface UseAccessibleDialogOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  closeOnEscape?: boolean;
  lockBodyScroll?: boolean;
  /**
   * Re-focus the first available control when a multi-step dialog changes
   * phase. The original trigger is restored only when the dialog closes.
   */
  focusKey?: unknown;
  /** Optional app-content element to make inert while the dialog is open. */
  inertTargetRef?: RefObject<HTMLElement | null>;
}

/**
 * Shared accessibility behavior for signed-in dialogs, sheets, and full
 * content-area overlays: focus containment/restoration, Escape dismissal,
 * optional background inerting, and optional body scroll locking.
 */
export function useAccessibleDialog({
  open,
  containerRef,
  onDismiss,
  closeOnEscape = true,
  lockBodyScroll = true,
  focusKey,
  inertTargetRef,
}: UseAccessibleDialogOptions) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousBodyOverflow = document.body.style.overflow;
    const inertTarget = inertTargetRef?.current ?? null;
    const targetWasInert = inertTarget?.hasAttribute('inert') ?? false;

    if (lockBodyScroll) document.body.style.overflow = 'hidden';
    if (inertTarget) inertTarget.setAttribute('inert', '');

    return () => {
      if (lockBodyScroll) document.body.style.overflow = previousBodyOverflow;
      if (inertTarget && !targetWasInert) inertTarget.removeAttribute('inert');
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [inertTargetRef, lockBodyScroll, open]);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const focusables = getDialogFocusableElements(container);
    (focusables[0] ?? container).focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        dismissRef.current();
      }
    }

    function handleTabKey(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !containerRef.current) return;

      const items = getDialogFocusableElements(containerRef.current);
      if (items.length === 0) {
        event.preventDefault();
        containerRef.current.focus();
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !containerRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !containerRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleEscape);
    container.addEventListener('keydown', handleTabKey);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      container.removeEventListener('keydown', handleTabKey);
    };
  }, [closeOnEscape, containerRef, focusKey, open]);
}
