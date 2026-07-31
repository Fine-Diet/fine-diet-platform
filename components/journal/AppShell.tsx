'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import { AppTopNav } from './AppTopNav';
import { AppSideMenu } from './AppSideMenu';
import { FinishSetupNotice } from '@/components/onboarding/FinishSetupNotice';
import {
  buildOnboardingResumeHref,
  isAppHomePathForFinishSetup,
} from '@/lib/onboarding/onboardingGate';
import { deriveOnboardingState } from '@/lib/onboarding/onboardingState';

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
  const showHomeNotice = showFinishSetup && isAppHomePathForFinishSetup(pathOnly);
  const resumeHref = buildOnboardingResumeHref(pathOnly);

  return (
    <div className="min-h-screen bg-brand-900 text-white pt-9">
      <AppTopNav drawerOpen={drawerOpen} onOpenDrawer={() => setDrawerOpen(true)} />
      <AppSideMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      {/* Offset page content for the persistent desktop sidebar. */}
      <div className="lg:pl-[250px]">
        {showHomeNotice ? <FinishSetupNotice href={resumeHref} /> : null}
        {children}
      </div>
    </div>
  );
}
