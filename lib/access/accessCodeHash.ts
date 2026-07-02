/**
 * Access Code Hashing — server-only shared utilities.
 *
 * Single source of truth for normalizing and hashing access codes. Used by:
 *   - POST /api/access-codes/verify (public verification)
 *   - POST /api/admin/access-codes/create (admin code creation)
 *   - POST /api/admin/access-codes/update (admin re-key)
 *
 * Hard rules:
 *   - Plaintext codes are NEVER stored. The stored secret is the HMAC-SHA-256
 *     digest of the normalized code keyed by `ACCESS_CODE_HASH_SECRET`.
 *   - Normalization is deterministic: trim + uppercase. The same input always
 *     produces the same digest, so verification matches creation exactly.
 *   - The secret is environment-scoped, so hashes cannot be replayed across
 *     environments and cannot be reversed to recover the plaintext code.
 *
 * NEVER import this file from client/browser code. `crypto.createHmac` is only
 * available server-side, and the secret must never reach the client.
 */

import { createHmac } from 'crypto';

if (typeof window !== 'undefined') {
  throw new Error(
    'accessCodeHash.ts can only be imported in server contexts. ' +
      'It handles the ACCESS_CODE_HASH_SECRET and must never reach the client.',
  );
}

/**
 * Normalize a raw code exactly the way creation and verification must agree on:
 * trim + uppercase. Both the stored `code_hash` and the live submitted code go
 * through this before HMAC, so comparison is deterministic.
 */
export function normalizeAccessCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Deterministic server-side digest of a normalized code. HMAC-SHA-256 keyed by
 * the `ACCESS_CODE_HASH_SECRET` env var. Throws if the secret is missing — the
 * caller is expected to handle the configuration error without leaking it to
 * public clients.
 */
export function hashAccessCode(normalizedCode: string): string {
  const secret = process.env.ACCESS_CODE_HASH_SECRET;
  if (!secret) {
    throw new Error('Missing ACCESS_CODE_HASH_SECRET environment variable.');
  }
  return createHmac('sha256', secret).update(normalizedCode).digest('hex');
}

/**
 * Convenience: normalize + hash in one step. Returns the digest ready to store
 * in `access_codes.code_hash` or compare against it.
 */
export function digestAccessCode(rawCode: string): string {
  return hashAccessCode(normalizeAccessCode(rawCode));
}
