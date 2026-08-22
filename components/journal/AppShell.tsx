'use client';

import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
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
import {
  MealRhythmOverlayProvider,
  useMealRhythmOverlay,
} from '@/components/plans/rhythm/MealRhythmOverlayProvider';
import { MealRhythmOverlay } from '@/components/plans/rhythm/MealRhythmOverlay';
import {
  NutritionTargetsOverlayProvider,
  useNutritionTargetsOverlay,
} from '@/components/nutrition/targets/NutritionTargetsOverlayProvider';
import { NutritionTargetsOverlay } from '@/components/nutrition/targets/NutritionTargetsOverlay';

interface AppShellProps {
  children: ReactNode;
}

/** `inert` removes keyboard focusability from background chrome while overlay is open. */
function backgroundInertProps(open: boolean): HTMLAttributes<HTMLElement> {
  return open ? ({ inert: true } as HTMLAttributes<HTMLElement>) : {};
}

function AppShellChrome({ children }: AppShellProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showFinishSetup, setShowFinishSetup] = useState(false);
  const { isOpen: mealRhythmOpen } = useMealRhythmOverlay();
  const { isOpen: nutritionTargetsOpen } = useNutritionTargetsOverlay();
  const overlayOpen = mealRhythmOpen || nutritionTargetsOpen;

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
  const inertProps = backgroundInertProps(overlayOpen);

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
        <div className="fixed top-0 left-0 right-0 z-[90]" {...inertProps}>
          <FinishSetupNotice href={resumeHref} alignToContentColumn={drawerOpen} />
        </div>
      ) : null}
      {/* Topnav above Meal Rhythm / Nutrition Targets scrim; visually present, behaviorally inert while open */}
      <div
        className={cn(
          'fixed left-0 right-0 z-[60]',
          showFinishSetup ? 'top-[5.5rem]' : 'top-0',
          overlayOpen && 'pointer-events-none',
        )}
        aria-hidden={overlayOpen || undefined}
        {...inertProps}
      >
        <AppTopNav drawerOpen={drawerOpen} onOpenDrawer={() => setDrawerOpen(true)} />
      </div>
      <div {...inertProps}>
        <AppSideMenu
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          hasFinishSetupNotice={showFinishSetup}
        />
      </div>
      <div className="lg:pl-[250px]" {...inertProps}>
        {children}
      </div>
      <MealRhythmOverlay hasFinishSetupNotice={showFinishSetup} />
      <NutritionTargetsOverlay hasFinishSetupNotice={showFinishSetup} />
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <MealRhythmOverlayProvider>
      <NutritionTargetsOverlayProvider>
        <AppShellChrome>{children}</AppShellChrome>
      </NutritionTargetsOverlayProvider>
    </MealRhythmOverlayProvider>
  );
}
