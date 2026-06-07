/**
 * PrepPantryCard — /journal/home "Prep & Pantry" readiness card (presentational).
 *
 * Presentational split from pages/journal/home.tsx (Packet 2B-B). The page keeps
 * the live `usePantryReadiness()` hook and the `derivePrepPantryView()` data
 * shaping; this card only renders a fully-resolved `PrepPantryView`. No data
 * fetching, hooks, or services live here.
 */

import Link from 'next/link';
import Image from 'next/image';

const PREP_PANTRY_BG =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1772671962329-zucchini-apple.jpg';

/** Fully-resolved view model rendered by the card (shaped by the page). */
export interface PrepPantryView {
  headline: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  metrics: Array<{ label: string; value: number }> | null;
  blockerNote: string | null;
}

export interface PrepPantryCardProps {
  view: PrepPantryView;
}

export function PrepPantryCard({ view }: PrepPantryCardProps) {
  return (
    <section className="w-full max-w-[1000px] mx-auto">
      <div className="relative isolate min-h-[150px] overflow-hidden rounded-[24px] bg-brand-800 shadow-large sm:min-h-[180px]">
        <Image
          src={PREP_PANTRY_BG}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 750px"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-brand-900/75 to-black/40" />
        <div className="relative z-10 p-5 sm:p-6">
          <span className="inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/80">
            Prep & Pantry
          </span>
          <h2 className="mt-4 max-w-md text-2xl font-semibold leading-tight text-white antialiased sm:text-3xl">
            {view.headline}
          </h2>
          <p className="mt-1 max-w-md text-sm text-white/75 antialiased">{view.body}</p>

          {view.metrics && (
            <div className="mt-4 grid max-w-md grid-cols-3 gap-2">
              {view.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-white/15 bg-black/25 px-3 py-2 backdrop-blur-sm"
                >
                  <p className="text-2xl font-semibold leading-none text-white antialiased">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-[11px] font-medium leading-tight text-white/65 antialiased">
                    {metric.label}
                  </p>
                </div>
              ))}
            </div>
          )}

          {view.blockerNote && (
            <p className="mt-3 max-w-md text-xs text-amber-100/90 antialiased">{view.blockerNote}</p>
          )}

          <Link
            href={view.primaryHref}
            className="mt-5 inline-flex w-full justify-center rounded-full bg-[#d7ecff] px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-brand-50"
          >
            {view.primaryLabel}
          </Link>
          <Link
            href={view.secondaryHref}
            className="mt-2 inline-flex w-full justify-center rounded-full border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-brand-50/85 transition-colors hover:bg-white/[0.1] hover:text-brand-50"
          >
            {view.secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default PrepPantryCard;
