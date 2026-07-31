'use client';

import Link from 'next/link';

interface FinishSetupNoticeProps {
  href: string;
}

/**
 * Compact, non-blocking continuation notice for skipped / in-progress users.
 * Mounted by AppShell on canonical home so it survives Home page replacement.
 */
export function FinishSetupNotice({ href }: FinishSetupNoticeProps) {
  return (
    <div className="border-b border-white/10 bg-[#1f1812] px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <p className="text-sm text-white/85 antialiased">
          Finish setting up Fine Diet
        </p>
        <Link
          href={href}
          className="shrink-0 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-white transition-colors"
        >
          Continue
        </Link>
      </div>
    </div>
  );
}
