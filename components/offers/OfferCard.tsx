/**
 * OfferCard — presents a single configured offer with a checkout CTA.
 *
 * Reads marketing-safe offer data (no Stripe IDs). Trial copy is shown only
 * for offers that define a trial; buy-now offers intentionally omit it. When
 * the user already owns the access this offer grants, the CTA switches to an
 * "Open app" link instead of checkout.
 */

import Link from 'next/link';
import BuyOfferButton from '@/components/checkout/BuyOfferButton';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import type { OfferMarketingDTO } from '@/lib/access/offerCatalogService';

export interface OfferCardProps {
  offer: OfferMarketingDTO;
  owned?: boolean;
  placement?: string;
  featured?: boolean;
}

export default function OfferCard({
  offer,
  owned = false,
  placement = 'start',
  featured = false,
}: OfferCardProps) {
  const { copy, priceLabel, priceSuffix, trialDays, checkoutMode } = offer;
  const showTrial = checkoutMode === 'trial' && trialDays > 0 && Boolean(copy.trialNote);

  return (
    <div
      className={`flex flex-col rounded-2xl border p-6 ${
        featured
          ? 'border-denim-500/60 bg-neutral-800/60'
          : 'border-neutral-700/50 bg-neutral-800/40'
      }`}
    >
      {copy.eyebrow && (
        <span className="text-xs font-semibold uppercase tracking-wider text-denim-400 antialiased">
          {copy.eyebrow}
        </span>
      )}

      <h3 className="mt-2 text-xl font-semibold text-white antialiased">{copy.title}</h3>
      <p className="mt-2 text-sm text-white/70 antialiased">{copy.subtitle}</p>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white antialiased">{priceLabel}</span>
        {priceSuffix && <span className="text-sm text-white/50 antialiased">{priceSuffix}</span>}
      </div>

      {showTrial && (
        <p className="mt-1 text-xs text-denim-300 antialiased">{copy.trialNote}</p>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {copy.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2 text-sm text-white/70 antialiased">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-denim-400" />
            {bullet}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {owned ? (
          <Link
            href={APP_ROUTES.home}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-800/60 px-5 py-2.5 text-sm font-medium text-white antialiased transition-colors hover:bg-neutral-800/80 border border-neutral-700/50"
          >
            Open app
          </Link>
        ) : (
          <BuyOfferButton
            offerKey={offer.offerKey}
            label={copy.ctaLabel}
            placement={placement}
            source="start"
            variant={featured ? 'primary' : 'secondary'}
            size="md"
          />
        )}
      </div>
    </div>
  );
}
