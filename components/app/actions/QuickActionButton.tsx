/**
 * QuickActionButton — signed-in dashboard quick-action tile.
 *
 * Extracted verbatim from pages/home.tsx (Packet 2B-A). Presentational only:
 * a two-line link tile (label + sub-label). The optional `accent` flag swaps the
 * neutral glass treatment for the teal-tinted denim treatment.
 */

import Link from 'next/link';

export interface QuickActionButtonProps {
  href: string;
  label: string;
  sub: string;
  accent?: boolean;
}

export function QuickActionButton({
  href,
  label,
  sub,
  accent,
}: QuickActionButtonProps) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center rounded-2xl py-5 px-4 transition-colors ${
        accent
          ? 'bg-denim-500/20 hover:bg-denim-500/30 active:bg-denim-500/40'
          : 'bg-neutral-800/50 hover:bg-neutral-800/70 active:bg-neutral-800/90'
      }`}
    >
      <span
        className={`text-base font-semibold antialiased ${
          accent ? 'text-denim-300' : 'text-white'
        }`}
      >
        {label}
      </span>
      <span
        className={`text-[11px] antialiased mt-1 ${
          accent ? 'text-denim-500/70' : 'text-white/40'
        }`}
      >
        {sub}
      </span>
    </Link>
  );
}

export default QuickActionButton;
