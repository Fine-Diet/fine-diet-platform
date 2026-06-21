/**
 * PricingCard — renders a single price option from a frontend-safe
 * `PricingCardDTO` using FIXED OPTIONAL ZONES.
 *
 * Zone order (each optional except where noted):
 *   BadgeZone, PlanHeaderZone (title required), PriceDisplayZone (primaryPrice
 *   required), SavingsCompareZone, TrialOrIntroZone, InclusionZone,
 *   BillingDisclosureZone (required), CTAZone (ctaLabel required), FinePrintZone.
 *
 * The CTA submits IDENTIFIERS only (offer_key + price_option_key) by linking
 * into the existing /buy flow. It never carries prices; billing truth is
 * resolved server-side at checkout.
 */

import Link from 'next/link';
import type { PricingCardDTO } from '@/lib/access/pricingCardDTO';

export interface PricingCardProps {
  card: PricingCardDTO;
  placement?: string;
  source?: string;
  /** Override the CTA destination; defaults to a /buy link with identifiers. */
  href?: string;
  /** `light` matches the /start cream-sheet pricing section; `dark` is the default. */
  variant?: 'light' | 'dark';
  className?: string;
}

function buildBuyHref(
  card: PricingCardDTO,
  placement?: string,
  source?: string,
): string {
  const params = new URLSearchParams();
  if (card.priceOptionKey) params.set('price_option', card.priceOptionKey);
  if (placement) params.set('placement', placement);
  if (source) params.set('source', source);
  const qs = params.toString();
  return `/buy/${card.offerKey}${qs ? `?${qs}` : ''}`;
}

export default function PricingCard({
  card,
  placement = 'start-plan',
  source = 'start',
  href,
  variant = 'dark',
  className = '',
}: PricingCardProps) {
  const { zones, behavior } = card;
  const isDisabled = Boolean(behavior.isDisabled);
  const ctaHref = href ?? buildBuyHref(card, placement, source);
  const isLight = variant === 'light';

  const shellClass = isLight
    ? behavior.isFeatured
      ? 'border-denim-400/70 bg-white shadow-sm'
      : 'border-neutral-300 bg-white shadow-sm'
    : behavior.isFeatured
      ? 'border-denim-300/70 bg-white/[0.07]'
      : 'border-white/10 bg-white/[0.04]';

  const titleClass = isLight ? 'text-neutral-950' : 'text-white';
  const bodyClass = isLight ? 'text-neutral-600' : 'text-white/65';
  const priceClass = isLight ? 'text-neutral-950' : 'text-white';
  const suffixClass = isLight ? 'text-neutral-500' : 'text-white/55';
  const mutedClass = isLight ? 'text-neutral-500' : 'text-white/45';
  const accentClass = isLight ? 'text-denim-600' : 'text-denim-300';
  const savingsClass = isLight ? 'text-emerald-700' : 'text-emerald-300';
  const bulletClass = isLight ? 'text-neutral-600' : 'text-white/70';
  const badgeClass = isLight
    ? 'bg-denim-500/10 text-denim-600'
    : 'bg-denim-500/20 text-denim-200';
  const savingsBadgeClass = isLight
    ? 'bg-emerald-500/10 text-emerald-700'
    : 'bg-emerald-500/15 text-emerald-200';
  const ctaClass = isLight
    ? 'inline-flex w-full items-center justify-center rounded-full bg-denim-500 px-5 py-3 text-sm font-semibold text-neutral-900 transition group-hover:bg-denim-400 antialiased focus:outline-none focus:ring-2 focus:ring-denim-400'
    : 'inline-flex w-fit rounded-full bg-denim-500 px-5 py-2.5 text-sm font-semibold text-white transition group-hover:bg-denim-400 antialiased focus:outline-none focus:ring-2 focus:ring-denim-400';

  return (
    <div
      className={`group relative flex min-h-[360px] flex-col rounded-[1.5rem] border p-7 transition hover:border-denim-300/70 ${shellClass} ${
        isDisabled ? 'opacity-60' : ''
      } ${className}`}
    >
      {/* BadgeZone */}
      {(zones.badge || zones.savingsBadge) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {zones.badge && (
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide antialiased ${badgeClass}`}>
              {zones.badge}
            </span>
          )}
          {zones.savingsBadge && (
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide antialiased ${savingsBadgeClass}`}>
              {zones.savingsBadge}
            </span>
          )}
        </div>
      )}

      {/* PlanHeaderZone */}
      <div>
        {zones.eyebrow && (
          <p className={`text-xs font-semibold uppercase tracking-[0.28em] antialiased ${accentClass}`}>
            {zones.eyebrow}
          </p>
        )}
        <h3 className={`mt-2 text-2xl font-semibold antialiased ${titleClass}`}>
          {zones.title}
        </h3>
        {zones.description && (
          <p className={`mt-2 text-sm leading-6 antialiased ${bodyClass}`}>
            {zones.description}
          </p>
        )}
      </div>

      {/* PriceDisplayZone */}
      <div className="mt-6 flex items-baseline gap-1">
        <span className={`text-4xl font-semibold tracking-[-0.04em] antialiased ${priceClass}`}>
          {zones.primaryPrice}
        </span>
        {zones.primarySuffix && (
          <span className={`text-sm antialiased ${suffixClass}`}>
            {zones.primarySuffix}
          </span>
        )}
      </div>
      {zones.billingQualifier && (
        <p className={`mt-1 text-xs antialiased ${mutedClass}`}>
          {zones.billingQualifier}
        </p>
      )}

      {/* SavingsCompareZone */}
      {(zones.compareAt || zones.savingsLine) && (
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          {zones.compareAt && (
            <span className={`text-sm line-through antialiased ${mutedClass}`}>
              {zones.compareAt}
            </span>
          )}
          {zones.savingsLine && (
            <span className={`text-xs font-medium antialiased ${savingsClass}`}>
              {zones.savingsLine}
            </span>
          )}
        </div>
      )}

      {/* TrialOrIntroZone */}
      {(zones.trialCallout || zones.introCallout) && (
        <div className="mt-4 space-y-1">
          {zones.trialCallout && (
            <p className={`text-xs font-semibold antialiased ${accentClass}`}>
              {zones.trialCallout}
            </p>
          )}
          {zones.introCallout && (
            <p className={`text-xs font-semibold antialiased ${accentClass}`}>
              {zones.introCallout}
            </p>
          )}
        </div>
      )}

      {/* InclusionZone */}
      {zones.inclusionBullets && zones.inclusionBullets.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {zones.inclusionBullets.map((bullet) => (
            <li
              key={bullet}
              className={`flex items-start gap-2 text-sm antialiased ${bulletClass}`}
            >
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-denim-400" />
              {bullet}
            </li>
          ))}
        </ul>
      )}

      {/* BillingDisclosureZone (required) */}
      <p className={`mt-4 text-xs leading-5 antialiased ${mutedClass}`}>
        {zones.billingDisclosure}
      </p>

      {/* CTAZone (required) */}
      <div className="mt-auto pt-6">
        {isDisabled ? (
          <span className="inline-flex w-fit cursor-not-allowed rounded-full bg-neutral-700/60 px-5 py-2.5 text-sm font-semibold text-white/60 antialiased">
            {zones.ctaLabel}
          </span>
        ) : (
          <Link href={ctaHref} className={ctaClass}>
            {zones.ctaLabel}
          </Link>
        )}
      </div>

      {/* FinePrintZone */}
      {zones.finePrint && (
        <p className={`mt-3 text-[11px] leading-4 antialiased ${mutedClass}`}>
          {zones.finePrint}
        </p>
      )}
    </div>
  );
}
