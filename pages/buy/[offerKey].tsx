/**
 * /buy/[offerKey] — Direct checkout link or product-level purchase selector
 *
 * Stable URL for placing in emails, admin, or external placements.
 * Supports query params: placement, source, utm_source, utm_medium, etc.
 *
 * Specific offer flow:
 *   1. SSR: if not authed → redirect to context-aware create account
 *   2. Client: auto-POST to /api/checkout/create → redirect to Stripe
 *
 * Product-level flow:
 *   /buy/fine-diet-app renders Monthly / Annual choices and routes the selected
 *   option into the existing specific-offer checkout flow.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { ensureSessionIdClient } from '@/lib/tracking/sessionId';
import { buildAuthUrl } from '@/lib/auth/authContext';
import { getOfferConfigByOfferKey } from '@/lib/access/offerConfig';
import { toMarketingDTO, type OfferMarketingDTO } from '@/lib/access/offerCatalogService';

const PRODUCT_BUY_SLUG = 'fine-diet-app';
const PRODUCT_OPTION_KEYS = ['fine-diet-method-monthly', 'fine-diet-method-annual'] as const;

type BuyPageMode = 'checkout' | 'selector';

interface TrackingParams {
  placement: string;
  source: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
}

interface BuyPlanOption {
  offerKey: string;
  title: string;
  subtitle: string;
  priceLabel: string;
  priceSuffix?: string;
  ctaLabel: string;
  badge?: string;
  trialNote?: string;
}

interface BuyPageProps {
  mode: BuyPageMode;
  offerKey: string;
  priceOptionKey: string | null;
  tracking: TrackingParams;
  planOptions?: BuyPlanOption[];
}

function buildQueryString(tracking: TrackingParams): string {
  const params = new URLSearchParams();
  Object.entries(tracking).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function toBuyPlanOption(offer: OfferMarketingDTO, badge?: string): BuyPlanOption {
  return {
    offerKey: offer.offerKey,
    title: offer.copy.title,
    subtitle: offer.copy.subtitle,
    priceLabel: offer.priceLabel,
    priceSuffix: offer.priceSuffix || undefined,
    ctaLabel: offer.copy.ctaLabel,
    badge,
    trialNote: offer.copy.trialNote || undefined,
  };
}

function PlanSelector({ planOptions, tracking }: { planOptions: BuyPlanOption[]; tracking: TrackingParams }) {
  const router = useRouter();
  const queryString = useMemo(() => buildQueryString(tracking), [tracking]);

  function handleSelect(offerKey: string) {
    router.push(`/buy/${offerKey}${queryString ? `?${queryString}` : ''}`);
  }

  return (
    <>
      <Head>
        <title>Choose Your Plan &bull; Fine Diet</title>
      </Head>
      <main className="min-h-screen bg-brand-900 px-6 pb-12 pt-[120px] text-white lg:px-10 lg:pt-[140px]">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-denim-400 antialiased">
              Fine Diet Subscription
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight antialiased sm:text-4xl">
              Choose how you want to pay
            </h1>
            <p className="mt-4 text-sm leading-6 text-white/65 antialiased sm:text-base">
              Get the same Fine Diet app and programs either monthly or annually. Your selected billing option is confirmed before Stripe checkout.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {planOptions.map((plan) => (
              <button
                key={plan.offerKey}
                type="button"
                onClick={() => handleSelect(plan.offerKey)}
                className="group rounded-3xl border border-white/10 bg-neutral-900/95 p-6 text-left transition hover:border-denim-400/70 hover:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-denim-400"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {plan.badge && (
                      <p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70 antialiased">
                        {plan.badge}
                      </p>
                    )}
                    <h2 className="text-xl font-semibold text-white antialiased">
                      {plan.title}
                    </h2>
                  </div>
                  <div className="text-right">
                    <div className="flex items-baseline justify-end gap-1">
                      <span className="text-2xl font-semibold text-white antialiased">
                        {plan.priceLabel}
                      </span>
                      {plan.priceSuffix && (
                        <span className="text-sm text-white/55 antialiased">
                          {plan.priceSuffix}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-white/65 antialiased">
                  {plan.subtitle}
                </p>
                {plan.trialNote && (
                  <p className="mt-4 text-xs leading-5 text-white/45 antialiased">
                    {plan.trialNote}
                  </p>
                )}
                <div className="mt-6 inline-flex rounded-full bg-denim-500 px-5 py-2.5 text-sm font-semibold text-white transition group-hover:bg-denim-400 antialiased">
                  {plan.ctaLabel}
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}

export default function BuyPage({ mode, offerKey, priceOptionKey, tracking, planOptions = [] }: BuyPageProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'redirecting' | 'error'>('redirecting');

  useEffect(() => {
    if (mode !== 'checkout') return;

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
  }, [mode, offerKey, priceOptionKey, tracking]);

  if (mode === 'selector') {
    return <PlanSelector planOptions={planOptions} tracking={tracking} />;
  }

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
                  className="px-6 py-2.5 bg-denim-500 hover:bg-denim-400 text-white text-sm font-medium rounded-full transition-colors antialiased"
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

  const priceOptionKey =
    (Array.isArray(q.price_option) ? q.price_option[0] : q.price_option) || null;

  const tracking: TrackingParams = {
    placement: (q.placement as string) || 'buy_link',
    source: (q.source as string) || 'buy_link',
    utm_source: (q.utm_source as string) || '',
    utm_medium: (q.utm_medium as string) || '',
    utm_campaign: (q.utm_campaign as string) || '',
    utm_content: (q.utm_content as string) || '',
    utm_term: (q.utm_term as string) || '',
  };

  if (offerKey === PRODUCT_BUY_SLUG) {
    const planOptions = PRODUCT_OPTION_KEYS
      .map((key, index) => {
        const offer = getOfferConfigByOfferKey(key);
        return offer ? toBuyPlanOption(toMarketingDTO(offer), index === 1 ? 'Best value' : undefined) : null;
      })
      .filter((option): option is BuyPlanOption => Boolean(option));

    return {
      props: {
        mode: 'selector',
        offerKey,
        priceOptionKey: null,
        tracking,
        planOptions,
      },
    };
  }

  if (!user) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (k !== 'offerKey' && typeof v === 'string') params.set(k, v);
    }
    const qs = params.toString();
    const redirectTarget = `/buy/${offerKey}${qs ? `?${qs}` : ''}`;

    // Context-aware: default new buyers to the Create Account flow, preserving
    // the offer + the checkout redirect.
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
      mode: 'checkout',
      offerKey,
      priceOptionKey,
      tracking,
    },
  };
};