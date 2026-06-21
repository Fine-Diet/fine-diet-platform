/**
 * /checkout/resume — Step 2 hand-off into secure Stripe Checkout.
 *
 * Lightweight, auth-required page that continues the app subscription/trial
 * checkout after account creation/login. It auto-POSTs to /api/checkout/create
 * with the carried offer + tracking, then forwards the browser to the returned
 * Stripe Checkout URL.
 *
 * Flow:
 *   1. SSR: if not authed → redirect to /create-account (ctx=checkout) preserving
 *      the offer + a redirect back to this resume URL.
 *   2. Client: auto-POST to /api/checkout/create → redirect to Stripe.
 *   3. If already entitled → redirect to /home with message.
 *   4. On error → show retry + return-to-start.
 *
 * Source of truth: billing/charge details come from Supabase `offers` via the
 * checkout API. This page never reads Stripe price IDs.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { ensureSessionIdClient } from '@/lib/tracking/sessionId';
import { buildAuthUrl } from '@/lib/auth/authContext';

interface ResumePageProps {
  offerKey: string;
  priceOptionKey: string | null;
  tracking: {
    placement: string;
    source: string;
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    utm_content: string;
    utm_term: string;
  };
}

export default function CheckoutResumePage({ offerKey, priceOptionKey, tracking }: ResumePageProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'redirecting' | 'error'>('redirecting');

  useEffect(() => {
    ensureSessionIdClient();

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/checkout/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offer_key: offerKey,
            price_option_key: priceOptionKey || undefined,
            ...tracking,
          }),
        });

        if (cancelled) return;

        const data = await res.json();

        if (!res.ok) {
          // Session lapsed between SSR and this POST — send back through signup,
          // preserving the offer + a return to this resume URL.
          if (res.status === 401) {
            window.location.href = buildAuthUrl({
              intent: 'signup',
              source: 'checkout',
              redirectTo: window.location.pathname + window.location.search,
              offerKey,
            });
            return;
          }
          if (data.error === 'already_entitled' && data.redirect) {
            window.location.href = data.redirect;
            return;
          }
          setError(data.message || data.error || 'Unable to start checkout');
          setStatus('error');
          return;
        }

        if (data.url) {
          window.location.href = data.url;
        } else {
          setError('No checkout URL received');
          setStatus('error');
        }
      } catch {
        if (!cancelled) {
          setError('Network error. Please try again.');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [offerKey, priceOptionKey, tracking]);

  return (
    <>
      <Head>
        <title>Continue to checkout &bull; Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-brand-900 text-white flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          {status === 'redirecting' && (
            <>
              <div className="mb-4">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
              </div>
              <h1 className="text-xl font-semibold antialiased mb-2">
                Account ready — opening secure checkout&hellip;
              </h1>
              <p className="text-sm text-white/60 antialiased">
                We&rsquo;re taking you to our secure Stripe payment page to finish
                setting up your subscription.
              </p>
            </>
          )}
          {status === 'error' && (
            <>
              <h1 className="text-xl font-semibold antialiased mb-2">
                Unable to start checkout
              </h1>
              <p className="text-sm text-white/60 antialiased mb-6">{error}</p>
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => {
                    setStatus('redirecting');
                    setError(null);
                    router.reload();
                  }}
                  className="px-6 py-2.5 bg-denim-500 hover:bg-denim-400 text-white text-sm font-medium rounded-full transition-colors antialiased"
                >
                  Try again
                </button>
                <button
                  onClick={() => router.push('/start')}
                  className="text-sm text-white/50 hover:text-white/70 transition-colors antialiased"
                >
                  Back to plans
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ResumePageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  const q = context.query;

  const offerKey =
    (Array.isArray(q.offer) ? q.offer[0] : q.offer) ||
    (Array.isArray(q.offer_key) ? q.offer_key[0] : q.offer_key) ||
    '';

  const priceOptionKey =
    (Array.isArray(q.price_option) ? q.price_option[0] : q.price_option) ||
    (Array.isArray(q.price_option_key) ? q.price_option_key[0] : q.price_option_key) ||
    null;

  // No offer to resume → nothing to do; send back to plans.
  if (!offerKey || typeof offerKey !== 'string') {
    return {
      redirect: { destination: '/start', permanent: false },
    };
  }

  if (!user) {
    // Rebuild this resume URL (with its tracking params) as the post-auth target.
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (typeof v === 'string') params.set(k, v);
    }
    const qs = params.toString();
    const redirectTarget = `/checkout/resume${qs ? `?${qs}` : ''}`;

    return {
      redirect: {
        destination: buildAuthUrl({
          intent: 'signup',
          source: 'checkout',
          redirectTo: redirectTarget,
          offerKey,
        }),
        permanent: false,
      },
    };
  }

  return {
    props: {
      offerKey,
      priceOptionKey,
      tracking: {
        placement: (q.placement as string) || 'start-hero',
        source: (q.source as string) || 'start',
        utm_source: (q.utm_source as string) || '',
        utm_medium: (q.utm_medium as string) || '',
        utm_campaign: (q.utm_campaign as string) || '',
        utm_content: (q.utm_content as string) || '',
        utm_term: (q.utm_term as string) || '',
      },
    },
  };
};
