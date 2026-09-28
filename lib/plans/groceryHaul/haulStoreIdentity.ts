export function normalizeHaulStoreText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildManualHaulStoreIdentityKey(args: {
  retailer: string;
  storeLocation?: string | null;
  postalCode?: string | null;
}): string {
  const retailer = normalizeHaulStoreText(args.retailer);
  const location = normalizeHaulStoreText(args.storeLocation ?? '');
  const postal = normalizeHaulStoreText(args.postalCode ?? '');
  return [retailer, location, postal].filter(Boolean).join('|');
}

export function haulStoreDisplayLabel(store: {
  retailer: string;
  store_name: string | null;
}): string {
  const name = store.store_name?.trim();
  if (name && normalizeHaulStoreText(name) !== normalizeHaulStoreText(store.retailer)) {
    return name;
  }
  return store.retailer.trim();
}

export function haulStoreLocationLine(store: {
  store_location: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
}): string {
  if (store.store_location?.trim()) return store.store_location.trim();
  const parts = [
    store.address_line1,
    [store.city, store.region].filter(Boolean).join(', '),
    store.postal_code,
  ].filter((part) => part && String(part).trim());
  return parts.map((part) => String(part).trim()).join(' · ');
}
