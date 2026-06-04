import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';

import { AuthPanel } from '@/components/account/AuthPanel';
import { useResolvedAuthContext } from '@/lib/auth/useResolvedAuthContext';
import { NEUTRAL_POST_AUTH_TARGET } from '@/lib/auth/authContext';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';

/**
 * /create-account — dedicated, context-aware account creation page.
 *
 * Reads auth context from the URL (ctx, redirect, email, offer, assessment,
 * submission, session), recovers any persisted `fd_auth_context` fallback when
 * the URL is bare, and renders the shared AuthPanel defaulted to the Create
 * Account tab. No-context signups land on /account/start afterward.
 *
 * Already-authenticated visitors are redirected away (see getServerSideProps):
 * to a safe `?redirect=` target when present, otherwise /account/start.
 */
export default function CreateAccountPage() {
  const router = useRouter();
  const context = useResolvedAuthContext('signup');

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
 * SSR guard: logged-in users should never see the signup form.
 *
 * - With a safe `?redirect=` (or `returnTo` alias) → honor it.
 * - Otherwise → the neutral /account/start landing.
 *
 * Uses the existing cookie-aware server auth helper. Anonymous visitors fall
 * through and render the AuthPanel as before.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
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

  return { props: {} };
};
