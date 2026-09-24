'use client';

import type { ReactNode } from 'react';

import { SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS } from '@/components/layout/SignedInPageShell';
import { AppDialog } from '@/components/ui/AppDialog';
import { cn } from '@/lib/utils';

export type ItemManagementDialogShell = 'default' | 'workspace';

const DEFAULT_PANEL_CLASS =
  'flex max-h-[min(90dvh,880px)] max-w-[760px] flex-col border border-white/10 bg-[#211a14] p-0 shadow-2xl rounded-t-[28px] sm:rounded-[28px]';

const DEFAULT_BODY_CLASS = 'min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5';

const DEFAULT_FOOTER_CLASS =
  'sticky bottom-0 border-t border-white/[0.08] bg-[#211a14] px-5 py-4';

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
          SIGNED_IN_DESKTOP_DRAWER_LEFT_CLASS,
          'lg:items-start lg:justify-center lg:overflow-y-auto lg:p-0',
          'lg:bg-neutral-900/90 lg:backdrop-blur-md',
          'lg:top-[var(--app-chrome-offset,2.25rem)] lg:bottom-0',
        )}
        panelClassName={cn(
          DEFAULT_PANEL_CLASS,
          'lg:max-h-none lg:max-w-[800px] lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none',
          'lg:w-full lg:px-8 lg:pb-16 lg:pt-12',
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col lg:min-h-full">
          <div
            className={cn(
              DEFAULT_BODY_CLASS,
              'lg:overflow-visible lg:px-0 lg:pb-0 lg:pt-0',
            )}
          >
            {children}
          </div>
          <div
            className={cn(
              DEFAULT_FOOTER_CLASS,
              'lg:static lg:mt-10 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0',
            )}
          >
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
      panelClassName={cn(DEFAULT_PANEL_CLASS)}
    >
      <div className={DEFAULT_BODY_CLASS}>{children}</div>
      <div className={DEFAULT_FOOTER_CLASS}>{footer}</div>
    </AppDialog>
  );
}
