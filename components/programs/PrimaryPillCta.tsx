/**
 * PrimaryPillCta — the shared wide pale-blue pill CTA used across the public
 * Programs surfaces. Mirrors the integrative-care / StartView hero button
 * treatment (denim gradient pill, near-black text) so Programs matches the
 * rest of the marketing site.
 *
 * Presentational only. CTA *resolution* stays centralized in
 * `resolveProgramMarketingCta`; this component just renders a resolved CTA.
 * No React hooks — safe for SSR and direct unit-test invocation.
 */

import Link from 'next/link';
import type { ProgramMarketingCtaResolution } from '@/lib/programs/programSeriesTypes';

const PILL_STRUCTURE =
  'rounded-full px-8 py-4 text-center text-base font-semibold antialiased transition-opacity duration-200 hover:opacity-90 sm:py-5';

const PILL_TONES = {
  denim: 'bg-gradient-to-bl from-denim-500 to-denim-900 text-neutral-900',
  brand: 'bg-brand-900 text-white',
  quinary: 'bg-brand-900 text-white',
} as const;

export function PrimaryPillCta({
  cta,
  wide = false,
  tone = 'denim',
  className = '',
}: {
  cta: ProgramMarketingCtaResolution;
  /** Stretch to the wide hero/final-CTA pill (block, centered, max-w-2xl). */
  wide?: boolean;
  /** Visual fill: the default denim gradient, solid brand-900, or quinary button demo tone. */
  tone?: keyof typeof PILL_TONES;
  className?: string;
}) {
  const width = wide ? 'mx-auto block w-full max-w-2xl' : 'inline-block';
  const base = `${PILL_STRUCTURE} ${PILL_TONES[tone]}`;

  if (cta.href && !cta.disabled) {
    return (
      <Link href={cta.href} className={`${base} ${width} ${className}`}>
        {cta.label}
      </Link>
    );
  }

  return (
    <span
      className={`${base} ${width} cursor-not-allowed opacity-60 ${className}`}
      aria-disabled="true"
    >
      {cta.label}
    </span>
  );
}

/** Secondary text link beneath the pill (e.g. "Manage my programs"). */
export function SecondaryCtaLink({
  cta,
  tone = 'dark',
}: {
  cta: ProgramMarketingCtaResolution;
  tone?: 'light' | 'dark';
}) {
  const color =
    tone === 'light'
      ? 'text-white/75 hover:text-white'
      : 'text-brand-900/60 hover:text-brand-900';
  return (
    <Link
      href={cta.secondaryHref}
      className={`text-sm font-medium underline-offset-4 hover:underline ${color}`}
    >
      {cta.secondaryLabel}
    </Link>
  );
}