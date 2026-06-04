import Head from 'next/head';
import { useRouter } from 'next/router';

import { AuthPanel } from '@/components/account/AuthPanel';
import { useResolvedAuthContext } from '@/lib/auth/useResolvedAuthContext';

/**
 * Login Page
 *
 * Standalone, context-aware auth page. Reads auth context from the URL
 * (redirect/returnTo, ctx, email, etc.), then recovers any persisted
 * `fd_auth_context` fallback when the URL is bare, and renders the shared
 * AuthPanel defaulted to the Login tab. Existing users with no redirect land
 * on /home; the Create Account tab routes new users to the neutral
 * /account/start.
 */
export default function LoginPage() {
  const router = useRouter();
  const context = useResolvedAuthContext('login');

  return (
    <>
      <Head>
        <title>Login • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-brand-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900/95 backdrop-blur-lg rounded-2xl p-8 text-white">
          <AuthPanel context={context} loginFallback="/home" />

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-sm text-white/70 hover:text-white/90 transition-colors antialiased"
            >
              Return to home
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
