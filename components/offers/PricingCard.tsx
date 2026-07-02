/**
 * PricingCard — renders a single price option from a frontend-safe
 * `PricingCardDTO` using FIXED OPTIONAL ZONES.
 *
 * Zone order (each optional except where noted):
 *   Eyebrow, PlanHeaderZone (title required + inline badges), PriceDisplayZone
 *   (primaryPrice required + suffix/qualifier), SavingsCompareZone,
 *   DescriptionZone, TrialOrIntroZone, InclusionZone, BillingDisclosureZone,
 *   CTAZone, FinePrintZone.
 *
 * Optional zones render only when real content exists. Missing display data must
 * collapse naturally instead of reserving vertical space.
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

function cleanText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanList(values?: string[]): string[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value): value is string => value.length > 0);
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

  const eyebrow = cleanText(zones.eyebrow);
  const badge = cleanText(zones.badge);
  const savingsBadge = cleanText(zones.savingsBadge);
  const description = cleanText(zones.description);
  const primarySuffix = cleanText(zones.primarySuffix);
  const billingQualifier = cleanText(zones.billingQualifier);
  const compareAt = cleanText(zones.compareAt);
  const savingsLine = cleanText(zones.savingsLine);
  const trialCallout = cleanText(zones.trialCallout);
  const introCallout = cleanText(zones.introCallout);
  const inclusionHeading = cleanText(zones.inclusionHeading);
  const inclusionBullets = cleanList(zones.inclusionBullets);
  const billingDisclosure = cleanText(zones.billingDisclosure);
  const finePrint = cleanText(zones.finePrint);
  const ctaLabel = cleanText(zones.ctaLabel);
  const primaryPrice = cleanText(zones.primaryPrice) ?? zones.primaryPrice;
  const title = cleanText(zones.title) ?? zones.title;

  const hasBadges = Boolean(badge || savingsBadge);
  const priceMeta = [primarySuffix, billingQualifier].filter(Boolean).join(' / ');
  const hasCompareLine = Boolean(compareAt || savingsLine);
  const hasCallouts = Boolean(trialCallout || introCallout);
  const hasInclusions = Boolean(inclusionHeading || inclusionBullets.length > 0);

  const shellClass = isLight
    ? behavior.isFeatured
      ? 'border-denim-400/70 bg-white shadow-sm'
      : 'border-neutral-300 bg-white shadow-sm'
    : behavior.isFeatured
      ? 'border-denim-300/70 bg-white/[0.07]'
      : 'border-white/10 bg-white/[0.04]';

  const titleClass = isLight ? 'text-neutral-950' : 'text-white';
  const bodyClass = isLight ? 'text-neutral-650' : 'text-white/70';
  const priceClass = isLight ? 'text-neutral-950' : 'text-white';
  const suffixClass = isLight ? 'text-neutral-600' : 'text-white/60';
  const mutedClass = isLight ? 'text-neutral-500' : 'text-white/50';
  const accentClass = isLight ? 'text-neutral-600' : 'text-white/65';
  const bulletClass = isLight ? 'text-neutral-700' : 'text-white/75';
  const badgeClass = isLight
    ? 'border-neutral-700 bg-transparent text-neutral-900'
    : 'border-white/50 bg-transparent text-white';
  const savingsBadgeClass = isLight
    ? 'border-denim-500/70 bg-denim-500/10 text-denim-700'
    : 'border-denim-300/60 bg-denim-500/15 text-denim-100';
  const ctaClass = isLight
    ? 'inline-flex w-full items-center justify-center rounded-full bg-denim-300 px-6 py-4 text-base font-semibold text-neutral-950 transition group-hover:bg-denim-400 antialiased focus:outline-none focus:ring-2 focus:ring-denim-400'
    : 'inline-flex w-full items-center justify-center rounded-full bg-denim-500 px-6 py-4 text-base font-semibold text-white transition group-hover:bg-denim-400 antialiased focus:outline-none focus:ring-2 focus:ring-denim-400';

  return (
    <div
      className={`group relative self-start rounded-[1.75rem] border p-8 transition hover:border-denim-300/70 sm:p-10 ${shellClass} ${
        isDisabled ? 'opacity-60' : ''
      } ${className}`}
    >
      {/* Eyebrow */}
      {eyebrow && (
        <p className={`text-sm font-normal leading-5 antialiased ${accentClass}`}>
          {eyebrow}
        </p>
      )}

      {/* PlanHeaderZone */}
      <div className={`${eyebrow ? 'mt-2' : ''} flex flex-wrap items-center gap-x-3 gap-y-2`}>
        <h3 className={`text-2xl font-semibold leading-none antialiased ${titleClass}`}>
          {title}
        </h3>
        {hasBadges && (
          <div className="flex flex-wrap items-center gap-2">
            {badge && (
              <span className={`inline-flex rounded-full border px-3 py-0.5 text-sm font-semibold leading-5 antialiased ${badgeClass}`}>
                {badge}
              </span>
            )}
            {savingsBadge && (
              <span className={`inline-flex rounded-full border px-3 py-0.5 text-sm font-semibold leading-5 antialiased ${savingsBadgeClass}`}>
                {savingsBadge}
              </span>
            )}
          </div>
        )}
      </div>

      {/* PriceDisplayZone */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`text-5xl font-light leading-none tracking-[-0.06em] antialiased ${priceClass}`}>
          {primaryPrice}
        </span>
        {priceMeta && (
          <span className={`text-sm leading-5 antialiased ${suffixClass}`}>
            {priceMeta}
          </span>
        )}
      </div>

      {/* SavingsCompareZone */}
      {hasCompareLine && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {compareAt && (
            <span className={`text-sm leading-5 antialiased ${mutedClass}`}>
              Compare at <span className="line-through">{compareAt}</span>
            </span>
          )}
          {savingsLine && (
            <span className={`text-sm leading-5 antialiased ${mutedClass}`}>
              {savingsLine}
            </span>
          )}
        </div>
      )}

      {/* DescriptionZone */}
      {description && (
        <p className={`mt-5 text-base leading-6 antialiased ${bodyClass}`}>
          {description}
        </p>
      )}

      {/* TrialOrIntroZone */}
      {hasCallouts && (
        <div className="mt-5 space-y-1">
          {trialCallout && (
            <p className={`text-base leading-6 antialiased ${bodyClass}`}>
              {trialCallout}
            </p>
          )}
          {introCallout && (
            <p className={`text-base leading-6 antialiased ${bodyClass}`}>
              {introCallout}
            </p>
          )}
        </div>
      )}

      {/* InclusionZone */}
      {hasInclusions && (
        <div className="mt-5">
          {inclusionHeading && (
            <p className={`text-base leading-6 antialiased ${bodyClass}`}>
              {inclusionHeading}
            </p>
          )}
          {inclusionBullets.length > 0 && (
            <ul className={`${inclusionHeading ? 'mt-1' : ''} list-disc space-y-0.5 pl-5`}>
              {inclusionBullets.map((bullet) => (
                <li
                  key={bullet}
                  className={`text-base leading-6 antialiased ${bulletClass}`}
                >
                  {bullet}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* BillingDisclosureZone */}
      {billingDisclosure && (
        <p className={`mt-5 text-base leading-6 antialiased ${bodyClass}`}>
          {billingDisclosure}
        </p>
      )}

      {/* CTAZone */}
      {ctaLabel && (
        <div className="mt-6">
          {isDisabled ? (
            <span className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-full bg-neutral-300 px-6 py-4 text-base font-semibold text-neutral-500 antialiased">
              {ctaLabel}
            </span>
          ) : (
            <Link href={ctaHref} className={ctaClass}>
              {ctaLabel}
            </Link>
          )}
        </div>
      )}

      {/* FinePrintZone */}
      {finePrint && (
        <p className={`mt-5 px-2 text-center text-xs leading-5 antialiased ${mutedClass}`}>
          {finePrint}
        </p>
      )}
    </div>
  );
}
