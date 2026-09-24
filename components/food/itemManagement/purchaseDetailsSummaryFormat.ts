export interface PurchaseDetailsSummaryInput {
  productTitle: string;
  brandName: string;
  packageSize: string;
  packageUnit: string;
  packageCount: string;
  retailer: string;
  priceAmount: string;
  currency: string;
}

function formatPrice(amount: string, currency: string): string | null {
  const trimmed = amount.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return trimmed;
  const code = currency.trim().toUpperCase() || 'USD';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).format(numeric);
  } catch {
    return `${numeric} ${code}`;
  }
}

export type PurchaseDetailsSummaryFormatOptions = {
  brandPrefix?: boolean;
  packageCountStyle?: 'symbol' | 'letter-x';
};

function formatPackageLine(
  input: PurchaseDetailsSummaryInput,
  packageCountStyle: 'symbol' | 'letter-x' = 'symbol',
): string | null {
  const size = input.packageSize.trim();
  const unit = input.packageUnit.trim();
  const count = input.packageCount.trim();
  const sizeText = size
    ? `${size}${unit ? ` ${unit}` : ''}`
    : null;
  const countText = count
    ? packageCountStyle === 'letter-x'
      ? `x ${count}`
      : `× ${count}`
    : null;
  if (sizeText && countText) {
    return packageCountStyle === 'letter-x'
      ? `${sizeText} ${countText}`
      : `${sizeText} ${countText}`;
  }
  return sizeText ?? countText;
}

function brandAddsInformation(productTitle: string, brandName: string): boolean {
  const brand = brandName.trim();
  if (!brand) return false;
  const title = productTitle.trim().toLowerCase();
  return !title.includes(brand.toLowerCase());
}

export function formatPurchaseDetailsSummary(
  input: PurchaseDetailsSummaryInput,
  options?: PurchaseDetailsSummaryFormatOptions,
): {
  productTitle: string;
  brandLine: string | null;
  packageRetailerLine: string | null;
  priceLine: string | null;
  hasDetails: boolean;
} {
  const productTitle = input.productTitle.trim() || 'No product details yet';
  const rawBrand = brandAddsInformation(input.productTitle, input.brandName)
    ? input.brandName.trim()
    : null;
  const brandLine = rawBrand
    ? (options?.brandPrefix ? `Brand: ${rawBrand}` : rawBrand)
    : null;
  const packagePart = formatPackageLine(
    input,
    options?.packageCountStyle ?? 'symbol',
  );
  const retailer = input.retailer.trim();
  const packageRetailerLine = [packagePart, retailer].filter(Boolean).join(' · ') || null;
  const priceLine = formatPrice(input.priceAmount, input.currency);
  const hasDetails = Boolean(
    input.productTitle.trim()
    || input.brandName.trim()
    || packagePart
    || retailer
    || priceLine,
  );
  return {
    productTitle,
    brandLine,
    packageRetailerLine,
    priceLine,
    hasDetails,
  };
}
