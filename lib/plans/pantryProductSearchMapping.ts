import type { GroceryPriceProviderCandidate } from './groceryPriceProviderTypes';
import type { PantryProductSearchOffer } from './pantryProductSearchTypes';

export interface PantryLotProductDraftFields {
  productTitle: string;
  brandName: string;
  packageSize: string;
  packageUnit: string;
  packageCount: string;
  retailer: string;
  priceAmount: string;
  currency: string;
}

export function toPantryProductSearchOffer(
  candidate: GroceryPriceProviderCandidate,
): PantryProductSearchOffer {
  return {
    provider_result_id: candidate.provider_result_id,
    title: candidate.title,
    retailer: candidate.retailer,
    price: candidate.price,
    currency: candidate.currency,
    package_size: candidate.package_size,
    package_unit: candidate.package_unit,
    package_text: candidate.package_text,
    image_url: candidate.image_url,
  };
}

export function applyPantryProductOfferToLotDraft<T extends PantryLotProductDraftFields>(
  draft: T,
  offer: PantryProductSearchOffer,
): T {
  return {
    ...draft,
    productTitle: offer.title,
    retailer: offer.retailer,
    priceAmount: offer.price == null ? draft.priceAmount : String(offer.price),
    currency: offer.currency ?? draft.currency,
    packageSize: offer.package_size == null ? draft.packageSize : String(offer.package_size),
    packageUnit: offer.package_unit ?? draft.packageUnit,
  };
}
