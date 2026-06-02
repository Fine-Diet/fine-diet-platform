/**
 * RecommendationCard — signed-in dashboard recommendation card.
 *
 * Extracted verbatim from pages/home.tsx (Packet 2B-A). Presentational only:
 * title + description + teal arrow CTA, in the same glass panel as AccessCard.
 * Takes a single `rec` object so the contract matches the page's data shape.
 */

import Link from 'next/link';

/** Recommendation shape rendered by the card (mirrors the dashboard API row). */
export interface Recommendation {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface RecommendationCardProps {
  rec: Recommendation;
}

export function RecommendationCard({ rec }: RecommendationCardProps) {
  return (
    <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700/50 p-5 flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-white antialiased">{rec.title}</h4>
      <p className="text-xs text-white/50 antialiased leading-relaxed">
        {rec.description}
      </p>
      <Link
        href={rec.ctaHref}
        className="self-start mt-1 text-sm font-medium text-denim-400 hover:text-denim-300 transition-colors antialiased"
      >
        {rec.ctaLabel} &rarr;
      </Link>
    </div>
  );
}

export default RecommendationCard;
