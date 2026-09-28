'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseBrowser';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import {
  runHaulInviteLanding,
  type HaulInviteLandingOutcome,
} from '@/lib/plans/groceryHaul/haulInviteLanding';

/**
 * Haul invitation landing (Invite to Haul v1, B1 transport only).
 *
 * Dedicated, non-PKCE landing for invitation links:
 *  - Supabase invite links arrive with the session in the URL fragment
 *    (#access_token=…&refresh_token=…). The @supabase/ssr browser client is
 *    PKCE-only and will not consume a fragment session by itself, so the
 *    fragment is captured here (before the client exists) and the session is
 *    established explicitly with setSession on the cookie-based client.
 *  - Existing-account invitees arrive from the transactional email with no
 *    fragment; they use their existing session or are sent to /login and
 *    returned here.
 *  - Landing here never grants membership. The accept API does, and only when
 *    the confirmed Auth email equals the invitation target.
 *
 * Presentation is intentionally minimal; the polished invitation UX is B2.
 */
export default function HaulInvitationLandingPage() {
  const params = useParams<{ invitationId: string }>();
  const router = useRouter();
  const startedRef = useRef(false);
  const [outcome, setOutcome] = useState<HaulInviteLandingOutcome | null>(null);

  const invitationId = typeof params?.invitationId === 'string' ? params.invitationId : '';

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Capture the fragment BEFORE creating the Supabase client.
    const hash = window.location.hash;

    // Strip tokens from the address bar / history immediately.
    if (hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    const supabase = createClient();

    runHaulInviteLanding({
      invitationId,
      hash,
      setSession: async ({ accessToken, refreshToken }) => {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        return !error;
      },
      getUser: async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) return null;
        return { id: data.user.id, email: data.user.email ?? null };
      },
      linkPerson: async (user) => {
        if (!user.email) return false;
        try {
          const response = await fetch('/api/account/link-person', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authUserId: user.id, email: user.email }),
          });
          return response.ok;
        } catch {
          return false;
        }
      },
      accept: async (id) => {
        const response = await fetch(
          `/api/journal/food/haul-invitations/${encodeURIComponent(id)}/accept`,
          { method: 'POST' },
        );
        return { status: response.status, body: await readBody(response) };
      },
    })
      .then((result) => {
        if (result.kind === 'needs_sign_in') {
          router.replace(result.loginPath);
          return;
        }
        setOutcome(result);
      })
      .catch(() => setOutcome({ kind: 'failed', message: 'Something went wrong. Please try again.' }));
  }, [invitationId, router]);

  return (
    <div className="min-h-screen bg-brand-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-neutral-900/95 backdrop-blur-lg rounded-2xl p-8 text-white antialiased">
        {renderOutcome(outcome, router.push)}
      </div>
    </div>
  );
}

async function readBody(
  response: Response,
): Promise<{ result?: { haul_id?: string; outcome?: string }; error?: string } | null> {
  try {
    return (await response.json()) as { result?: { haul_id?: string; outcome?: string }; error?: string };
  } catch {
    return null;
  }
}

function renderOutcome(outcome: HaulInviteLandingOutcome | null, push: (href: string) => void) {
  if (!outcome) {
    return <p className="text-white/70">Checking your invitation…</p>;
  }
  switch (outcome.kind) {
    case 'accepted':
      return (
        <>
          <h1 className="text-2xl font-semibold mb-3">You&rsquo;re in</h1>
          <p className="text-white/70 mb-6">
            {outcome.alreadyAccepted
              ? 'You already accepted this invitation.'
              : 'You can now add items to this grocery Haul.'}
          </p>
          <button
            type="button"
            className="w-full rounded-xl bg-white text-neutral-900 py-3 font-medium"
            onClick={() => push(APP_ROUTES.home)}
          >
            Open Fine Diet
          </button>
        </>
      );
    case 'link_expired':
      return (
        <>
          <h1 className="text-2xl font-semibold mb-3">Link expired</h1>
          <p className="text-white/70 mb-6">
            This invitation link is no longer valid. Sign in with the invited email address to accept.
          </p>
          <button
            type="button"
            className="w-full rounded-xl bg-white text-neutral-900 py-3 font-medium"
            onClick={() => push(outcome.loginPath)}
          >
            Sign in
          </button>
        </>
      );
    case 'not_found':
    case 'invalid_invitation':
      return (
        <>
          <h1 className="text-2xl font-semibold mb-3">Invitation not found</h1>
          <p className="text-white/70">This invitation is invalid or no longer available.</p>
        </>
      );
    case 'forbidden':
    case 'failed':
      return (
        <>
          <h1 className="text-2xl font-semibold mb-3">Couldn&rsquo;t accept invitation</h1>
          <p className="text-white/70">{outcome.message}</p>
        </>
      );
    case 'needs_sign_in':
    default:
      return <p className="text-white/70">Redirecting to sign in…</p>;
  }
}
