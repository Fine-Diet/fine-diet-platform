'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { APP_SIDEBAR_WITH_NOTICE_OFFSET_CLASS } from '@/components/app/AppNotificationBar';
import {
  APP_DRAWER_HUBS,
  APP_DRAWER_UTILITIES,
  getActiveDrawerHubId,
  type DrawerChildItem,
  type DrawerHub,
} from '@/lib/navigation/appDrawerNavigation';

interface AppSideMenuProps {
  open: boolean;
  onClose: () => void;
  /** Extra top offset when the full-width Finish Setup bar is mounted. */
  hasFinishSetupNotice?: boolean;
}

const CHEVRON_DOWN = (
  <svg
    className="h-[15px] w-[15px] flex-shrink-0"
    fill="currentColor"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <polygon points="12,18 2,6 22,6" />
  </svg>
);

function SoonBadge() {
  return (
    <span className="mr-2 shrink-0 rounded-full bg-white/10 px-1 py-px text-[6px] font-medium uppercase tracking-wide text-white/45">
      Soon
    </span>
  );
}

/**
 * AppSideMenu — the signed-in app's left navigation drawer.
 *
 * Mirrors the Profile accordion language (dark collapsed rows, white expanded
 * hub header with black text, compact indented child links, thin dividers).
 *
 * Responsive behavior:
 * - Mobile / tablet: hidden overlay; slides in from the left with a backdrop,
 *   opened from the top-left product mark, closes on backdrop / Escape / route
 *   change / link click.
 * - Wide desktop (lg+): persistent left sidebar; content is offset by the
 *   shell. The backdrop is suppressed and the panel is always visible.
 */
export function AppSideMenu({
  open,
  onClose,
  hasFinishSetupNotice = false,
}: AppSideMenuProps) {
  const router = useRouter();
  const activeHubId = getActiveDrawerHubId(router.pathname);

  // Which expandable hubs are open. The active hub auto-expands; this resets on
  // route change so the current section is expanded on both mobile and desktop.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpanded(activeHubId ? { [activeHubId]: true } : {});
  }, [activeHubId]);

  // Close on Escape (overlay mode).
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Close on route change (overlay mode).
  useEffect(() => {
    if (!open) return;
    const handleRouteChange = () => onClose();
    router.events.on('routeChangeStart', handleRouteChange);
    return () => router.events.off('routeChangeStart', handleRouteChange);
  }, [open, onClose, router.events]);

  function toggleHub(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isChildActive(item: DrawerChildItem): boolean {
    return router.asPath === item.href;
  }

  function renderLinkRow(hub: DrawerHub) {
    const isActive = activeHubId === hub.id;
    return (
      <Link
        key={hub.id}
        href={hub.href}
        onClick={onClose}
        aria-current={isActive ? 'page' : undefined}
        className={`flex min-h-[70px] w-full items-center border-b border-white/10 px-5 text-base font-semibold antialiased transition-colors ${
          isActive ? 'text-white' : 'text-brand-50/90'
        } hover:bg-white/[0.04] hover:text-white`}
      >
        {hub.label}
      </Link>
    );
  }

  function renderHub(hub: DrawerHub) {
    const isExpanded = !!expanded[hub.id];

    return (
      <div key={hub.id} className="border-b border-white/10">
        <button
          type="button"
          onClick={() => toggleHub(hub.id)}
          aria-expanded={isExpanded}
          className={`flex min-h-[70px] w-full items-center justify-between px-5 text-left transition-colors ${
            isExpanded ? 'bg-white text-black' : 'bg-neutral-900 text-brand-50/90 hover:bg-white/[0.04] hover:text-white'
          }`}
        >
          <span className="text-base font-semibold antialiased">{hub.label}</span>
          <span
            className={`transition-transform duration-200 ${isExpanded ? 'rotate-180 text-black' : 'text-white/95'}`}
          >
            {CHEVRON_DOWN}
          </span>
        </button>

        {isExpanded && hub.items && (
          <div className="divide-y divide-white/10 bg-neutral-800 pb-1.5 pt-0.5">
            {hub.items.map((item) => {
              const childActive = isChildActive(item);
              const isComingSoon = item.status === 'coming-soon';
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={onClose}
                  aria-current={childActive ? 'page' : undefined}
                  className={`flex items-center py-4 pl-8 pr-5 text-base antialiased transition-colors ${
                    childActive
                      ? 'font-semibold text-white'
                      : 'text-brand-50/60 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  {isComingSoon && <SoonBadge />}
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Mobile / tablet backdrop — suppressed on wide desktop. */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-[75] bg-black/50 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          hasFinishSetupNotice ? 'top-[5.5rem]' : ''
        } ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />

      {/* Panel: overlay on mobile, persistent sidebar on desktop. */}
      <aside
        aria-label="App navigation"
        className={`fixed left-0 z-[80] flex w-[250px] max-w-[85vw] flex-col bg-neutral-900 shadow-large transition-transform duration-200 ease-out lg:z-30 lg:max-w-none lg:translate-x-0 lg:shadow-none ${
          hasFinishSetupNotice
            ? APP_SIDEBAR_WITH_NOTICE_OFFSET_CLASS
            : 'top-0 h-full lg:top-9 lg:h-[calc(100vh-2.25rem)]'
        } ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <nav className="flex flex-1 flex-col overflow-y-auto pb-safe pt-9 lg:pt-[15px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {APP_DRAWER_HUBS.map((hub) => (hub.type === 'link' ? renderLinkRow(hub) : renderHub(hub)))}

          {/* Lower utility links, pinned to the bottom beneath a single divider */}
          <div className="mt-auto border-t border-white/10">
            {APP_DRAWER_UTILITIES.map((hub) => renderLinkRow(hub))}
          </div>
        </nav>
      </aside>
    </>
  );
}
