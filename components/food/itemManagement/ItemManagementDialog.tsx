'use client';

import type { ReactNode } from 'react';

import { AppDialog } from '@/components/ui/AppDialog';
import { cn } from '@/lib/utils';

export interface ItemManagementDialogProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  busy?: boolean;
  children: ReactNode;
  footer: ReactNode;
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
}: ItemManagementDialogProps) {
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
