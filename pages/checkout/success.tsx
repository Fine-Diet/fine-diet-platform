'use client';

/**
 * /checkout/success — Package 2 bounded entitlement reconciliation bridge.
 *
 * Stripe success returns here with session_id. This page never treats
 * checkout=success as proof of access. It polls a verified server reconcile
 * endpoint with a hard attempt cap, then routes to onboarding or returnTo.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { getSafeRedirectTarget, isSafeRedirectTarget } from '@/lib/redirectHelpers';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

type ReconcileStatus = 'pending' | 'ready' | 'failed' | 'error' | 'timeout';

const MAX_ATTEMPTS = 8;
const INTERVAL_MS = 1500;

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const [status, setStatus] = useState<ReconcileStatus>('pending');
  const [message, setMessage] = useState('Confirming your access…');
  const attempts = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionId = useMemo(() => {
    const raw = router.query.session_id;
    return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : null;
  }, [router.query.session_id]);

  const returnTo = useMemo(() => {
    const raw = router.query.returnTo;
    const value = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : null;
    return isSafeRedirectTarget(value) ? getSafeRedirectTarget(value, APP_ROUTES.home) : APP_ROUTES.home;
  }, [router.query.returnTo]);

  useEffect(() => {
    if (!router.isReady) return;

    if (!sessionId || !sessionId.startsWith('cs_')) {
      setStatus('error');
      setMessage('We could not verify this checkout session.');
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      attempts.current += 1;

      try {
        const qs = new URLSearchParams({
          session_id: sessionId,
          returnTo,
        });
        const res = await fetch(`/api/checkout/reconcile?${qs.toString()}`, {
          credentials: 'include',
        });
        const body = (await res.json().catch(() => null)) as {
          status?: ReconcileStatus;
          nextPath?: string;
          reason?: string;
        } | null;

        if (cancelled) return;

        if (body?.status === 'ready' && body.nextPath) {
          setStatus('ready');
          setMessage('Access confirmed. Continuing…');
          void router.replace(body.nextPath);
          return;
        }

        if (body?.status === 'failed') {
          setStatus('failed');
          setMessage('Checkout did not complete. You have not been charged for access yet.');
          return;
        }

        if (body?.status === 'error' && res.status === 403) {
          setStatus('error');
          setMessage('This checkout session does not belong to your account.');
          return;
        }

        if (attempts.current >= MAX_ATTEMPTS) {
          setStatus('timeout');
          setMessage(
            'Payment may still be processing. You can refresh this page shortly, or continue to your account start page for help.',
          );
          return;
        }

        setStatus('pending');
        setMessage('Confirming your access…');
        timer.current = setTimeout(tick, INTERVAL_MS);
      } catch {
        if (cancelled) return;
        if (attempts.current >= MAX_ATTEMPTS) {
          setStatus('timeout');
          setMessage('We could not confirm access yet. Please try again in a moment.');
          return;
        }
        timer.current = setTimeout(tick, INTERVAL_MS);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router, router.isReady, sessionId, returnTo]);

  return (
    <main className="min-h-screen bg-[#CECAB9] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold text-[#4F4234]">Checkout</h1>
        <p className="text-[#4F4234]/80">{message}</p>
        {(status === 'timeout' || status === 'error' || status === 'failed') && (
          <div className="flex flex-col gap-3 items-center">
            <button
              type="button"
              className="rounded-full bg-[#4F4234] text-[#fffff6] px-5 py-2 text-sm"
              onClick={() => {
                attempts.current = 0;
                setStatus('pending');
                setMessage('Confirming your access…');
                void router.replace({
                  pathname: '/checkout/success',
                  query: { session_id: sessionId, returnTo },
                });
              }}
            >
              Try again
            </button>
            <a href="/account/start" className="text-sm text-[#4F4234] underline">
              Account help
            </a>
            <a href={returnTo} className="text-sm text-[#4F4234] underline">
              Continue
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
