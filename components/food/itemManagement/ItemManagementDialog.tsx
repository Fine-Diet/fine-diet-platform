'use client';

import type { ReactNode } from 'react';

import { SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS } from '@/components/layout/SignedInPageShell';
import { AppDialog } from '@/components/ui/AppDialog';
import { cn } from '@/lib/utils';

export type ItemManagementDialogShell = 'default' | 'workspace';

export interface ItemManagementDialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  busy?: boolean;
  children: ReactNode;
  footer: ReactNode;
  /** Lists/Hauls use default. Pantry purchase editor opts into workspace shell. */
  shell?: ItemManagementDialogShell;
}

/**
 * Wide signed-in item-management shell (~760px) with scroll body and sticky footer.
 */
export function ItemManagementDialog({
  open,
  onClose,
  labelledBy,
  busy = false,
  children,
  footer,
  shell = 'default',
}: ItemManagementDialogProps) {
  if (shell === 'workspace') {
    return (
      <AppDialog
        open={open}
        onClose={() => !busy && onClose()}
        labelledBy={labelledBy}
        overlayClassName={cn(
          'items-start justify-center overflow-y-auto p-0 sm:p-0',
          'bg-neutral-900/90 backdrop-blur-md',
          'top-[var(--app-chrome-offset,2.25rem)] bottom-0 left-0 right-0',
          SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS,
        )}
        panelClassName={cn(
          'max-h-none max-w-[800px] overflow-visible rounded-none border-0 bg-transparent shadow-none',
          'w-full px-5 pb-10 pt-8 sm:px-8 sm:pb-16 sm:pt-12',
        )}
      >
        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1">{children}</div>
          <div className="mt-10 max-sm:sticky max-sm:bottom-0 max-sm:border-t max-sm:border-white/[0.08] max-sm:bg-[#16110d] max-sm:py-4 max-sm:-mx-5 max-sm:px-5">
            {footer}
          </div>
        </div>
      </AppDialog>
    );
  }

  return (
    <AppDialog
      open={open}
      onClose={() => !busy && onClose()}
      labelledBy={labelledBy}
      panelClassName={cn(
        'flex max-h-[min(90dvh,880px)] max-w-[760px] flex-col border border-white/10 bg-[#211a14] p-0 shadow-2xl',
        'rounded-t-[28px] sm:rounded-[28px]',
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5">{children}</div>
      <div className="sticky bottom-0 border-t border-white/[0.08] bg-[#211a14] px-5 py-4">
        {footer}
      </div>
    </AppDialog>
  );
}
