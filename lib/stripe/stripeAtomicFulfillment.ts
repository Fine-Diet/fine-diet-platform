/** Server-only adapter for the atomic fulfillment RPC. No direct business writes. */
import { supabaseAdmin } from '@/lib/supabaseServerClient';

type FulfillmentDb = Pick<typeof supabaseAdmin, 'from' | 'rpc'>;
import { resolveEffectiveOfferEntitlementMappings } from '@/lib/access/offerEntitlementMappings';
import type { StripeAccountContext } from './stripeAccountContext';
import type { PurchaseAccessState } from './stripeLifecyclePolicy';

export interface FulfillmentInstance {
  id: string;
  person_id: string;
  offer_key: string;
  stripe_customer_id: string;
  price_option_key: string | null;
  fulfillment_revision?: string | number;
}
export interface FulfillmentReceipt { eventId: string; token: string; }
export interface AtomicFulfillmentInput {
  instance: FulfillmentInstance;
  context: StripeAccountContext;
  receipt: FulfillmentReceipt;
  state: PurchaseAccessState;
  sourceRef: string;
  paidThrough?: string | null;
  identifiers?: Record<string, string | null>;
  checkoutRecord?: Record<string, string | null> | null;
  /** Request-scoped client. Omitted callers keep the shared admin client. */
  db?: FulfillmentDb;
}

/** Sandbox legacy behavior remains available for staged migration only. */
export function atomicFulfillmentEnabled(livemode: boolean): boolean {
  const enabled = process.env.STRIPE_ATOMIC_FULFILLMENT === '1';
  if (livemode && !enabled) throw new Error('Live Stripe requires atomic fulfillment');
  return enabled;
}

export function fulfillmentRevision(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 19 &&
      (value.length < 19 || value <= '9223372036854775807')) return value;
  throw new Error('Missing or unsafe purchase revision; schema and read order must be verified');
}

export async function commitStripeFulfillment(input: AtomicFulfillmentInput): Promise<void> {
  const { instance, context, receipt, state, sourceRef } = input;
  const db = input.db ?? supabaseAdmin;
  const revision = fulfillmentRevision(instance.fulfillment_revision);
  if (!receipt.eventId || !receipt.token || !sourceRef) throw new Error('Missing fulfillment receipt or reference');
  let entitlements: Array<{ entitlement_key: string; duration_days: number | null }> = [];
  if (state === 'active') {
    // Never create schedules from a fulfillment retry. Initial atomic rollout
    // supports normal subscriptions and one-time payments only. Read the server
    // catalog rather than allowing Stripe metadata to select a billing model.
    const { data: offer, error: offerError } = await db.from('offers')
      .select('billing_model').eq('offer_key', instance.offer_key).maybeSingle();
    if (offerError) throw offerError;
    if (!offer) throw new Error('Purchase offer is missing');
    let model = offer.billing_model;
    if (instance.price_option_key) {
      const { data: option, error: optionError } = await db.from('price_options')
        .select('billing_model').eq('price_option_key', instance.price_option_key)
        .eq('offer_key', instance.offer_key).maybeSingle();
      if (optionError) throw optionError;
      if (!option) throw new Error('Purchase price option is missing');
      model = option.billing_model;
    }
    if (model !== 'subscription' && model !== 'one_time') {
      throw new Error('Billing model is not approved for atomic fulfillment');
    }
    const { data: mappings, error } = await db.from('offer_entitlements')
      .select('entitlement_key, duration_days, is_active').eq('offer_key', instance.offer_key).eq('is_active', true);
    if (error) throw error;
    entitlements = resolveEffectiveOfferEntitlementMappings(instance.offer_key, mappings);
    if (!entitlements.length) throw new Error('No active entitlement mappings for purchased offer');
  }
  const { data, error } = await db.rpc('fd_commit_stripe_fulfillment', { p_input: {
    instance_id: instance.id, person_id: instance.person_id, offer_key: instance.offer_key,
    customer_id: instance.stripe_customer_id, expected_revision: revision,
    event_id: receipt.eventId, token: receipt.token, account_id: context.accountId, livemode: context.livemode,
    state, source_ref: sourceRef, identifiers: input.identifiers ?? {}, entitlements,
    paid_through: input.paidThrough ?? null,
    checkout_record: input.checkoutRecord ?? null,
  } });
  if (error) throw error;
  if (!data || data.receipt_completed !== true ||
      (data.status !== 'committed' && data.status !== 'already_processed')) {
    throw new Error('Atomic fulfillment did not confirm a committed receipt');
  }
}
