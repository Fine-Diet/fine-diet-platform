/**
 * Legacy Fine Diet staples were stored as verified common foods with
 * `source_provider` NULL. Sectioning used to send every non-USDA,
 * non-user, non-provisional row to `other`, which hid those staples
 * behind USDA variants of the same food.
 *
 * Only a verified `common` row with a null/blank provider qualifies.
 * Named providers (usda, fine_diet, off, fdc, unknown) keep their
 * existing rules. Unverified, user, provisional, and branded rows are
 * not promoted.
 */

export function isVerifiedCanonicalCommonFood(food: {
  sourceProvider?: string | null;
  sourceType?: string | null;
  isVerified?: boolean | null;
}): boolean {
  if (food.isVerified !== true) return false;
  if (food.sourceType !== 'common') return false;
  const provider = food.sourceProvider;
  if (provider == null) return true;
  return provider.trim() === '';
}
