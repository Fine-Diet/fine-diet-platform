'use client';

import Link from 'next/link';

import type { AppHomeWelcomeViewModel } from '@/lib/app/home/types';

function renderGreeting(greeting: string) {
  const commaIndex = greeting.indexOf(',');
  if (commaIndex === -1) return greeting;

  return (
    <>
      {greeting.slice(0, commaIndex + 1)}
      <br className="sm:hidden" />
      <span className="hidden sm:inline"> </span>
      {greeting.slice(commaIndex + 1).trimStart()}
    </>
  );
}

export function WelcomeZone({ welcome }: { welcome: AppHomeWelcomeViewModel }) {
  const loading = welcome.status === 'loading';

  return (
    <section className="relative z-0 w-full min-h-[50vh] bg-gradient-to-b from-[#17130f] via-brand-900 to-[#4a4032]">
      <div className="mx-auto flex w-full max-w-[1000px] min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center sm:px-5 md:py-24">
        <h1 className="max-w-[18ch] text-[2.7rem] font-normal leading-[1.15] tracking-tight text-white sm:max-w-none sm:text-[2.75rem] md:text-[3.25rem]">
          {renderGreeting(welcome.greeting)}
        </h1>

        {loading ? (
          <>
            <div className="mt-5 h-5 w-64 max-w-full animate-pulse rounded-full bg-white/15" />
            <div className="mt-8 h-12 w-40 animate-pulse rounded-full bg-white/15" />
          </>
        ) : (
          <>
            <p className="mt-2 max-w-[36ch] text-xl leading-relaxed text-white sm:text-xl">
              {welcome.supportCopy}
            </p>
            <Link
              href={welcome.ctaHref}
              className="mt-4 inline-flex h-10 min-w-[20rem] items-center justify-center rounded-full border border-white/20 bg-transparent px-8 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {welcome.ctaLabel}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
