/**
 * Brand-aware product-first grocery price search query assembly.
 */

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isEquivalentBrandRetailer(brand: string | null | undefined, retailer: string): boolean {
  if (!brand?.trim() || !retailer.trim()) return false;
  const normalizedBrand = normalizeComparable(brand);
  const normalizedRetailer = normalizeComparable(retailer);
  return (
    normalizedBrand === normalizedRetailer
    || normalizedRetailer.includes(normalizedBrand)
    || normalizedBrand.includes(normalizedRetailer)
  );
}

export function dedupeQueryTerms(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const part of parts) {
    const trimmed = part?.trim();
    if (!trimmed) continue;
    const key = normalizeComparable(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
  }
  return output.join(' ');
}

export function resolvePrimaryProductName(input: {
  canonical_name: string | null;
  preferred_product: string | null;
  required_ingredient_name: string;
}): string {
  return (
    input.canonical_name?.trim()
    || input.preferred_product?.trim()
    || input.required_ingredient_name.trim()
  );
}

export function buildBrandProductRetailerQuery(input: {
  brand_name: string | null;
  product_name: string;
  retailer: string;
  suffix?: string | null;
}): string | null {
  const productName = input.product_name.trim();
  const retailer = input.retailer.trim();
  if (!productName) return null;

  const brand = input.brand_name?.trim() ?? '';
  const appendRetailer = retailer.length > 0 && !isEquivalentBrandRetailer(brand, retailer);

  return dedupeQueryTerms([
    brand || null,
    productName,
    input.suffix?.trim() || null,
    appendRetailer ? retailer : null,
  ]);
}
