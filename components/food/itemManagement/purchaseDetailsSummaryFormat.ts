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

function formatPackageLine(input: PurchaseDetailsSummaryInput): string | null {
  const size = input.packageSize.trim();
  const unit = input.packageUnit.trim();
  const count = input.packageCount.trim();
  const sizeText = size
    ? `${size}${unit ? ` ${unit}` : ''}`
    : null;
  const countText = count ? `× ${count}` : null;
  if (sizeText && countText) return `${sizeText} ${countText}`;
  return sizeText ?? countText;
}

function brandAddsInformation(productTitle: string, brandName: string): boolean {
  const brand = brandName.trim();
  if (!brand) return false;
  const title = productTitle.trim().toLowerCase();
  return !title.includes(brand.toLowerCase());
}

export function formatPurchaseDetailsSummary(input: PurchaseDetailsSummaryInput): {
  productTitle: string;
  brandLine: string | null;
  packageRetailerLine: string | null;
  priceLine: string | null;
  hasDetails: boolean;
} {
  const productTitle = input.productTitle.trim() || 'No product details yet';
  const brandLine = brandAddsInformation(input.productTitle, input.brandName)
    ? input.brandName.trim()
    : null;
  const packagePart = formatPackageLine(input);
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
