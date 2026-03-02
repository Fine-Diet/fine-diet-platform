/**
 * /buy/[offerKey] — Direct checkout link
 *
 * Stable URL for placing in emails, admin, or external placements.
 * Supports query params: placement, source, utm_source, utm_medium, etc.
 *
 * Flow:
 *   1. SSR: if not authed → redirect to /login?redirect=/buy/<key>?<params>
 *   2. Client: auto-POST to /api/checkout/create → redirect to Stripe
 *   3. If already entitled → redirect to /home with message
 *   4. If offer inactive → show error
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { ensureSessionIdClient } from '@/lib/tracking/sessionId';

interface BuyPageProps {
  offerKey: string;
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

export default function BuyPage({ offerKey, tracking }: BuyPageProps) {
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
            ...tracking,
          }),
        });

        if (cancelled) return;

        const data = await res.json();

        if (!res.ok) {
          if (data.error === 'already_entitled' && data.redirect) {
            window.location.href = data.redirect;
            return;
          }
          setError(data.error || data.message || 'Unable to start checkout');
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

    return () => { cancelled = true; };
  }, [offerKey, tracking]);

  return (
    <>
      <Head>
        <title>Checkout &bull; Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-brand-900 text-white flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          {status === 'redirecting' && (
            <>
              <div className="mb-4">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
              </div>
              <h1 className="text-xl font-semibold antialiased mb-2">
                Preparing checkout&hellip;
              </h1>
              <p className="text-sm text-white/60 antialiased">
                You&rsquo;ll be redirected to our secure payment page.
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
                  className="px-6 py-2.5 bg-dark_accent-500 hover:bg-dark_accent-400 text-white text-sm font-medium rounded-full transition-colors antialiased"
                >
                  Try again
                </button>
                <button
                  onClick={() => router.push('/home')}
                  className="text-sm text-white/50 hover:text-white/70 transition-colors antialiased"
                >
                  Go to dashboard
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<BuyPageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  const offerKey = context.params?.offerKey as string;
  const q = context.query;

  if (!user) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (k !== 'offerKey' && typeof v === 'string') params.set(k, v);
    }
    const qs = params.toString();
    const redirectTarget = `/buy/${offerKey}${qs ? `?${qs}` : ''}`;

    return {
      redirect: {
        destination: `/login?redirect=${encodeURIComponent(redirectTarget)}`,
        permanent: false,
      },
    };
  }

  return {
    props: {
      offerKey,
      tracking: {
        placement: (q.placement as string) || 'buy_link',
        source: (q.source as string) || 'buy_link',
        utm_source: (q.utm_source as string) || '',
        utm_medium: (q.utm_medium as string) || '',
        utm_campaign: (q.utm_campaign as string) || '',
        utm_content: (q.utm_content as string) || '',
        utm_term: (q.utm_term as string) || '',
      },
    },
  };
};
