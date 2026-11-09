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

type EventDb = Pick<typeof supabaseAdmin, 'from'>;

interface StripeEventIdentity {
  id: string;
  type: string;
  created: number;
}

export type StripeEventClaim =
  | { status: 'processed' }
  | { status: 'claimed'; token: string };

const LEASE_MILLISECONDS = 10 * 60 * 1000;

export async function claimStripeEvent(
  event: StripeEventIdentity,
  options?: { token?: string; db?: EventDb },
): Promise<StripeEventClaim> {
  const token = options?.token || randomUUID();
  const db = options?.db ?? supabaseAdmin;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_MILLISECONDS).toISOString();

  const { error: insertError } = await db.from('stripe_events').insert({
    stripe_event_id: event.id,
    type: event.type,
    created_at: new Date(event.created * 1000).toISOString(),
    processed_at: null,
    processing_token: token,
    processing_lease_expires_at: expiresAt,
  });

  if (!insertError) return { status: 'claimed', token };
  if (insertError.code !== '23505') throw insertError;

  const { data: existing, error: readError } = await db
    .from('stripe_events')
    .select('processed_at, processing_lease_expires_at')
    .eq('stripe_event_id', event.id)
    .maybeSingle();
  if (readError || !existing) {
    throw readError || new Error('Stripe event receipt disappeared after duplicate insert');
  }
  if (existing.processed_at) return { status: 'processed' };

  const observedExpiry: unknown = existing.processing_lease_expires_at;
  if (observedExpiry !== null) {
    if (typeof observedExpiry !== 'string' || !Number.isFinite(Date.parse(observedExpiry))) {
      throw new Error('Stripe event receipt has an invalid processing lease');
    }
    if (Date.parse(observedExpiry) > now.getTime()) {
      throw new Error('Stripe event is already being processed; request retry');
    }
  }

  // Do not use mutation .or(...). In the verified PostgREST HTTP path its
  // logical filter was repeated on RETURNING rows: selecting only the event ID
  // raised 42703, and returning the new expiry would test the NEW lease instead
  // of the old eligibility. Choose a scalar predicate from the read above, but
  // enforce it again in the UPDATE so a competing claimant cannot be replaced.
  const update = db.from('stripe_events')
    .update({ processing_token: token, processing_lease_expires_at: expiresAt })
    .eq('stripe_event_id', event.id)
    .is('processed_at', null);
  const eligible = observedExpiry === null
    ? update.is('processing_lease_expires_at', null)
    : update.lte('processing_lease_expires_at', now.toISOString());
  const { data: claimed, error: claimError } = await eligible.select('stripe_event_id');
  if (claimError) throw claimError;
  if (!claimed || claimed.length !== 1 || claimed[0].stripe_event_id !== event.id) {
    throw new Error('Stripe event is already being processed; request retry');
  }
  return { status: 'claimed', token };
}

export async function completeStripeEvent(eventId: string, token: string, db: EventDb = supabaseAdmin): Promise<void> {
  const { data, error } = await db
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

export async function releaseStripeEvent(eventId: string, token: string, db: EventDb = supabaseAdmin): Promise<void> {
  // Failure to release is survivable: Stripe retries and the lease expires.
  // The caller supplies a client that is not tied to the aborted attempt.
  const { error } = await db
    .from('stripe_events')
    .update({ processing_token: null, processing_lease_expires_at: null })
    .eq('stripe_event_id', eventId)
    .eq('processing_token', token)
    .is('processed_at', null);
  if (error) throw error;
}
