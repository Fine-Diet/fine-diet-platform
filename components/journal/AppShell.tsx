'use client';

import { useEffect, useLayoutEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import { AppTopNav } from './AppTopNav';
import { AppSideMenu } from './AppSideMenu';
import {
  APP_CHROME_OFFSET,
  APP_CHROME_OFFSET_WITH_NOTICE,
  APP_CHROME_OFFSET_CLASS,
  APP_NOTICE_HEIGHT,
} from '@/components/app/AppNotificationBar';
import {
  FoodContentPaneOverlayProvider,
  useFoodContentPaneOpen,
} from '@/components/layout/foodContentPaneOverlay';
import {
  SIGNED_IN_DESKTOP_DRAWER_OFFSET_CLASS,
  SIGNED_IN_DESKTOP_DRAWER_WIDTH,
} from '@/components/layout/SignedInPageShell';
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
  const foodPaneOpen = useFoodContentPaneOpen();
  const overlayOpen = mealRhythmOpen || nutritionTargetsOpen;
  const blockBackgroundChrome = overlayOpen || foodPaneOpen;

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
  const chromeOffset = showFinishSetup ? APP_CHROME_OFFSET_WITH_NOTICE : APP_CHROME_OFFSET;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const header = document.querySelector<HTMLElement>('[data-app-top-nav]');
      const notice = document.querySelector<HTMLElement>('[data-app-setup-notice]');
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      const noticeBottom = notice?.getBoundingClientRect().bottom ?? 0;
      const measured = Math.max(headerBottom, noticeBottom);
      root.style.setProperty(
        '--app-chrome-offset',
        measured > 0 ? `${measured}px` : chromeOffset,
      );
      root.style.setProperty(
        '--app-notice-offset',
        notice ? `${notice.getBoundingClientRect().height}px` : '0px',
      );
      root.style.setProperty('--app-footer-clearance', '7rem');
      const persistentDrawer = window.matchMedia('(min-width: 1024px)').matches;
      root.style.setProperty(
        '--app-drawer-width',
        persistentDrawer ? SIGNED_IN_DESKTOP_DRAWER_WIDTH : '0px',
      );
    };

    apply();
    const observer = new ResizeObserver(apply);
    const header = document.querySelector('[data-app-top-nav]');
    const notice = document.querySelector('[data-app-setup-notice]');
    if (header) observer.observe(header);
    if (notice) observer.observe(notice);
    window.addEventListener('resize', apply);
    const media = window.matchMedia('(min-width: 1024px)');
    media.addEventListener('change', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
      media.removeEventListener('change', apply);
    };
  }, [chromeOffset, showFinishSetup]);

  return (
    <div
      className={cn(
        'min-h-screen bg-brand-900 text-white',
        APP_CHROME_OFFSET_CLASS,
      )}
      style={{
        ['--app-chrome-offset' as string]: chromeOffset,
        ['--app-notice-offset' as string]: showFinishSetup ? APP_NOTICE_HEIGHT : '0px',
        ['--app-footer-clearance' as string]: '7rem',
        ['--app-drawer-width' as string]: '0px',
      }}
    >
      {showFinishSetup ? (
        <div
          data-app-setup-notice
          className="fixed top-0 left-0 right-0 z-[90]"
          {...inertProps}
        >
          <FinishSetupNotice href={resumeHref} alignToContentColumn={drawerOpen} />
        </div>
      ) : null}
      {/* Topnav stays visible above Food and rhythm scrims; clicks are blocked while a modal owns the pane. */}
      <div
        className={cn(
          'fixed left-0 right-0 z-[60]',
          showFinishSetup ? 'top-[var(--app-notice-offset,5.5rem)]' : 'top-0',
          blockBackgroundChrome && 'pointer-events-none',
        )}
        aria-hidden={blockBackgroundChrome || undefined}
        {...inertProps}
      >
        <AppTopNav drawerOpen={drawerOpen} onOpenDrawer={() => setDrawerOpen(true)} />
      </div>
      <div className={cn(blockBackgroundChrome && 'pointer-events-none')} {...inertProps}>
        <AppSideMenu
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          hasFinishSetupNotice={showFinishSetup}
        />
      </div>
      <div className={SIGNED_IN_DESKTOP_DRAWER_OFFSET_CLASS} {...inertProps}>
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
        <FoodContentPaneOverlayProvider>
          <AppShellChrome>{children}</AppShellChrome>
        </FoodContentPaneOverlayProvider>
      </NutritionTargetsOverlayProvider>
    </MealRhythmOverlayProvider>
  );
}
