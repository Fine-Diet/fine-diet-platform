'use client';

import Link from 'next/link';

interface FinishSetupNoticeProps {
  href: string;
}

/**
 * Full-width onboarding continuation bar.
 * Prototype: black strip at the very top of the viewport, centered copy,
 * white Continue pill — spans the full page (not the content column).
 */
export function FinishSetupNotice({ href }: FinishSetupNoticeProps) {
  return (
    <div className="flex h-11 w-full items-center justify-center gap-3 bg-black px-4">
      <p className="text-sm text-white antialiased">Finish setting up your profile</p>
      <Link
        href={href}
        className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-white/90"
      >
        Continue
      </Link>
    </div>
  );
}
