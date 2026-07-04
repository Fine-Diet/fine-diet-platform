/**
 * useAssessmentClaimFlow
 *
 * Owns the post-auth assessment claim path for the results screen. Extracted from
 * the two inline effects in `ResultsScreen.tsx`. Behavior preserved exactly:
 *
 *   1. Check the Supabase browser session on mount and surface `authUser`
 *      (email + id) so the screen can render account-aware UI.
 *   2. After auth, if the submission is still a guest submission and a guest
 *      `claimToken` is present in localStorage, claim it via
 *      POST /api/assessments/claim, drop the token + persisted auth context,
 *      and re-fetch the submission so saved/attached UI updates.
 *      200 (claimed) and 204 (already claimed / no-op) are both treated as
 *      success. If the submission is already attached, only the cleanup runs.
 *
 * Everything here is non-blocking and resilient: failures never break results
 * rendering. The hook accepts `setSubmissionData` so it can refresh the row in
 * place after a successful claim (same pattern the old component used).
 */

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabaseBrowser';
import { clearPersistedAuthContext } from '@/lib/auth/authContext';
import type { SubmissionData } from '@/lib/assessments/results/types';

export interface AssessmentAuthUser {
  email: string;
  id: string;
}

export interface UseAssessmentClaimFlow {
  authUser: AssessmentAuthUser | null;
}

export function useAssessmentClaimFlow(
  submissionData: SubmissionData | null,
  setSubmissionData: (data: SubmissionData | null) => void
): UseAssessmentClaimFlow {
  const [authUser, setAuthUser] = useState<AssessmentAuthUser | null>(null);
  const hasAttemptedClaim = useRef(false);

  // Check auth state on mount.
  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          setAuthUser({ email: session.user.email!, id: session.user.id });
        } else {
          setAuthUser(null);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('Error checking auth:', err);
        setAuthUser(null);
      }
    }
    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  // Post-auth claim (covers Google OAuth return + email auth return).
  useEffect(() => {
    if (hasAttemptedClaim.current) return;
    if (!authUser || !submissionData?.id) return;

    // Already attached to an account — just clean up any stale guest artifacts.
    if (submissionData.user_id) {
      hasAttemptedClaim.current = true;
      try {
        localStorage.removeItem('fd_gc_claimToken:last');
      } catch {
        // Non-fatal.
      }
      clearPersistedAuthContext();
      return;
    }

    let claimToken: string | null = null;
    try {
      claimToken = localStorage.getItem('fd_gc_claimToken:last');
    } catch {
      // Non-fatal — localStorage may be unavailable.
    }
    if (!claimToken) return;

    hasAttemptedClaim.current = true;
    const submissionId = submissionData.id;

    (async () => {
      try {
        const res = await fetch('/api/assessments/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claimToken }),
        });

        // 200 (claimed) or 204 (already claimed / no-op) are both success.
        if (res.ok || res.status === 204) {
          try {
            localStorage.removeItem('fd_gc_claimToken:last');
          } catch {
            // Non-fatal.
          }
          clearPersistedAuthContext();

          // Re-fetch the submission so saved/account-connected UI updates.
          try {
            const refetch = await fetch(
              `/api/assessments/submission?submission_id=${submissionId}`
            );
            const result = await refetch.json();
            if (result.success && result.data) {
              setSubmissionData(result.data);
            }
          } catch (refetchErr) {
            console.warn('[ResultsScreen] Failed to refresh submission after claim:', refetchErr);
          }
        } else {
          console.warn('[ResultsScreen] Failed to claim assessment after auth:', res.status);
        }
      } catch (err) {
        console.warn('[ResultsScreen] Error claiming assessment after auth:', err);
      }
    })();
  }, [authUser, submissionData?.id, submissionData?.user_id, setSubmissionData]);

  return { authUser };
}
