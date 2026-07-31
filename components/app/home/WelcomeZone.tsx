'use client';

import Link from 'next/link';

import type { AppHomeWelcomeViewModel } from '@/lib/app/home/types';

export function WelcomeZone({ welcome }: { welcome: AppHomeWelcomeViewModel }) {
  const loading = welcome.status === 'loading';

  return (
    <section className="relative z-0 w-full bg-gradient-to-b from-[#17130f] via-brand-900 to-[#4a4032]">
      <div className="mx-auto flex w-full max-w-[1000px] flex-col items-center px-4 py-16 text-center sm:px-5 md:py-24">
        <h1 className="max-w-[18ch] text-[2rem] font-semibold leading-[1.15] tracking-tight text-white sm:max-w-none sm:text-[2.75rem] md:text-[3.25rem]">
          {welcome.greeting}
        </h1>

        {loading ? (
          <>
            <div className="mt-5 h-5 w-64 max-w-full animate-pulse rounded-full bg-white/15" />
            <div className="mt-8 h-12 w-40 animate-pulse rounded-full bg-white/15" />
          </>
        ) : (
          <>
            <p className="mt-5 max-w-[36ch] text-sm leading-relaxed text-white/85 sm:text-base">
              {welcome.supportCopy}
            </p>
            <Link
              href={welcome.ctaHref}
              className="mt-8 inline-flex h-12 min-w-[10rem] items-center justify-center rounded-full border border-white/70 bg-transparent px-8 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {welcome.ctaLabel}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
