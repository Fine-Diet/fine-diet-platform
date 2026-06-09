import Head from 'next/head';
import { useRouter } from 'next/router';

import { AuthPanel } from '@/components/account/AuthPanel';
import { useResolvedAuthContext } from '@/lib/auth/useResolvedAuthContext';

export default function LoginPage() {
  const router = useRouter();
  const context = useResolvedAuthContext('login');

  return (
    <>
      <Head>
        <title>Login • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-brand-900 flex justify-center px-6 pb-10 pt-[120px]">
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
