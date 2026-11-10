/** Pure access decisions from current Stripe objects, never event arrival order. */
export type PurchaseAccessState = 'active' | 'canceled' | 'ended';
export interface FineDietAttribution { personId: string; offerKey: string; }

export function stripeReferenceId(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id;
  return null;
}

export function readFineDietAttribution(metadata: Record<string, string> | null | undefined): FineDietAttribution | null {
  const personId = metadata?.person_id?.trim();
  const offerKey = metadata?.offer_key?.trim();
  // Unrelated services can share the same live account. Missing BOTH keys is
  // not an app purchase. Partial attribution is a broken app event, not a skip.
  if (!personId && !offerKey) return null;
  if (!personId || !offerKey) throw new Error('Incomplete Fine Diet payment attribution');
  return { personId, offerKey };
}

export function checkoutPaymentReady(session: { status: string | null; payment_status: string }): boolean {
  return session.status === 'complete' &&
    (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
}

export function subscriptionAccessState(
  subscription: { status: string; latest_invoice: unknown; trial_end?: number | null },
  previousState: string,
  nowSeconds: number = Date.now() / 1000,
): PurchaseAccessState {
  // An ended local purchase is terminal. Buying again needs a new subscription.
  if (previousState === 'ended' || subscription.status === 'canceled' || subscription.status === 'incomplete_expired') return 'ended';
  if (subscription.status === 'trialing') {
    return typeof subscription.trial_end === 'number' && subscription.trial_end > nowSeconds ? 'active' : 'canceled';
  }
  if (subscription.status !== 'active') return 'canceled';
  const invoice = subscription.latest_invoice;
  if (typeof invoice === 'string') throw new Error('Current subscription invoice was not expanded');
  // Preserve immediate suspension for unpaid subscriptions. A paid OLD invoice
  // event must not grant access when the current/latest invoice is outstanding.
  return invoice && typeof invoice === 'object' && 'status' in invoice && invoice.status === 'paid' ? 'active' : 'canceled';
}
