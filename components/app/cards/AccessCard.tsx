/**
 * AccessCard — signed-in dashboard access status card.
 *
 * Extracted verbatim from pages/home.tsx (Packet 2B-A). Presentational only:
 * title + status badge on one row, a teal arrow CTA below. Status color is
 * passed in by the caller (computed from entitlement truth at the call site).
 */

import Link from 'next/link';

export interface AccessCardProps {
  title: string;
  status: string;
  /** Tailwind text-color class for the status label (e.g. 'text-denim-400'). */
  statusColor: string;
  ctaLabel: string;
  ctaHref: string;
}

export function AccessCard({
  title,
  status,
  statusColor,
  ctaLabel,
  ctaHref,
}: AccessCardProps) {
  return (
    <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700/50 p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-white antialiased">{title}</h3>
        <span className={`text-xs font-medium antialiased ${statusColor}`}>
          {status}
        </span>
      </div>
      <Link
        href={ctaHref}
        className="self-start text-sm font-medium text-denim-400 hover:text-denim-300 transition-colors antialiased"
      >
        {ctaLabel} &rarr;
      </Link>
    </div>
  );
}

export default AccessCard;
