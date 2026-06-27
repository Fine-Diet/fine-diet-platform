/**
 * P1b — runtime-enabled program registry.
 *
 * Replaces the hardcoded `slug === 'baseline'` gating in the journal program
 * detail route. A program is "runtime-enabled" when it participates in the
 * guided runtime experience (enrollment, day/check-in cadence, delivery
 * modules). The detail route renders the runtime header/state/check-in for
 * runtime-enabled programs even before enrollment (start-ready), exactly as
 * Baseline does today.
 *
 * Currently only Baseline is enabled, preserving existing behavior precisely.
 * Additional programs become runtime-capable by registration (no schema change).
 */

const RUNTIME_ENABLED_PROGRAM_SLUGS = new Set<string>(['baseline']);

export function isProgramRuntimeEnabled(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return RUNTIME_ENABLED_PROGRAM_SLUGS.has(slug.trim().toLowerCase());
}
