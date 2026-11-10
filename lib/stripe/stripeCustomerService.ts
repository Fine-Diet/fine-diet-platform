/**
 * Customer IDs are scoped to both Stripe account and livemode.
 * Legacy stripe_customers is read only during migration; no live checkout
 * ever falls back to it.
 */
import { stripe } from './stripeServer';
import { getStripeAccountContext } from './stripeAccountContext';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

export async function findStripeCustomerForPerson(personId: string): Promise<string | null> {
  const { accountId, livemode } = getStripeAccountContext();
  const { data, error } = await supabaseAdmin
    .from('stripe_customer_accounts')
    .select('stripe_customer_id')
    .eq('person_id', personId)
    .eq('stripe_account_id', accountId)
    .eq('livemode', livemode)
    .maybeSingle();
  if (error) throw error;
  return data?.stripe_customer_id ?? null;
}

export async function ensureStripeCustomerForPerson(personId: string, email: string): Promise<string> {
  const existing = await findStripeCustomerForPerson(personId);
  if (existing) return existing;

  const { accountId, livemode } = getStripeAccountContext();
  const customer = await stripe.customers.create(
    { email, metadata: { person_id: personId } },
    { idempotencyKey: `fd-customer-${accountId}-${livemode}-${personId}` },
  );
  const { error } = await supabaseAdmin.from('stripe_customer_accounts').upsert({
    person_id: personId,
    stripe_account_id: accountId,
    livemode,
    stripe_customer_id: customer.id,
    email,
  }, { onConflict: 'person_id,stripe_account_id,livemode', ignoreDuplicates: true });
  if (error) throw error;
  const resolved = await findStripeCustomerForPerson(personId);
  if (!resolved) throw new Error('Stripe customer mapping could not be verified');
  if (resolved !== customer.id) throw new Error('Conflicting Stripe customer mapping');
  return resolved;
}
