/**
 * Start Pages — server-only validation of the offer + price-option selection.
 *
 * Verifies that a Start Page references a real parent offer and only approved
 * price options. This NEVER reads or returns Stripe price IDs — it selects only
 * key / offer membership / active flags. Billing truth resolution stays in
 * `lib/access/priceOptionBillingService.ts` (checkout path).
 *
 * Imports `supabaseAdmin`, so it is server-only by construction.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';

export type PriceOptionIssueReason = 'unknown' | 'inactive' | 'offer_mismatch';

export interface PriceOptionIssue {
  priceOptionKey: string;
  reason: PriceOptionIssueReason;
}

export interface StartPageSelectionValidation {
  ok: boolean;
  /** Hard errors that must block publish. */
  errors: string[];
  /** Per-key issues for the selected price options. */
  priceOptionIssues: PriceOptionIssue[];
  /** Non-blocking advisories (e.g. inactive offer, empty selection). */
  warnings: string[];
}

/** Safe (non-billing) projection used for validation + editor pickers. */
export interface SafePriceOption {
  priceOptionKey: string;
  offerKey: string;
  isActive: boolean;
  name: string;
  sortOrder: number;
}

/** List approved price options for an offer (safe fields only, no Stripe IDs). */
export async function listSafePriceOptionsForOffer(
  offerKey: string,
): Promise<SafePriceOption[]> {
  const { data, error } = await supabaseAdmin
    .from('price_options')
    .select('price_option_key, offer_key, is_active, name, sort_order')
    .eq('offer_key', offerKey)
    .order('sort_order', { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({
    priceOptionKey: row.price_option_key as string,
    offerKey: row.offer_key as string,
    isActive: Boolean(row.is_active),
    name: (row.name as string) ?? row.price_option_key,
    sortOrder: (row.sort_order as number) ?? 0,
  }));
}

/**
 * Validate the offer + price-option selection for a Start Page.
 *
 * Rules:
 *   - `primaryOfferKey` must exist in `offers` (warn if inactive).
 *   - Each `priceOptionKey` must exist, be active, and belong to the offer.
 */
export async function validateStartPageSelection(
  primaryOfferKey: string,
  priceOptionKeys: string[],
): Promise<StartPageSelectionValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const priceOptionIssues: PriceOptionIssue[] = [];

  // 1) Parent offer must exist.
  const { data: offerRow, error: offerErr } = await supabaseAdmin
    .from('offers')
    .select('offer_key, is_active')
    .eq('offer_key', primaryOfferKey)
    .maybeSingle();

  if (offerErr || !offerRow) {
    errors.push(`Primary offer "${primaryOfferKey}" was not found.`);
    // Without a valid offer, price-option membership cannot be checked.
    return { ok: false, errors, priceOptionIssues, warnings };
  }
  if (!offerRow.is_active) {
    warnings.push(`Primary offer "${primaryOfferKey}" is currently inactive.`);
  }

  // 2) De-duplicate while preserving order; flag duplicates as a warning.
  const seen = new Set<string>();
  const uniqueKeys: string[] = [];
  for (const key of priceOptionKeys) {
    if (seen.has(key)) {
      warnings.push(`Duplicate price option "${key}" was ignored.`);
      continue;
    }
    seen.add(key);
    uniqueKeys.push(key);
  }

  if (uniqueKeys.length === 0) {
    warnings.push('No price options selected — the page will fall back to default plan cards.');
    return { ok: errors.length === 0, errors, priceOptionIssues, warnings };
  }

  // 3) Resolve the selected price options (safe fields only).
  const { data: rows, error: optErr } = await supabaseAdmin
    .from('price_options')
    .select('price_option_key, offer_key, is_active')
    .in('price_option_key', uniqueKeys);

  if (optErr) {
    errors.push('Failed to validate price options.');
    return { ok: false, errors, priceOptionIssues, warnings };
  }

  const byKey = new Map(
    (rows ?? []).map((r) => [
      r.price_option_key as string,
      { offerKey: r.offer_key as string, isActive: Boolean(r.is_active) },
    ]),
  );

  for (const key of uniqueKeys) {
    const found = byKey.get(key);
    if (!found) {
      priceOptionIssues.push({ priceOptionKey: key, reason: 'unknown' });
    } else if (found.offerKey !== primaryOfferKey) {
      priceOptionIssues.push({ priceOptionKey: key, reason: 'offer_mismatch' });
    } else if (!found.isActive) {
      priceOptionIssues.push({ priceOptionKey: key, reason: 'inactive' });
    }
  }

  if (priceOptionIssues.length > 0) {
    for (const issue of priceOptionIssues) {
      const label =
        issue.reason === 'unknown'
          ? 'does not exist'
          : issue.reason === 'offer_mismatch'
            ? `does not belong to offer "${primaryOfferKey}"`
            : 'is inactive';
      errors.push(`Price option "${issue.priceOptionKey}" ${label}.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    priceOptionIssues,
    warnings,
  };
}
