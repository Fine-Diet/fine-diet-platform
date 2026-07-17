/**
 * Validation helpers for grocery price search inputs.
 */

const MAX_RETAILER_LENGTH = 80;
const MAX_POSTAL_CODE_LENGTH = 16;
const MAX_PRODUCT_TITLE_LENGTH = 200;
const MAX_BRAND_LENGTH = 120;
const MAX_URL_LENGTH = 2048;

const US_POSTAL_RE = /^\d{5}(-\d{4})?$/;
const CA_POSTAL_RE = /^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i;

export class GroceryPriceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryPriceValidationError';
  }
}

export function normalizeRetailer(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    throw new GroceryPriceValidationError('retailer is required');
  }
  if (trimmed.length > MAX_RETAILER_LENGTH) {
    throw new GroceryPriceValidationError(`retailer must be at most ${MAX_RETAILER_LENGTH} characters`);
  }
  return trimmed;
}

export function normalizePostalCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new GroceryPriceValidationError('postal_code is required');
  }
  if (trimmed.length > MAX_POSTAL_CODE_LENGTH) {
    throw new GroceryPriceValidationError(`postal_code must be at most ${MAX_POSTAL_CODE_LENGTH} characters`);
  }
  if (US_POSTAL_RE.test(trimmed)) return trimmed;
  if (CA_POSTAL_RE.test(trimmed)) return trimmed.replace(/\s+/g, ' ').toUpperCase();
  throw new GroceryPriceValidationError('postal_code must be a valid US ZIP or Canadian postal code');
}

export function normalizeOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    throw new GroceryPriceValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new GroceryPriceValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

export function normalizeUnitPrice(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new GroceryPriceValidationError('unit_price must be a non-negative number');
  }
  return Math.round(value * 100) / 100;
}

export function normalizePackageCount(value: unknown): number {
  if (value == null || value === '') return 1;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new GroceryPriceValidationError('package_count must be a positive number');
  }
  return value;
}

export function normalizeProductTitle(value: unknown): string {
  const title = normalizeOptionalText(value, 'product_title', MAX_PRODUCT_TITLE_LENGTH);
  if (!title) {
    throw new GroceryPriceValidationError('product_title is required');
  }
  return title;
}

export function normalizeBrandName(value: unknown): string | null {
  return normalizeOptionalText(value, 'brand_name', MAX_BRAND_LENGTH);
}

export function isSafeOutboundUrl(value: string | null | undefined): boolean {
  if (!value) return true;
  if (value.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function assertSafeOutboundUrl(value: string | null | undefined, field: string): string | null {
  if (value == null || value === '') return null;
  if (!isSafeOutboundUrl(value)) {
    throw new GroceryPriceValidationError(`${field} must be a valid http(s) URL`);
  }
  return value;
}
