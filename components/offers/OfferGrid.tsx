/**
 * OfferGrid — renders a set of offers as cards with entitlement-aware owned state.
 *
 * Accepts either explicit offers (SSR) or fetches them client-side via useOffers.
 */

import OfferCard from './OfferCard';
import { useOffers } from '@/lib/access/useOffers';
import type { OfferMarketingDTO } from '@/lib/access/offerCatalogService';

export interface OfferGridProps {
  /** Provide offers directly (e.g. from SSR). If omitted, fetches via useOffers. */
  offers?: OfferMarketingDTO[];
  kind?: 'all' | 'baseline' | 'practitioner';
  placement?: string;
  featuredSlug?: string;
}

export default function OfferGrid({
  offers: providedOffers,
  kind = 'all',
  placement = 'start',
  featuredSlug,
}: OfferGridProps) {
  const fetched = useOffers(kind);
  const offers = providedOffers ?? fetched.offers;
  const loading = providedOffers ? false : fetched.loading;

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl bg-neutral-800/30" />
        ))}
      </div>
    );
  }

  if (fetched.error && !providedOffers) {
    return <p className="text-sm text-red-400 antialiased">{fetched.error}</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {offers.map((offer) => (
        <OfferCard
          key={offer.slug}
          offer={offer}
          owned={fetched.isOwned(offer)}
          placement={placement}
          featured={featuredSlug ? offer.slug === featuredSlug : offer.role === 'default-public'}
        />
      ))}
    </div>
  );
}
