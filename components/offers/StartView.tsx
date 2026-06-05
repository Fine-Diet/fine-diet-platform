/**
 * StartView — the central app access / subscription surface.
 *
 * Renders a configured primary offer (resolved server-side so trial vs buy-now
 * copy is correct on first paint) plus a clearly-separated practitioner section.
 * Owned-state hydrates client-side: subscribers see "Open app" instead of a
 * checkout CTA, and lapsed (data_access_only) users get an upgrade nudge.
 *
 * Visual direction is loosely inspired by the integrative-care page but framed
 * as the central subscription page, not another program page.
 */

import Link from 'next/link';
import Head from 'next/head';
import BuyOfferButton from '@/components/checkout/BuyOfferButton';
import OfferCard from './OfferCard';
import { useOffers } from '@/lib/access/useOffers';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import type { OfferMarketingDTO } from '@/lib/access/offerCatalogService';

export interface StartViewProps {
  primaryOffer: OfferMarketingDTO;
  practitionerOffers: OfferMarketingDTO[];
  /** Shown when the requested slug fell back to the default public offer. */
  fallbackNotice?: string | null;
}

export default function StartView({
  primaryOffer,
  practitionerOffers,
  fallbackNotice,
}: StartViewProps) {
  const { hasAppAccess } = useOffers('baseline');
  const { copy, priceLabel, priceSuffix, checkoutMode, trialDays } = primaryOffer;
  const showTrial = checkoutMode === 'trial' && trialDays > 0 && Boolean(copy.trialNote);

  return (
    <>
      <Head>
        <title>{copy.title} &bull; Fine Diet</title>
        <meta name="description" content={copy.subtitle} />
      </Head>

      <div className="min-h-screen bg-brand-900 text-white">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 pt-16 pb-10 sm:pt-24">
          {fallbackNotice && (
            <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
              <p className="text-sm text-amber-200 antialiased">{fallbackNotice}</p>
            </div>
          )}

          {copy.eyebrow && (
            <span className="text-xs font-semibold uppercase tracking-wider text-denim-400 antialiased">
              {copy.eyebrow}
            </span>
          )}
          <h1 className="mt-3 text-3xl font-bold leading-tight text-white antialiased sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/70 antialiased sm:text-lg">
            {copy.subtitle}
          </p>

          <div className="mt-6 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white antialiased">{priceLabel}</span>
            {priceSuffix && <span className="text-white/50 antialiased">{priceSuffix}</span>}
          </div>
          {showTrial && (
            <p className="mt-1 text-sm text-denim-300 antialiased">{copy.trialNote}</p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {hasAppAccess ? (
              <>
                <Link
                  href={APP_ROUTES.home}
                  className="inline-flex items-center justify-center rounded-full bg-denim-500 px-6 py-3 text-base font-medium text-white antialiased transition-colors hover:bg-denim-400"
                >
                  Open app
                </Link>
                <span className="text-sm text-white/50 antialiased">
                  You already have access to the Fine Diet app.
                </span>
              </>
            ) : (
              <BuyOfferButton
                offerKey={primaryOffer.offerKey}
                label={copy.ctaLabel}
                placement="start-hero"
                source="start"
                variant="primary"
                size="lg"
              />
            )}
          </div>

          <ul className="mt-8 grid gap-2 sm:max-w-xl sm:grid-cols-2">
            {copy.bullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-2 text-sm text-white/70 antialiased"
              >
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-denim-400" />
                {bullet}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Practitioner-supported (clearly separate, premium) ──── */}
        {practitionerOffers.length > 0 && (
          <section className="mx-auto max-w-5xl px-4 pb-20">
            <div className="border-t border-neutral-700/50 pt-10">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 antialiased">
                Practitioner-supported (separate premium)
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-white/60 antialiased">
                Layered above the standard app + programs subscription. Not required to use the app.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {practitionerOffers.map((offer) => (
                  <OfferCard
                    key={offer.slug}
                    offer={offer}
                    placement="start-practitioner"
                    featured={false}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
