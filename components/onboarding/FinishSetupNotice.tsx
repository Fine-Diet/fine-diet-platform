'use client';

import { AppNotificationBar } from '@/components/app/AppNotificationBar';

interface FinishSetupNoticeProps {
  href: string;
  alignToContentColumn?: boolean;
}

/** Onboarding continuation — uses the shared app notification bar. */
export function FinishSetupNotice({
  href,
  alignToContentColumn,
}: FinishSetupNoticeProps) {
  return (
    <AppNotificationBar
      message="Finish setting up your profile"
      actionHref={href}
      actionLabel="Continue"
      alignToContentColumn={alignToContentColumn}
    />
  );
}
