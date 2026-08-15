'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import { AppTopNav } from './AppTopNav';
import { AppSideMenu } from './AppSideMenu';
import {
  APP_CHROME_OFFSET,
  APP_CHROME_OFFSET_WITH_NOTICE,
  APP_CHROME_WITH_NOTICE_OFFSET_CLASS,
} from '@/components/app/AppNotificationBar';
import { FinishSetupNotice } from '@/components/onboarding/FinishSetupNotice';
import { buildOnboardingResumeHref } from '@/lib/onboarding/onboardingGate';
import { deriveOnboardingState } from '@/lib/onboarding/onboardingState';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showFinishSetup, setShowFinishSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/journal/profile', { credentials: 'include' });
        if (!res.ok) return;
        const data = (await res.json()) as { profile?: Record<string, unknown> };
        if (cancelled) return;
        setShowFinishSetup(deriveOnboardingState(data.profile).showFinishSetup);
      } catch {
        // Non-fatal: notice is optional UX.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pathOnly = router.asPath.split('?')[0].split('#')[0];
  const resumeHref = buildOnboardingResumeHref(pathOnly);

  return (
    <div
      className={cn(
        'min-h-screen bg-brand-900 text-white',
        showFinishSetup ? APP_CHROME_WITH_NOTICE_OFFSET_CLASS : 'pt-9',
      )}
      style={{
        ['--app-chrome-offset' as string]: showFinishSetup
          ? APP_CHROME_OFFSET_WITH_NOTICE
          : APP_CHROME_OFFSET,
      }}
    >
      {showFinishSetup ? (
        <div className="fixed top-0 left-0 right-0 z-[90]">
          <FinishSetupNotice href={resumeHref} alignToContentColumn={drawerOpen} />
        </div>
      ) : null}
      <div
        className={cn(
          'fixed left-0 right-0 z-40',
          showFinishSetup ? 'top-[5.5rem]' : 'top-0',
        )}
      >
        <AppTopNav drawerOpen={drawerOpen} onOpenDrawer={() => setDrawerOpen(true)} />
      </div>
      <AppSideMenu
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        hasFinishSetupNotice={showFinishSetup}
      />
      <div className="lg:pl-[250px]">{children}</div>
    </div>
  );
}
