'use client';

import type { ReactNode } from 'react';

import { AppDialog } from '@/components/ui/AppDialog';

/**
 * Shared full-viewport shell for contexts that compose a MealDocument.
 * Plans owns Save-to-plan behavior today; a future Log surface can reuse
 * this shell while injecting its own draft/commit behavior.
 */
export function FullScreenMealComposerShell({
  open,
  title,
  context,
  onClose,
  children,
  submitting = false,
}: {
  open: boolean;
  title: string;
  context: string;
  onClose: () => void;
  children: ReactNode;
  submitting?: boolean;
}) {
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      ariaLabel={title}
      dismissOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      overlayClassName="items-stretch p-0 pb-0 sm:items-stretch sm:p-0 sm:pb-0"
      panelClassName="h-[100dvh] max-h-[100dvh] max-w-none rounded-none border-0 bg-[#16110d]"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[#16110d]/95 px-5 py-4 backdrop-blur sm:px-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
            {context}
          </p>
          <h2 className="truncate text-xl font-semibold text-white">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
      <div className="mx-auto w-full max-w-3xl px-5 py-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] sm:px-8 sm:py-8">
        {children}
      </div>
    </AppDialog>
  );
}
