/**
 * Access Code Claims — server-only claim/intent lifecycle.
 *
 * Implements the access-code CLAIM pattern for offer-attached codes:
 *
 *   verify (anonymous)  →  create pending claim + hashed bearer token
 *   claim  (auth'd)     →  resolve known person → grant offer entitlements
 *
 * Hard rules:
 *   - Raw claim tokens are NEVER stored. Only `claim_token_hash` (HMAC-SHA-256
 *     of 'access-code-claim:' || token keyed by ACCESS_CODE_HASH_SECRET) is
 *     persisted. The raw token is returned to the client exactly once at
 *     verify time and is a bearer credential — it is NOT the access code.
 *   - Claim creation never creates People rows and never grants entitlements.
 *   - Grant happens ONLY after a known, authenticated person is resolved by
 *     the caller and passed in. This helper does not authenticate the user;
 *     the claim endpoint does that.
 *   - Internal grant errors are written to `grant_error` for admin audit but
 *     are NEVER returned to public clients by this helper (callers map them
 *     to safe public responses).
 *
 * NEVER import this file from client/browser code.
 */

import { createHmac, randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  grantOfferToPerson,
  NoActiveEntitlementMappingsError,
} from '@/lib/access/offerGrantService';

if (typeof window !== 'undefined') {
  throw new Error(
    'accessCodeClaims.ts can only be imported in server contexts.',
  );
}

const DEFAULT_CLAIM_TTL_HOURS = 24;

function claimTtlMs(): number {
  const raw = Number(process.env.ACCESS_CODE_CLAIM_TTL_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CLAIM_TTL_HOURS;
  return hours * 60 * 60 * 1000;
}

/** Generate a fresh opaque bearer token (256 bits, hex-encoded). */
export function generateClaimToken(): string {
  return randomBytes(32).toString('hex');
}

/** Deterministic server-side digest of a raw claim token. */
export function hashClaimToken(token: string): string {
  const secret = process.env.ACCESS_CODE_HASH_SECRET;
  if (!secret) {
    throw new Error('Missing ACCESS_CODE_HASH_SECRET environment variable.');
  }
  return createHmac('sha256', secret)
    .update(`access-code-claim:${token}`)
    .digest('hex');
}

export interface CreateClaimInput {
  accessCodeId: string;
  redemptionId?: string | null;
  offerKey: string;
  email?: string | null;
  redirectPath?: string | null;
  source?: string | null;
  context?: Record<string, unknown>;
}

export interface CreatedClaim {
  claimId: string;
  claimToken: string;
  expiresAt: string;
}

/**
 * Create a pending claim for an offer-attached code. Stores only the hashed
 * token; returns the raw token once so the caller can hand it to the client.
 */
export async function createAccessCodeClaim(
  input: CreateClaimInput,
): Promise<CreatedClaim> {
  const claimToken = generateClaimToken();
  const claimTokenHash = hashClaimToken(claimToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + claimTtlMs());

  const { data, error } = await supabaseAdmin
    .from('access_code_claims')
    .insert({
      access_code_id: input.accessCodeId,
      redemption_id: input.redemptionId ?? null,
      claim_token_hash: claimTokenHash,
      offer_key: input.offerKey,
      email: input.email ? input.email.trim().toLowerCase() : null,
      redirect_path: input.redirectPath ?? null,
      source: input.source ?? null,
      context: input.context ?? {},
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .select('id, expires_at')
    .single();

  if (error) {
    throw new Error(`Failed to create access code claim: ${error.message}`);
  }

  return { claimId: data.id, claimToken, expiresAt: data.expires_at };
}

export type ClaimGrantStatus =
  | 'granted'
  | 'already_granted'
  | 'expired'
  | 'not_found'
  | 'email_mismatch'
  | 'no_mappings'
  | 'failed';

export interface ClaimGrantResult {
  status: ClaimGrantStatus;
  offerKey?: string;
  grantedKeys?: string[];
  /** Internal reason — callers must NOT forward this to public clients. */
  reason?: string;
}

interface ClaimRow {
  id: string;
  access_code_id: string;
  offer_key: string;
  email: string | null;
  status: string;
  expires_at: string;
  person_id: string | null;
}

async function updateClaim(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await supabaseAdmin.from('access_code_claims').update(patch).eq('id', id);
}

/**
 * Resolve a raw claim token against a known, authenticated person and grant
 * the attached offer's entitlements.
 *
 * Idempotent: a claim already in 'granted' returns `already_granted` without
 * re-granting. A 'pending' or 'claimed' claim may be (re-)processed; perpetual
 * entitlements are deduped by the person_entitlements unique index, so retries
 * are safe.
 *
 * The caller MUST authenticate the user and resolve `personId` + `personEmail`
 * from a real people row before calling.
 */
export async function grantAccessCodeClaimByToken(
  claimToken: string,
  personId: string,
  personEmail: string,
): Promise<ClaimGrantResult> {
  const claimTokenHash = hashClaimToken(claimToken);

  const { data: claim, error } = await supabaseAdmin
    .from('access_code_claims')
    .select(
      'id, access_code_id, offer_key, email, status, expires_at, person_id',
    )
    .eq('claim_token_hash', claimTokenHash)
    .maybeSingle();

  if (error) {
    throw new Error(`Claim lookup failed: ${error.message}`);
  }
  if (!claim) {
    return { status: 'not_found' };
  }

  const row = claim as ClaimRow;

  if (row.status === 'granted') {
    return { status: 'already_granted', offerKey: row.offer_key };
  }

  const now = new Date();
  if (row.expires_at && new Date(row.expires_at) <= now) {
    await updateClaim(row.id, { status: 'expired' });
    return { status: 'expired' };
  }

  // Only pending/claimed claims are (re-)processable.
  if (row.status !== 'pending' && row.status !== 'claimed') {
    return {
      status: 'failed',
      reason: `Claim not claimable (status=${row.status})`,
    };
  }

  // Email binding: if the claim captured an email at the gate, the claiming
  // person's email must match. Prevents a stolen bearer token from being
  // attached to a different account.
  if (row.email) {
    const claimEmail = row.email.trim().toLowerCase();
    const personEmailNorm = (personEmail || '').trim().toLowerCase();
    if (claimEmail !== personEmailNorm) {
      return { status: 'email_mismatch' };
    }
  }

  // Mark claimed (transient) + bind the person.
  await updateClaim(row.id, {
    status: 'claimed',
    claimed_at: now.toISOString(),
    person_id: personId,
  });

  try {
    const result = await grantOfferToPerson({
      personId,
      offerKey: row.offer_key,
      createdByUserId: null,
      note: 'Granted via access code claim',
    });

    const grantedKeys = result.granted.map(
      (r) => r.entitlement_key as string,
    );

    await updateClaim(row.id, {
      status: 'granted',
      granted_at: new Date().toISOString(),
      person_id: personId,
      grant_summary: {
        granted_keys: grantedKeys,
        skipped: result.skipped,
        assignment_action: result.assignment_action,
        mappings: result.mappings.map((m) => ({
          entitlement_key: m.entitlement_key,
          duration_days: m.duration_days,
        })),
      },
      grant_error: null,
    });

    return {
      status: 'granted',
      offerKey: row.offer_key,
      grantedKeys,
    };
  } catch (err) {
    const isNoMappings = err instanceof NoActiveEntitlementMappingsError;
    const message = err instanceof Error ? err.message : String(err);

    await updateClaim(row.id, {
      status: 'failed',
      grant_error: message,
      person_id: personId,
    });

    return {
      status: isNoMappings ? 'no_mappings' : 'failed',
      offerKey: row.offer_key,
      reason: message,
    };
  }
}
