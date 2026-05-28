export interface OfferEntitlementMapping {
  entitlement_key: string;
  duration_days?: number | null;
  is_active?: boolean | null;
}

export interface EffectiveOfferEntitlementMapping {
  entitlement_key: string;
  duration_days: number | null;
}

const CODE_OWNED_OFFER_ENTITLEMENTS: Record<
  string,
  EffectiveOfferEntitlementMapping[]
> = {
  'journal-annual': [
    { entitlement_key: 'journal', duration_days: null },
    { entitlement_key: 'program:baseline', duration_days: null },
  ],
};

function normalizeOfferKey(offerKey: string): string {
  return offerKey.trim().toLowerCase();
}

function normalizeEntitlementKey(entitlementKey: string): string {
  return entitlementKey.trim().toLowerCase();
}

export function getCodeOwnedOfferEntitlementMappings(
  offerKey: string,
): EffectiveOfferEntitlementMapping[] {
  return CODE_OWNED_OFFER_ENTITLEMENTS[normalizeOfferKey(offerKey)] ?? [];
}

export function resolveEffectiveOfferEntitlementMappings(
  offerKey: string,
  databaseMappings: OfferEntitlementMapping[] | null | undefined,
): EffectiveOfferEntitlementMapping[] {
  const merged = new Map<string, EffectiveOfferEntitlementMapping>();

  for (const mapping of databaseMappings ?? []) {
    if (mapping.is_active === false) continue;

    const entitlementKey = normalizeEntitlementKey(mapping.entitlement_key);
    if (!entitlementKey) continue;

    merged.set(entitlementKey, {
      entitlement_key: entitlementKey,
      duration_days: mapping.duration_days ?? null,
    });
  }

  for (const mapping of getCodeOwnedOfferEntitlementMappings(offerKey)) {
    const entitlementKey = normalizeEntitlementKey(mapping.entitlement_key);
    if (!entitlementKey || merged.has(entitlementKey)) continue;

    merged.set(entitlementKey, {
      entitlement_key: entitlementKey,
      duration_days: mapping.duration_days ?? null,
    });
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.entitlement_key.localeCompare(b.entitlement_key),
  );
}
