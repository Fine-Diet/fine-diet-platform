/**
 * Recoverable Stripe event reservation.
 *
 * Each event may be handled by only one active lease at a time. Failed attempts
 * are released; process crashes leave a time-bounded lease which can be
 * reclaimed by a subsequent Stripe retry. Database uniqueness is the arbiter.
 *
 * Requires scripts/sql/stripeWebhookProcessingLeasePrelive.sql to be installed
 * before this module is deployed. Does not replay historical completed events.
 */
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface StripeEventIdentity {
  id: string;
  type: string;
  created: number;
}

export type StripeEventClaim =
  | { status: 'processed' }
  | { status: 'claimed'; token: string };

// Bound longer than a normal handler execution, but not indefinitely.
const LEASE_MILLISECONDS = 10 * 60 * 1000;

export async function claimStripeEvent(event: StripeEventIdentity): Promise<StripeEventClaim> {
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_MILLISECONDS).toISOString();

  const { error: insertError } = await supabaseAdmin.from('stripe_events').insert({
    stripe_event_id: event.id,
    type: event.type,
    created_at: new Date(event.created * 1000).toISOString(),
    processed_at: null,
    processing_token: token,
    processing_lease_expires_at: expiresAt,
  });

  if (!insertError) return { status: 'claimed', token };
  if (insertError.code !== '23505') throw insertError;

  const { data: existing, error: readError } = await supabaseAdmin
    .from('stripe_events')
    .select('processed_at')
    .eq('stripe_event_id', event.id)
    .maybeSingle();
  if (readError || !existing) {
    throw readError || new Error('Stripe event receipt disappeared after duplicate insert');
  }
  if (existing.processed_at) return { status: 'processed' };

  // Atomic compare-and-claim: one competing delivery can reclaim an expired
  // lease; all other concurrent deliveries receive a retryable failure.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('stripe_events')
    .update({ processing_token: token, processing_lease_expires_at: expiresAt })
    .eq('stripe_event_id', event.id)
    .is('processed_at', null)
    .or(`processing_lease_expires_at.is.null,processing_lease_expires_at.lte.${now.toISOString()}`)
    .select('stripe_event_id');
  if (claimError) throw claimError;
  if (!claimed || claimed.length !== 1) {
    throw new Error('Stripe event is already being processed; request retry');
  }
  return { status: 'claimed', token };
}

export async function completeStripeEvent(eventId: string, token: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('stripe_events')
    .update({
      processed_at: new Date().toISOString(),
      processing_token: null,
      processing_lease_expires_at: null,
    })
    .eq('stripe_event_id', eventId)
    .eq('processing_token', token)
    .is('processed_at', null)
    .select('stripe_event_id');
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error('Stripe event completion lost its exclusive claim');
  }
}

export async function releaseStripeEvent(eventId: string, token: string): Promise<void> {
  // Failure to release is survivable: Stripe retries and the lease expires.
  const { error } = await supabaseAdmin
    .from('stripe_events')
    .update({ processing_token: null, processing_lease_expires_at: null })
    .eq('stripe_event_id', eventId)
    .eq('processing_token', token)
    .is('processed_at', null);
  if (error) throw error;
}
