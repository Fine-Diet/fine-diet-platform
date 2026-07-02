/**
 * Access Code Offer Claim — client-side helper.
 *
 * After the Access Code Gate verifies an offer-attached code, it stores an
 * opaque bearer `claimToken` in localStorage (NOT the access code — the raw
 * access code is never stored anywhere). After the user signs up or logs in,
 * this helper redeems that token against POST /api/access-codes/claim, which
 * resolves the now-known person and grants the attached offer's entitlements.
 *
 * Token lifecycle:
 *   - Stored under STORAGE_KEY on verify success (by AccessCodeGateV1).
 *   - Cleared on terminal outcomes: granted, nothing_to_grant, expired,
 *     email_mismatch, claim_not_found, failed (non-retryable 4xx).
 *   - Kept on retryable outcomes: no_claim is a no-op, person_not_ready
 *     (401) and retryable_error (5xx/network) leave the token so a later
 *     auth/retry can still claim.
 *
 * This helper is safe to call from client components only. It never throws and
 * never exposes internal grant errors — every status is a safe, generic
 * category the caller can render to the user.
 */

const STORAGE_KEY = 'fd_acc_claimToken:last';

export type AccessCodeClaimClientStatus =
  | 'no_claim'
  | 'granted'
  | 'nothing_to_grant'
  | 'expired'
  | 'email_mismatch'
  | 'claim_not_found'
  | 'person_not_ready'
  | 'retryable_error'
  | 'failed';

export interface AccessCodeClaimClientResult {
  status: AccessCodeClaimClientStatus;
}

/** Store a fresh claim token returned by the verify endpoint. */
export function storeAccessCodeClaimToken(claimToken: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, claimToken);
  } catch {
    // Non-fatal — best-effort persistence.
  }
}

function clearAccessCodeClaimToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}

/**
 * Redeem any pending access-code claim token against the authenticated
 * session. Never throws; returns a safe status the caller can act on.
 *
 * Status mapping:
 *   200 + { status: 'granted' }          → granted            (clear token)
 *   200 + { status: 'nothing_to_grant' } → nothing_to_grant   (clear token)
 *   401                                   → person_not_ready    (keep token)
 *   404                                   → claim_not_found     (clear token)
 *   410                                   → expired             (clear token)
 *   403                                   → email_mismatch      (clear token)
 *   5xx / network throw                   → retryable_error     (keep token)
 *   other 4xx                             → failed              (clear token)
 */
export async function claimPendingAccessCodeOffer(): Promise<AccessCodeClaimClientResult> {
  if (typeof window === 'undefined') {
    return { status: 'no_claim' };
  }

  let claimToken: string | null = null;
  try {
    claimToken = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'no_claim' };
  }
  if (!claimToken) {
    return { status: 'no_claim' };
  }

  let res: Response;
  try {
    res = await fetch('/api/access-codes/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimToken }),
    });
  } catch {
    // Network/unknown error — leave the token for a later retry.
    return { status: 'retryable_error' };
  }

  if (res.ok) {
    let body: { status?: string } = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    clearAccessCodeClaimToken();
    return body.status === 'nothing_to_grant'
      ? { status: 'nothing_to_grant' }
      : { status: 'granted' };
  }

  // 401 — not authenticated yet (person not resolved); keep token for retry.
  if (res.status === 401) {
    return { status: 'person_not_ready' };
  }

  // 5xx — transient; keep token for retry.
  if (res.status >= 500) {
    return { status: 'retryable_error' };
  }

  // Remaining non-retryable client errors — clear the token.
  if (res.status === 410) {
    clearAccessCodeClaimToken();
    return { status: 'expired' };
  }
  if (res.status === 403) {
    clearAccessCodeClaimToken();
    return { status: 'email_mismatch' };
  }
  if (res.status === 404) {
    clearAccessCodeClaimToken();
    return { status: 'claim_not_found' };
  }

  // Any other 4xx — treat as non-retryable failure and drop the stale token.
  clearAccessCodeClaimToken();
  return { status: 'failed' };
}
