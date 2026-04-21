/**
 * Body-measurement display helpers
 *
 * Pure presentation: canonical storage is still cm for height and kg
 * for weight (see people.metadata + body_measurements). These helpers
 * only convert canonical values to the user's preferred display unit,
 * consistently across the Plans banner and the Profile UI.
 *
 * Rules:
 *   - Standard height ("in"): render as `X ft Y in` (e.g., 74 in →
 *     "6 ft 2 in"). Never render raw inches.
 *   - Metric height ("cm"): render as a clean integer (e.g., 188 cm).
 *   - Weight in either unit: show up to 1 decimal, but trim a trailing
 *     `.0` so `185.0` reads as `185` and `83.9` stays `83.9`.
 */

export type HeightDisplayUnit = 'in' | 'cm';
export type WeightDisplayUnit = 'lb' | 'kg';

export const CM_PER_IN = 2.54;
export const KG_PER_LB = 0.45359237;

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/**
 * Split total inches into whole feet + remainder inches, rounding the
 * inches component to the nearest integer so `74.0157` inches (from
 * 188 cm round-trip) reads as `6 ft 2 in`, not `6 ft 2.02 in`. If
 * rounding pushes inches to 12, carry to the next foot.
 */
export function splitFeetInches(totalInches: number): { ft: number; in: number } {
  const safe = Math.max(0, totalInches);
  let ft = Math.floor(safe / 12);
  let inches = Math.round(safe - ft * 12);
  if (inches === 12) {
    ft += 1;
    inches = 0;
  }
  return { ft, in: inches };
}

export function feetInchesToTotalInches(ft: number, inches: number): number {
  const safeFt = Math.max(0, Math.floor(ft));
  const safeIn = Math.max(0, inches);
  return safeFt * 12 + safeIn;
}

/**
 * Trim a trailing `.0` from a decimal string. `185.0 → "185"`,
 * `83.9 → "83.9"`, `83.00 → "83"`. Uses toFixed(maxDecimals) first so
 * floating-point noise like `83.89999` renders as `83.9`.
 */
export function trimTrailingZero(value: number, maxDecimals = 1): string {
  const fixed = value.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, '') || '0';
}

export function formatHeightForDisplay(
  cm: number | null,
  unit: HeightDisplayUnit,
): string {
  if (cm === null) return 'not set';
  if (unit === 'cm') return `${Math.round(cm)} cm`;
  const totalIn = cmToIn(cm);
  const { ft, in: inches } = splitFeetInches(totalIn);
  return inches === 0 ? `${ft} ft` : `${ft} ft ${inches} in`;
}

export function formatWeightForDisplay(
  kg: number | null,
  unit: WeightDisplayUnit,
): string {
  if (kg === null) return 'not set';
  const value = unit === 'lb' ? kgToLb(kg) : kg;
  return `${trimTrailingZero(value, 1)} ${unit}`;
}
