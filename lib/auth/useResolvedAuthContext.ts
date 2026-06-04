'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  type AuthContext,
  type AuthIntent,
  mergePersistedAuthContext,
  parseAuthContext,
  readPersistedAuthContext,
} from '@/lib/auth/authContext';

/**
 * Resolve the auth context for a dedicated auth page (/login, /create-account).
 *
 * First render (and SSR) uses URL query params only, so the server and the
 * initial client markup match. After mount, the persisted `fd_auth_context`
 * fallback is merged in to recover prefill + redirect context across the
 * signup → email-confirm / OAuth → return gap.
 *
 * Explicit URL query params always win over persisted values, and the page's
 * intended `intent` (login vs signup) is never overridden by persistence.
 */
export function useResolvedAuthContext(intent: AuthIntent): AuthContext {
  const router = useRouter();
  const [context, setContext] = useState<AuthContext>(() => ({
    ...parseAuthContext(router.query),
    intent,
  }));

  useEffect(() => {
    if (!router.isReady) return;
    // readPersistedAuthContext only returns a value on the client, so this
    // merge step never runs during SSR / first paint (no hydration mismatch).
    const persisted = readPersistedAuthContext();
    setContext(mergePersistedAuthContext(router.query, intent, persisted));
  }, [router.isReady, router.query, intent]);

  return context;
}
