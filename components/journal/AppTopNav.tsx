'use client';

import Link from 'next/link';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

export function AppTopNav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-black/20 backdrop-blur-md border-b border-white/[0.04]">
      <div className="h-9 px-4 md:px-6 flex items-center justify-between max-w-[1000px] justify-between mx-auto">
        <div className="font-sans text-base md:text-base font-semibold text-brand-50 antialiased">
          Fine Diet App
        </div>
        <Link
          href={APP_ROUTES.profile}
          className="h-8 w-8 inline-flex flex-col items-center justify-center gap-1.5 rounded-full text-brand-50/80 hover:text-brand-50 hover:bg-white/10 transition-colors"
          aria-label="Open profile"
        >
          <span className="block h-px w-5 bg-current" />
          <span className="block h-px w-5 bg-current" />
        </Link>
      </div>
    </header>
  );
}
