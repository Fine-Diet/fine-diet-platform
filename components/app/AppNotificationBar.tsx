'use client';

import Link from 'next/link';

/** Banner height (h-11) + app top nav (h-9) = 80px. */
export const APP_NOTIFICATION_BAR_HEIGHT_CLASS = 'h-11';
export const APP_CHROME_WITH_NOTICE_OFFSET_CLASS = 'pt-20';
export const APP_SIDEBAR_WITH_NOTICE_OFFSET_CLASS =
  'top-11 h-[calc(100%-2.75rem)] lg:top-20 lg:h-[calc(100vh-5rem)]';

export function AppNotificationBar({
  message,
  actionHref,
  actionLabel,
}: {
  message: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div
      className={`flex ${APP_NOTIFICATION_BAR_HEIGHT_CLASS} w-full items-center justify-center gap-3 bg-black px-4`}
    >
      <p className="text-sm text-white antialiased">{message}</p>
      <Link
        href={actionHref}
        className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-white/90"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
