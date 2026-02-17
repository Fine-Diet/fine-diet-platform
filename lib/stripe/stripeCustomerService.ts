/**
 * Stripe Customer Service
 *
 * Ensures a 1:1 mapping between a Fine Diet person and a Stripe customer.
 * Uses the stripe_customers table as cache/source of truth.
 */

import { stripe } from './stripeServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

/**
 * Get or create a Stripe customer for the given person.
 *
 * 1. Check stripe_customers for an existing mapping.
 * 2. If found, return the stripe_customer_id.
 * 3. Otherwise create a new Stripe customer, insert the mapping, and return.
 */
export async function ensureStripeCustomerForPerson(
  personId: string,
  email: string
): Promise<string> {
  // 1) Check existing mapping
  const { data: existing } = await supabaseAdmin
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('person_id', personId)
    .maybeSingle();

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  // 2) Create Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: { person_id: personId },
  });

  // 3) Persist mapping
  await supabaseAdmin.from('stripe_customers').upsert(
    {
      person_id: personId,
      stripe_customer_id: customer.id,
      email,
    },
    { onConflict: 'person_id' }
  );

  return customer.id;
}
