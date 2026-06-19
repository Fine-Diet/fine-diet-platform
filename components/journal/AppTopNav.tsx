'use client';

import Link from 'next/link';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

interface AppTopNavProps {
  drawerOpen?: boolean;
  onOpenDrawer?: () => void;
}

export function AppTopNav({ drawerOpen = false, onOpenDrawer }: AppTopNavProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-black/20 backdrop-blur-md border-b border-white/[0.04]">
      <div className="py-6 h-9 px-4 md:px-6 flex items-center justify-between mx-auto">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          aria-label="Open navigation menu"
          className="-ml-1 inline-flex items-center gap-1.5 rounded-full px-1 text-base font-semibold text-brand-50 antialiased transition-colors hover:text-white"
        >
          <span className="font-sans">Fine Diet App</span>
          <svg
            className="h-4 w-4 text-brand-50/70"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <Link
          href={APP_ROUTES.profile}
          className="h-8 w-8 inline-flex flex-col items-center justify-center gap-[7px] rounded-full text-brand-50/80 hover:text-brand-50 hover:bg-white/10 transition-colors"
          aria-label="Open profile"
        >
          <span className="block h-px w-7 bg-current" />
          <span className="block h-px w-7 bg-current" />
        </Link>
      </div>
    </header>
  );
}
