'use client';

import { AppNotificationBar } from '@/components/app/AppNotificationBar';

interface FinishSetupNoticeProps {
  href: string;
}

/** Onboarding continuation — uses the shared app notification bar. */
export function FinishSetupNotice({ href }: FinishSetupNoticeProps) {
  return (
    <AppNotificationBar
      message="Finish setting up your profile"
      actionHref={href}
      actionLabel="Continue"
    />
  );
}
