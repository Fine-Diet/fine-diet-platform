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
 *   - Removed on a terminal outcome: granted, already-granted, nothing-to-
 *     grant, not-found (stale), expired, or email-mismatch (permanent for
 *     this account).
 *   - Left in place on 401 (not yet authenticated) and 5xx (transient) so a
 *     later auth/retry can still claim.
 *
 * This helper is safe to call from client components only.
 */

const STORAGE_KEY = 'fd_acc_claimToken:last';

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
 * session. Non-blocking: swallows network errors and never throws. Safe to
 * call after signup/login.
 */
export async function claimPendingAccessCodeOffer(): Promise<void> {
  if (typeof window === 'undefined') return;

  let claimToken: string | null = null;
  try {
    claimToken = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!claimToken) return;

  try {
    const res = await fetch('/api/access-codes/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimToken }),
    });

    // 200 — granted, already-granted, or nothing-to-grant: token is spent.
    // 404 — claim not found (stale token): drop it.
    // 410 — expired: drop it.
    // 403 — email mismatch (permanent for this account): drop it.
    // 401 — not authenticated yet, or 5xx — leave it for a later retry.
    if (res.ok || res.status === 404 || res.status === 410 || res.status === 403) {
      clearAccessCodeClaimToken();
    }
  } catch {
    // Network/unknown error — leave the token for a later retry.
  }
}
