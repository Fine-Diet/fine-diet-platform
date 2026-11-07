/** Server-only, bounded paid-period evidence for the initial single-item rollout.
 * Invoice headers/current_period_end are not proof of paid service coverage.
 * No grace period is inferred. Unsupported/ambiguous responses remain retryable.
 */
import type Stripe from 'stripe';
import { stripe } from './stripeServer';
import { stripeReferenceId, subscriptionAccessState, type PurchaseAccessState } from './stripeLifecyclePolicy';

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}
function epoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function page(value: unknown): { data: JsonObject[]; has_more: boolean } {
  const result = object(value);
  if (!result || !Array.isArray(result.data) || typeof result.has_more !== 'boolean' || result.data.some(row => !object(row))) {
    throw new Error('Malformed Stripe evidence page');
  }
  return { data: result.data as JsonObject[], has_more: result.has_more };
}
function invoiceSubscription(invoice: JsonObject): string | null {
  const parent = object(invoice.parent);
  return stripeReferenceId(object(parent?.subscription_details)?.subscription ?? invoice.subscription);
}
interface Scope { subscription: string; customer: string; livemode: boolean; item: string; price: string; currency: string; }
export interface RenewalAccessDecision { state: PurchaseAccessState; paidThrough: string | null; }

function checkInvoiceIdentity(invoice: JsonObject, scope: Scope): void {
  if (typeof invoice.id !== 'string' || !invoice.id || invoice.livemode !== scope.livemode ||
      stripeReferenceId(invoice.customer) !== scope.customer || invoiceSubscription(invoice) !== scope.subscription ||
      invoice.currency !== scope.currency) throw new Error('Invoice evidence does not match the subscription');
}
function lineCovers(line: JsonObject, scope: Scope, now: number): boolean {
  const parent = object(line.parent), details = object(parent?.subscription_item_details);
  const subscriptionId = stripeReferenceId(details?.subscription ?? line.subscription);
  const itemId = stripeReferenceId(details?.subscription_item ?? line.subscription_item);
  const pricing = object(line.pricing), priceDetails = object(pricing?.price_details);
  const priceId = stripeReferenceId(priceDetails?.price ?? line.price);
  const isSubscription = parent ? parent.type === 'subscription_item_details' : line.type === 'subscription';
  const proration = details ? details.proration : line.proration;
  const period = object(line.period);
  return isSubscription && subscriptionId === scope.subscription && itemId === scope.item &&
    priceId === scope.price && line.livemode === scope.livemode && line.currency === scope.currency &&
    line.quantity === 1 && proration === false &&
    typeof line.amount === 'number' && Number.isSafeInteger(line.amount) && line.amount >= 0 &&
    !!period && epoch(period.start) && epoch(period.end) && period.end > period.start &&
    period.start <= now && now < period.end;
}

export async function resolveRenewalAccess(
  subscription: Stripe.Subscription, previousState: string,
  clock: () => number = () => Date.now() / 1000,
): Promise<RenewalAccessDecision> {
  const now = clock();
  if (!Number.isFinite(now) || now < 0) throw new Error('Invalid reconciliation clock');
  if (subscription.schedule || subscription.pause_collection || subscription.pending_update) {
    throw new Error('Scheduled, paused-collection or pending-change subscriptions require review');
  }
  if (subscription.status === 'trialing' && previousState !== 'ended') {
    const end = subscription.trial_end;
    return typeof end === 'number' && Number.isSafeInteger(end) && end > now
      ? { state: 'active', paidThrough: new Date(end * 1000).toISOString() }
      : { state: 'canceled', paidThrough: null };
  }
  if (previousState === 'ended' || !['active', 'past_due'].includes(subscription.status)) {
    return { state: subscriptionAccessState(subscription, previousState, now), paidThrough: null };
  }
  const items = page(subscription.items);
  const item = items.data[0], price = object(item?.price);
  const customer = stripeReferenceId(subscription.customer), priceId = stripeReferenceId(price);
  if (items.has_more || items.data.length !== 1 || !item || typeof item.id !== 'string' || item.quantity !== 1 ||
      !customer || !priceId || !price || typeof price.currency !== 'string' ||
      object(price.recurring)?.usage_type !== 'licensed') {
    throw new Error('Subscription is outside verified single-item coverage scope');
  }
  const scope: Scope = { subscription: subscription.id, customer, livemode: subscription.livemode,
    item: item.id, price: priceId, currency: price.currency };
  let reads = 0;
  const budget = () => { if (++reads > 12) throw new Error('Paid-period evidence read budget exceeded'); };

  async function covers(invoice: JsonObject): Promise<number | null> {
    checkInvoiceIdentity(invoice, scope);
    if (invoice.status !== 'paid' || invoice.amount_remaining !== 0) return null;
    const paidAt = object(invoice.status_transitions)?.paid_at;
    if (!epoch(paidAt) || paidAt > clock()) throw new Error('Paid invoice has invalid settlement timestamp');
    // Credited/refunded purchase policies are separate; do not infer coverage
    // from an adjusted invoice. Charge-level refunds/disputes still need review.
    if (typeof invoice.post_payment_credit_notes_amount !== 'number' || invoice.post_payment_credit_notes_amount !== 0) return null;
    const initial = page(invoice.lines);
    let lines = initial.data;
    if (initial.has_more) {
      lines = [];
      let cursor: string | undefined;
      for (let i = 0; i < 3; i++) {
        budget();
        const response = page(await stripe.invoices.listLineItems(invoice.id as string, {
          limit: 100, ...(cursor ? { starting_after: cursor } : {}),
        }));
        lines.push(...response.data);
        if (!response.has_more) break;
        const next = response.data[response.data.length - 1]?.id;
        if (i === 2 || typeof next !== 'string' || !next || next === cursor) throw new Error('Incomplete invoice line evidence');
        cursor = next;
      }
    }
    for (const line of lines) {
      if (line.invoice != null && stripeReferenceId(line.invoice) !== invoice.id) throw new Error('Invoice line ownership mismatch');
    }
    const matching = lines.find(line => lineCovers(line, scope, clock()));
    const end = object(matching?.period)?.end;
    return epoch(end) ? end : null;
  }

  const latest = object(subscription.latest_invoice);
  if (!latest) throw new Error('Latest subscription invoice must be expanded');
  checkInvoiceIdentity(latest, scope);
  // Do not make an uncollectible/void invoice a new paid period.
  const latestEnd = await covers(latest);
  if (latestEnd !== null) return { state: 'active', paidThrough: new Date(latestEnd * 1000).toISOString() };
  let cursor: string | undefined;
  for (let i = 0; i < 3; i++) {
    budget();
    const response = page(await stripe.invoices.list({ customer, subscription: subscription.id,
      status: 'paid', limit: 20, ...(cursor ? { starting_after: cursor } : {}),
    }));
    for (const invoice of response.data) {
      const end = await covers(invoice);
      if (end !== null) return { state: 'active', paidThrough: new Date(end * 1000).toISOString() };
    }
    if (!response.has_more) return { state: 'canceled', paidThrough: null };
    const next = response.data[response.data.length - 1]?.id;
    if (typeof next !== 'string' || !next || next === cursor) throw new Error('Incomplete paid-invoice evidence');
    cursor = next;
  }
  throw new Error('Paid-invoice history exceeds bounded review scope');
}

/** Compatibility helper for callers that need only the access state. */
export async function resolveRenewalAccessState(
  subscription: Stripe.Subscription, previousState: string,
  clock: () => number = () => Date.now() / 1000,
): Promise<PurchaseAccessState> {
  return (await resolveRenewalAccess(subscription, previousState, clock)).state;
}
