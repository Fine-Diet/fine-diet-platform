import Head from 'next/head';
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';
import { useMemo } from 'react';

import { AuthPanel } from '@/components/account/AuthPanel';
import { useResolvedAuthContext } from '@/lib/auth/useResolvedAuthContext';
import { NEUTRAL_POST_AUTH_TARGET } from '@/lib/auth/authContext';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { getOfferConfigByOfferKey } from '@/lib/access/offerConfig';
import {
  toMarketingDTO,
  type OfferMarketingDTO,
} from '@/lib/access/offerCatalogService';

/**
 * /create-account — dedicated, context-aware account creation page.
 *
 * Reads auth context from the URL (ctx, redirect, email, offer, assessment,
 * submission, session), recovers any persisted `fd_auth_context` fallback when
 * the URL is bare, and renders the shared AuthPanel defaulted to the Create
 * Account tab. No-context signups land on /account/start afterward.
 *
 * Checkout context (`ctx=checkout` + a resolvable `offer=<offerKey>`) upgrades
 * the page into Step 1 of the app subscription/trial checkout: it frames account
 * creation as the first step before secure Stripe checkout and onboarding, and
 * surfaces the selected offer's name/price/trial summary. Resolution is
 * presentation-only via the local offer config; billing truth still lives in
 * Supabase and is applied at /api/checkout/create. Stripe price IDs are never
 * exposed (the marketing DTO strips them).
 *
 * Already-authenticated visitors are redirected away (see getServerSideProps):
 * to a safe `?redirect=` target when present, otherwise /account/start.
 */
type CreateAccountProps = InferGetServerSidePropsType<typeof getServerSideProps>;

/** Build the resume hand-off used when no explicit redirect rode along. */
function defaultResumeRedirect(offerKey: string): string {
  const params = new URLSearchParams({
    offer: offerKey,
    source: 'start',
    placement: 'start-hero',
  });
  return `/checkout/resume?${params.toString()}`;
}

function checkoutHeadline(offer: OfferMarketingDTO): string {
  return offer.trialDays > 0
    ? 'Create your account to start your trial'
    : 'Create your account to get full access';
}

function trialSummary(offer: OfferMarketingDTO): string {
  const price = `${offer.priceLabel}${offer.priceSuffix ?? ''}`;
  if (offer.trialDays > 0) {
    return `${offer.trialDays}-day free trial, then ${price}`;
  }
  return `${price} billed today — no trial`;
}

const CHECKOUT_STEPS = [
  {
    title: 'Create your account',
    description: 'Set up your Fine Diet login — this takes a few seconds.',
  },
  {
    title: 'Add payment securely with Stripe',
    description:
      'Continue to Stripe’s secure checkout to add your payment method.',
  },
  {
    title: 'Finish onboarding',
    description: 'Personalize Fine Diet and start using the app and programs.',
  },
];

function CheckoutStepPath({ offer }: { offer: OfferMarketingDTO }) {
  return (
    <ol className="mt-8 space-y-4">
      {CHECKOUT_STEPS.map((step, index) => {
        const isCurrent = index === 0;
        return (
          <li key={step.title} className="flex items-start gap-4">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold antialiased ${
                isCurrent
                  ? 'bg-denim-500 text-white'
                  : 'bg-white/10 text-white/60'
              }`}
            >
              {index + 1}
            </span>
            <div>
              <p
                className={`text-sm font-semibold antialiased ${
                  isCurrent ? 'text-white' : 'text-white/70'
                }`}
              >
                {step.title}
              </p>
              <p className="text-sm text-white/50 antialiased">
                {step.description}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OfferSummaryCard({ offer }: { offer: OfferMarketingDTO }) {
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
      {offer.copy.eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-wider text-denim-400 antialiased">
          {offer.copy.eyebrow}
        </p>
      )}
      <p className="mt-1 text-base font-semibold text-white antialiased">
        {offer.copy.title}
      </p>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-white antialiased">
          {offer.priceLabel}
        </span>
        {offer.priceSuffix && (
          <span className="text-sm text-white/60 antialiased">
            {offer.priceSuffix}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-white/60 antialiased">
        {trialSummary(offer)}
      </p>
    </div>
  );
}

export default function CreateAccountPage({ checkoutOffer }: CreateAccountProps) {
  const router = useRouter();
  const context = useResolvedAuthContext('signup');

  const isCheckout = context.source === 'checkout' && Boolean(checkoutOffer);

  // In checkout context, guarantee the user continues into Stripe after auth.
  // Honor an explicit redirect when present; otherwise hand off to the resume
  // step with the offer we already resolved.
  const effectiveContext = useMemo(() => {
    if (isCheckout && checkoutOffer && !context.redirectTo) {
      return {
        ...context,
        redirectTo: defaultResumeRedirect(checkoutOffer.offerKey),
      };
    }
    return context;
  }, [isCheckout, checkoutOffer, context]);

  if (isCheckout && checkoutOffer) {
    return (
      <>
        <Head>
          <title>Create Account • Fine Diet</title>
        </Head>
        <div className="min-h-screen bg-brand-900 text-white">
          <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-stretch gap-8 p-6 lg:flex-row lg:items-center lg:gap-12 lg:p-10">
            {/* Left: checkout-aware framing */}
            <div className="flex-1 lg:max-w-md">
              <p className="text-xs font-semibold uppercase tracking-wider text-denim-400 antialiased">
                Step 1 of checkout
              </p>
              <h1 className="mt-3 text-2xl font-semibold leading-tight antialiased sm:text-3xl">
                {checkoutHeadline(checkoutOffer)}
              </h1>
              <p className="mt-3 text-sm text-white/70 antialiased">
                Your Fine Diet account comes first — then we hand you to secure
                Stripe checkout to add payment. No charge happens on this page.
              </p>

              <CheckoutStepPath offer={checkoutOffer} />
              <OfferSummaryCard offer={checkoutOffer} />
            </div>

            {/* Right: account creation */}
            <div className="w-full lg:max-w-md">
              <div className="w-full rounded-2xl bg-neutral-900/95 p-8 backdrop-blur-lg">
                <AuthPanel context={effectiveContext} />

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => router.push('/start')}
                    className="text-sm text-white/60 transition-colors hover:text-white/90 antialiased"
                  >
                    Back to plans
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Create Account • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-brand-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900/95 backdrop-blur-lg rounded-2xl p-8 text-white">
          <AuthPanel context={context} />

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-sm text-white/60 hover:text-white/90 transition-colors antialiased"
            >
              Return to home
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * SSR guard + checkout offer resolution.
 *
 * - Logged-in users should never see the signup form: honor a safe `?redirect=`
 *   (or `returnTo` alias), otherwise the neutral /account/start landing.
 * - Anonymous visitors fall through and render the AuthPanel. When the page is
 *   reached with `ctx=checkout` and a resolvable `offer=<offerKey>`, we attach a
 *   marketing-safe offer DTO (no Stripe IDs) so the page can render the
 *   checkout-aware experience.
 */
export const getServerSideProps = (async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (user) {
    const { redirect, returnTo } = context.query;
    const rawRedirect =
      (Array.isArray(redirect) ? redirect[0] : redirect) ??
      (Array.isArray(returnTo) ? returnTo[0] : returnTo);
    const destination = getSafeRedirectTarget(
      typeof rawRedirect === 'string' ? rawRedirect : undefined,
      NEUTRAL_POST_AUTH_TARGET
    );

    return {
      redirect: {
        destination,
        permanent: false,
      },
    };
  }

  const { ctx, offer } = context.query;
  const ctxValue = Array.isArray(ctx) ? ctx[0] : ctx;
  const offerKey = Array.isArray(offer) ? offer[0] : offer;

  let checkoutOffer: OfferMarketingDTO | null = null;
  if (ctxValue === 'checkout' && typeof offerKey === 'string' && offerKey) {
    const config = getOfferConfigByOfferKey(offerKey);
    if (config) {
      checkoutOffer = toMarketingDTO(config);
    }
  }

  return { props: { checkoutOffer } };
}) satisfies GetServerSideProps<{ checkoutOffer: OfferMarketingDTO | null }>;
