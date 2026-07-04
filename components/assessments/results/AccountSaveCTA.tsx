/**
 * AccountSaveCTA
 *
 * Shows login / create-account messaging for non-logged-in users on the results
 * screen. Extracted verbatim from `ResultsScreen.tsx`. Behavior preserved:
 *   • Checks the Supabase browser session on mount.
 *   • Renders nothing while the auth check is in flight or when the user is
 *     logged in.
 *   • Login/signup CTAs route through `buildAuthUrl` with a claim-token warning
 *     when no guest claim token is present in localStorage.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabaseBrowser';
import { buildAuthUrl } from '@/lib/auth/authContext';

export function AccountSaveCTA({
  submissionId,
  assessmentSlug,
  sessionId,
}: {
  submissionId: string;
  assessmentSlug?: string;
  sessionId?: string;
}) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        setIsLoggedIn(!!session);
      } catch (error) {
        console.warn('Error checking auth status:', error);
        if (!cancelled) setIsLoggedIn(false);
      }
    }
    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't show if logged in or if we haven't checked yet
  if (isLoggedIn === null || isLoggedIn) {
    return null;
  }

  const sharedContext = {
    source: 'assessment' as const,
    redirectTo: `/results/${submissionId}`,
    assessmentSlug,
    submissionId,
    sessionId,
  };

  const handleLoginClick = () => {
    // Claim token should already be in localStorage from submission.
    if (!localStorage.getItem('fd_gc_claimToken:last')) {
      console.warn('No claim token found in localStorage');
    }
    router.push(buildAuthUrl({ ...sharedContext, intent: 'login' }));
  };

  const handleSignupClick = () => {
    if (!localStorage.getItem('fd_gc_claimToken:last')) {
      console.warn('No claim token found in localStorage');
    }
    router.push(buildAuthUrl({ ...sharedContext, intent: 'signup' }));
  };

  return (
    <div className="mt-8 pt-6 border-t border-neutral-700">
      <p className="text-neutral-300 text-sm mb-4 antialiased text-center">
        Want to save this assessment to your account?
      </p>
      <div className="flex gap-4 justify-center flex-wrap">
        <Button
          variant="tertiary"
          size="md"
          onClick={handleLoginClick}
        >
          Log in
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={handleSignupClick}
        >
          Create account
        </Button>
      </div>
    </div>
  );
}
