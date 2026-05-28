import { isKnownEntitlementKey } from './constants';

export interface OfferReadinessOffer {
  offer_key: string;
  is_active: boolean;
  stripe_price_id?: string | null;
}

export interface OfferReadinessEntitlementMapping {
  offer_key: string;
  entitlement_key: string;
  is_active: boolean;
}

export interface DuplicateStripePriceFinding {
  stripe_price_id: string;
  offer_keys: string[];
}

export interface UnknownEntitlementFinding {
  offer_key: string;
  entitlement_key: string;
}

export interface TypoLikeOfferFinding {
  offer_key: string;
  similar_offer_key: string;
  distance: number;
}

export interface OfferWithoutMappingsFinding {
  offer_key: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

export function findDuplicateActiveStripePriceIds(
  offers: OfferReadinessOffer[],
): DuplicateStripePriceFinding[] {
  const activeOfferKeysByPriceId = new Map<string, string[]>();

  for (const offer of offers) {
    const stripePriceId = offer.stripe_price_id?.trim();
    if (!offer.is_active || !stripePriceId) continue;

    const offerKeys = activeOfferKeysByPriceId.get(stripePriceId) ?? [];
    offerKeys.push(offer.offer_key);
    activeOfferKeysByPriceId.set(stripePriceId, offerKeys);
  }

  return Array.from(activeOfferKeysByPriceId.entries())
    .filter(([, offerKeys]) => offerKeys.length > 1)
    .map(([stripe_price_id, offerKeys]) => ({
      stripe_price_id,
      offer_keys: offerKeys.sort(),
    }))
    .sort((a, b) => a.stripe_price_id.localeCompare(b.stripe_price_id));
}

export function findUnknownActiveOfferEntitlementKeys(
  offers: OfferReadinessOffer[],
  mappings: OfferReadinessEntitlementMapping[],
): UnknownEntitlementFinding[] {
  const activeOfferKeys = new Set(
    offers.filter((offer) => offer.is_active).map((offer) => offer.offer_key),
  );

  return mappings
    .filter(
      (mapping) =>
        mapping.is_active &&
        activeOfferKeys.has(mapping.offer_key) &&
        !isKnownEntitlementKey(mapping.entitlement_key),
    )
    .map((mapping) => ({
      offer_key: mapping.offer_key,
      entitlement_key: normalize(mapping.entitlement_key),
    }))
    .sort((a, b) =>
      `${a.offer_key}:${a.entitlement_key}`.localeCompare(
        `${b.offer_key}:${b.entitlement_key}`,
      ),
    );
}

export function findInactiveTypoLikeOffers(
  offers: OfferReadinessOffer[],
  maxDistance = 3,
): TypoLikeOfferFinding[] {
  const inactiveOffers = offers.filter((offer) => !offer.is_active);
  const activeOfferKeys = offers
    .filter((offer) => offer.is_active)
    .map((offer) => offer.offer_key);

  const findings: TypoLikeOfferFinding[] = [];

  for (const inactiveOffer of inactiveOffers) {
    for (const activeOfferKey of activeOfferKeys) {
      const distance = levenshteinDistance(inactiveOffer.offer_key, activeOfferKey);
      if (distance <= maxDistance) {
        findings.push({
          offer_key: inactiveOffer.offer_key,
          similar_offer_key: activeOfferKey,
          distance,
        });
      }
    }
  }

  return findings.sort((a, b) =>
    `${a.offer_key}:${a.similar_offer_key}`.localeCompare(
      `${b.offer_key}:${b.similar_offer_key}`,
    ),
  );
}

export function findActiveOffersWithoutEntitlementMappings(
  offers: OfferReadinessOffer[],
  mappings: OfferReadinessEntitlementMapping[],
): OfferWithoutMappingsFinding[] {
  const offerKeysWithActiveMappings = new Set(
    mappings
      .filter((mapping) => mapping.is_active)
      .map((mapping) => mapping.offer_key),
  );

  return offers
    .filter(
      (offer) =>
        offer.is_active && !offerKeysWithActiveMappings.has(offer.offer_key),
    )
    .map((offer) => ({ offer_key: offer.offer_key }))
    .sort((a, b) => a.offer_key.localeCompare(b.offer_key));
}
