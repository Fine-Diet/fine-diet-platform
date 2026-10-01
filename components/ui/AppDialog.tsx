'use client';

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { useRegisterFoodContentPane } from '@/components/layout/foodContentPaneOverlay';
import { FOOD_CONTENT_PANE_FRAME_CLASS } from '@/components/layout/SignedInPageShell';
import { cn } from '@/lib/utils';
import { useAccessibleDialog } from './useAccessibleDialog';

export type AppDialogPresentation = 'dialog' | 'sheet';

export interface AppDialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  presentation?: AppDialogPresentation;
  labelledBy?: string;
  ariaLabel?: string;
  dismissOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  inertTargetRef?: RefObject<HTMLElement | null>;
  overlayClassName?: string;
  panelClassName?: string;
  /**
   * Food opt-in: backdrop fills the content pane below top chrome and to the
   * right of the persistent drawer. Default dialogs stay full-viewport.
   */
  contentPane?: boolean;
}

/**
 * Behavior-neutral signed-in dialog/sheet shell.
 *
 * Domain components own their colors and contents. This primitive owns the
 * app-chrome stacking level, responsive panel shape, safe area, and shared
 * accessibility behavior.
 */
export function AppDialog({
  open,
  onClose,
  children,
  presentation = 'dialog',
  labelledBy,
  ariaLabel,
  dismissOnBackdrop = true,
  closeOnEscape = true,
  inertTargetRef,
  overlayClassName,
  panelClassName,
  contentPane = false,
}: AppDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dialogOpen = open && (!contentPane || mounted);
  useRegisterFoodContentPane(dialogOpen && contentPane);

  useAccessibleDialog({
    open: dialogOpen,
    containerRef: panelRef,
    onDismiss: onClose,
    closeOnEscape,
    inertTargetRef,
  });

  if (!dialogOpen) return null;

  const overlay = (
    <div
      className={cn(
        contentPane
          ? FOOD_CONTENT_PANE_FRAME_CLASS
          : 'fixed inset-0 z-[90] flex justify-center bg-black/70 backdrop-blur-sm',
        !contentPane && (presentation === 'dialog'
          ? 'items-end p-3 sm:items-center sm:p-5'
          : 'items-end'),
        !contentPane && 'pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-5',
        overlayClassName,
      )}
      role="presentation"
      onMouseDown={(event) => {
        if (
          dismissOnBackdrop &&
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        className={cn(
          'relative max-h-[90dvh] w-full overflow-y-auto outline-none',
          presentation === 'dialog'
            ? 'max-w-lg rounded-t-[28px] sm:rounded-[28px]'
            : 'max-w-2xl rounded-t-[28px]',
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );

  if (contentPane && typeof document !== 'undefined') {
    return createPortal(overlay, document.body);
  }

  return overlay;
}
