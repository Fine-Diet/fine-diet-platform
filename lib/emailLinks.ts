/**
 * Email management link helper
 *
 * Generates and verifies HMAC-signed tokens for use in email footer links
 * (unsubscribe, preference management). Tokens are safe to embed in URLs.
 *
 * Token format: <hmac>.<payload>
 *   payload = base64url-encoded JSON: { personId, email, exp }
 *   hmac    = HMAC-SHA256 over payload, keyed with EMAIL_MANAGEMENT_SECRET
 *
 * Environment variable required:
 *   EMAIL_MANAGEMENT_SECRET — at least 32 random bytes, hex or any string
 *
 * Server-only. Never import in client components.
 */

import { createHmac, timingSafeEqual } from 'crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const secret = process.env.EMAIL_MANAGEMENT_SECRET;
  if (!secret) {
    throw new Error(
      'EMAIL_MANAGEMENT_SECRET env var is not set. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Payload type
// ---------------------------------------------------------------------------

export interface EmailLinkPayload {
  personId: string;
  email: string;
  /** Unix timestamp (ms) after which the token is invalid */
  exp: number;
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function toBase64Url(buf: Buffer | string): string {
  const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64Url(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

function computeHmac(secret: string, payload: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a signed token for a person.
 *
 * @param personId  Supabase people.id
 * @param email     The person's email address (included for additional context)
 * @param expiryMs  How long the token is valid (default 30 days)
 */
export function generateEmailToken(
  personId: string,
  email: string,
  expiryMs: number = DEFAULT_EXPIRY_MS,
): string {
  const secret = getSecret();
  const payload: EmailLinkPayload = {
    personId,
    email,
    exp: Date.now() + expiryMs,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const hmac = computeHmac(secret, encodedPayload);
  const encodedHmac = toBase64Url(hmac);
  return `${encodedHmac}.${encodedPayload}`;
}

export type VerifyResult =
  | { ok: true; payload: EmailLinkPayload }
  | { ok: false; reason: 'invalid' | 'expired' | 'malformed' };

/**
 * Verify a signed token.
 *
 * Returns the decoded payload on success, or a typed failure reason.
 * Uses a constant-time comparison to prevent timing attacks.
 */
export function verifyEmailToken(token: string): VerifyResult {
  try {
    const dotIndex = token.indexOf('.');
    if (dotIndex === -1) return { ok: false, reason: 'malformed' };

    const encodedHmac = token.slice(0, dotIndex);
    const encodedPayload = token.slice(dotIndex + 1);

    if (!encodedHmac || !encodedPayload) return { ok: false, reason: 'malformed' };

    const secret = getSecret();
    const expected = computeHmac(secret, encodedPayload);
    const actual = fromBase64Url(encodedHmac);

    // Constant-time comparison — buffers must be the same length
    if (actual.length !== expected.length) return { ok: false, reason: 'invalid' };
    if (!timingSafeEqual(actual, expected)) return { ok: false, reason: 'invalid' };

    const payload: EmailLinkPayload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8'));

    if (!payload.personId || !payload.email || typeof payload.exp !== 'number') {
      return { ok: false, reason: 'malformed' };
    }

    if (Date.now() > payload.exp) return { ok: false, reason: 'expired' };

    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}

/**
 * Build a full unsubscribe URL for use in email footers.
 *
 * @param baseUrl   e.g. "https://myfinediet.com"
 * @param personId  Supabase people.id
 * @param email     The person's email address
 */
export function buildUnsubscribeUrl(baseUrl: string, personId: string, email: string): string {
  const token = generateEmailToken(personId, email);
  return `${baseUrl}/unsubscribe?t=${encodeURIComponent(token)}`;
}
