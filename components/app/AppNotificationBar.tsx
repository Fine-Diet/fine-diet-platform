'use client';

import Link from 'next/link';

import { cn } from '@/lib/utils';

/** Banner is 88px (2× h-11). Banner + app top nav (h-9) = 124px. */
export const APP_NOTIFICATION_BAR_HEIGHT_CLASS = 'h-[5.5rem]';
export const APP_CHROME_OFFSET = '2.25rem';
export const APP_CHROME_OFFSET_WITH_NOTICE = '7.75rem';
export const APP_CHROME_WITH_NOTICE_OFFSET_CLASS = 'pt-[7.75rem]';
export const APP_SIDEBAR_WITH_NOTICE_OFFSET_CLASS =
  'top-[5.5rem] h-[calc(100%-5.5rem)] lg:top-[7.75rem] lg:h-[calc(100vh-7.75rem)]';

export function AppNotificationBar({
  message,
  actionHref,
  actionLabel,
  alignToContentColumn = false,
}: {
  message: string;
  actionHref: string;
  actionLabel: string;
  /** Shift copy into the main column when the left drawer is visible. */
  alignToContentColumn?: boolean;
}) {
  return (
    <div
      className={`flex ${APP_NOTIFICATION_BAR_HEIGHT_CLASS} w-full items-center bg-black`}
    >
      <div
        className={cn(
          'flex h-full w-full items-center justify-center gap-3 px-4',
          'lg:pl-[calc(250px+1rem)]',
          alignToContentColumn && 'pl-[calc(250px+1rem)]',
        )}
      >
        <p className="text-base pt-[3px] text-white antialiased">{message}</p>
        <Link
          href={actionHref}
          className="shrink-0 rounded-full bg-white px-5 py-1 text-xs font-semibold text-black transition-colors hover:bg-white/90"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
