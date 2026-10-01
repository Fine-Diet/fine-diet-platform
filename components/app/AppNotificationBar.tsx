'use client';

import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * Setup notice is a fixed 5.5rem bar. The top nav keeps its original
 * border-box row: h-9 with py-6 uses 3rem, plus the 1px header border.
 * Page clearance, the drawer, and Food overlays read one measured
 * `--app-chrome-offset`; these lengths are the pre-measurement fallback.
 */
export const APP_NOTIFICATION_BAR_HEIGHT_CLASS = 'h-[5.5rem]';
export const APP_NOTICE_HEIGHT = '5.5rem';
export const APP_TOP_NAV_HEIGHT = 'calc(3rem + 1px)';
export const APP_CHROME_OFFSET = APP_TOP_NAV_HEIGHT;
export const APP_CHROME_OFFSET_WITH_NOTICE = `calc(${APP_NOTICE_HEIGHT} + ${APP_TOP_NAV_HEIGHT})`;
export const APP_CHROME_OFFSET_CLASS = 'pt-[var(--app-chrome-offset,calc(3rem+1px))]';
export const APP_CHROME_WITH_NOTICE_OFFSET_CLASS = APP_CHROME_OFFSET_CLASS;
export const APP_SIDEBAR_WITH_NOTICE_OFFSET_CLASS =
  'top-[var(--app-chrome-offset,calc(8.5rem+1px))] h-[calc(100%-var(--app-chrome-offset,calc(8.5rem+1px)))] lg:h-[calc(100vh-var(--app-chrome-offset,calc(8.5rem+1px)))]';

export function AppNotificationBar({
  message,
  actionHref,
  actionLabel,
  actionOnClick,
  alignToContentColumn = false,
}: {
  message: string;
  actionHref?: string;
  actionLabel: string;
  /** Prefer over href when the action should stay in-place (e.g. open overlay). */
  actionOnClick?: () => void;
  /** Shift copy into the main column when the left drawer is visible. */
  alignToContentColumn?: boolean;
}) {
  const actionClass =
    'shrink-0 rounded-full bg-white px-5 py-1 text-xs font-semibold text-black transition-colors hover:bg-white/90';

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
        {actionOnClick ? (
          <button type="button" onClick={actionOnClick} className={actionClass}>
            {actionLabel}
          </button>
        ) : (
          <Link href={actionHref ?? '#'} className={actionClass}>
            {actionLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
