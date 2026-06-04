import Head from 'next/head';
import { useRouter } from 'next/router';
import { useMemo } from 'react';

import { AuthPanel } from '@/components/account/AuthPanel';
import { parseAuthContext } from '@/lib/auth/authContext';

/**
 * /create-account — dedicated, context-aware account creation page.
 *
 * Reads auth context from the URL (ctx, redirect, email, offer, assessment,
 * submission, session) and renders the shared AuthPanel defaulted to the
 * Create Account tab. No-context signups land on /account/start afterward.
 */
export default function CreateAccountPage() {
  const router = useRouter();
  const context = useMemo(
    () => ({ ...parseAuthContext(router.query), intent: 'signup' as const }),
    [router.query]
  );

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
