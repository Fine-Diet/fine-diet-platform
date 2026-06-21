/**
 * Pricing module adapter — resolves an offer + its price options into a
 * frontend-safe pricing module DTO.
 *
 *   offer (marketed package)
 * + price options (presentation zones + checkout-mode behavior)
 * + presentation overrides
 * = PricingModuleDTO
 *
 * PURE + SSR/client-safe (no server-only imports). The output contains ONLY
 * display fields. It NEVER includes Stripe price IDs — billing truth stays in
 * the `price_options`/`offers` tables and is read server-side at checkout.
 */

import type {
  PricingCardDTO,
  PricingModuleDTO,
  PricingModuleLayout,
} from './pricingCardDTO';
import {
  getPriceOptionPresentation,
  listPriceOptionPresentations,
  type PriceOptionPresentation,
} from './priceOptionConfig';
import { getOfferConfigByOfferKey } from './offerConfig';

/** Override a single price option's zones/behavior at render time. */
export interface PricingPresentationOverride {
  zones?: Partial<PricingCardDTO['zones']>;
  behavior?: Partial<PricingCardDTO['behavior']>;
}

export interface BuildPricingModuleParams {
  /** Parent offer (marketed package) whose price options to render. */
  offerKey: string;
  /**
   * Which price options to include, in order. When omitted, all configured
   * price options for the offer are used (ascending by sortOrder).
   */
  priceOptionKeys?: string[];
  layout?: PricingModuleLayout;
  /** Per-priceOptionKey display overrides (e.g. featured flag, badge copy). */
  presentationOverrides?: Record<string, PricingPresentationOverride>;
}

function toCardDTO(
  presentation: PriceOptionPresentation,
  offerEyebrowFallback: string | null,
  override?: PricingPresentationOverride,
): PricingCardDTO {
  const zones: PricingCardDTO['zones'] = {
    ...presentation.zones,
    // Fall back to the parent offer's eyebrow when a price option omits one.
    eyebrow: presentation.zones.eyebrow ?? offerEyebrowFallback ?? null,
    ...(override?.zones ?? {}),
  };

  const behavior: PricingCardDTO['behavior'] = {
    checkoutMode: presentation.checkoutMode,
    isFeatured: presentation.isFeatured ?? false,
    isDisabled: presentation.isDisabled ?? false,
    ...(override?.behavior ?? {}),
  };

  return {
    offerKey: presentation.offerKey,
    priceOptionKey: presentation.priceOptionKey,
    zones,
    behavior,
  };
}

/**
 * Build the frontend-safe pricing module DTO for an offer.
 *
 * Unknown / non-matching price option keys are skipped (resilient for SSR), so
 * a stale key never crashes a page. The result is JSON-serializable.
 */
export function buildPricingModuleDTO(
  params: BuildPricingModuleParams,
): PricingModuleDTO {
  const {
    offerKey,
    priceOptionKeys,
    layout = 'grid',
    presentationOverrides,
  } = params;

  // Offer-level marketing copy fallback (parent offer may not be in code config).
  const offerConfig = getOfferConfigByOfferKey(offerKey);
  const offerEyebrow = offerConfig?.copy.eyebrow ?? null;

  const presentations: PriceOptionPresentation[] = priceOptionKeys?.length
    ? priceOptionKeys
        .map((key) => getPriceOptionPresentation(key))
        .filter(
          (p): p is PriceOptionPresentation =>
            Boolean(p) && p!.offerKey === offerKey,
        )
    : listPriceOptionPresentations(offerKey);

  const cards = presentations.map((presentation) =>
    toCardDTO(
      presentation,
      offerEyebrow,
      presentationOverrides?.[presentation.priceOptionKey],
    ),
  );

  return {
    offerKey,
    layout,
    cards,
  };
}
