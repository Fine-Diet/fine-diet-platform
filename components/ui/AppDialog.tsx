'use client';

import {
  type ReactNode,
  type RefObject,
  useRef,
} from 'react';

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
}: AppDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useAccessibleDialog({
    open,
    containerRef: panelRef,
    onDismiss: onClose,
    closeOnEscape,
    inertTargetRef,
  });

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[90] flex justify-center bg-black/70 backdrop-blur-sm',
        presentation === 'dialog'
          ? 'items-end p-3 sm:items-center sm:p-5'
          : 'items-end',
        'pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-5',
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
}
