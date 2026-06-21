/**
 * Price option billing service — SERVER-ONLY billing-truth resolution.
 *
 * Loads a `price_options` row and validates it against its parent offer, then
 * returns the billing model + Stripe price/phase/trial data needed to create a
 * Checkout Session. This is the ONLY place price IDs are read for a price
 * option, and it must never run in client/SSR-serialized code paths that ship
 * to the browser.
 *
 * Imports `supabaseAdmin`, so it is server-only by construction.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';

export type PriceOptionBillingModel =
  | 'one_time'
  | 'subscription'
  | 'installment'
  | 'intro_then_subscription';

export interface PriceOptionBilling {
  priceOptionKey: string;
  offerKey: string;
  billingModel: PriceOptionBillingModel;
  stripePriceId: string | null;
  stripePhasePriceIds: string[] | null;
  stripePhaseIterations: number[] | null;
  introPriceId: string | null;
  introIterations: number | null;
  renewalPriceId: string | null;
  trialPeriodDays: number | null;
}

export type PriceOptionResolutionError =
  | 'not_found'
  | 'offer_mismatch'
  | 'inactive';

export type PriceOptionResolution =
  | { ok: true; billing: PriceOptionBilling }
  | { ok: false; error: PriceOptionResolutionError };

interface PriceOptionRow {
  price_option_key: string;
  offer_key: string;
  is_active: boolean;
  billing_model: string;
  stripe_price_id: string | null;
  stripe_phase_price_ids: string[] | null;
  stripe_phase_iterations: number[] | null;
  intro_price_id: string | null;
  intro_iterations: number | null;
  renewal_price_id: string | null;
  trial_period_days: number | null;
}

const PRICE_OPTION_COLUMNS =
  'price_option_key, offer_key, is_active, billing_model, stripe_price_id, stripe_phase_price_ids, stripe_phase_iterations, intro_price_id, intro_iterations, renewal_price_id, trial_period_days';

/**
 * Resolve + validate a price option's billing truth for a given parent offer.
 *
 * Rules:
 *  - The price option must exist.
 *  - It must belong to `offerKey` (the marketed package being checked out).
 *  - It must be active.
 */
export async function resolvePriceOptionBilling(
  offerKey: string,
  priceOptionKey: string,
): Promise<PriceOptionResolution> {
  const { data, error } = await supabaseAdmin
    .from('price_options')
    .select(PRICE_OPTION_COLUMNS)
    .eq('price_option_key', priceOptionKey)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: 'not_found' };
  }

  const row = data as PriceOptionRow;

  if (row.offer_key !== offerKey) {
    return { ok: false, error: 'offer_mismatch' };
  }

  if (!row.is_active) {
    return { ok: false, error: 'inactive' };
  }

  return {
    ok: true,
    billing: {
      priceOptionKey: row.price_option_key,
      offerKey: row.offer_key,
      billingModel: (row.billing_model || 'subscription') as PriceOptionBillingModel,
      stripePriceId: row.stripe_price_id,
      stripePhasePriceIds: row.stripe_phase_price_ids,
      stripePhaseIterations: row.stripe_phase_iterations,
      introPriceId: row.intro_price_id,
      introIterations: row.intro_iterations,
      renewalPriceId: row.renewal_price_id,
      trialPeriodDays: row.trial_period_days,
    },
  };
}
