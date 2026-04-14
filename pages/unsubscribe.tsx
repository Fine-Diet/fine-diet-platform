import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { verifyEmailToken } from '@/lib/emailLinks';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type PageState =
  | { status: 'ready'; token: string; email: string }
  | { status: 'invalid'; reason: 'expired' | 'invalid' | 'malformed' };

interface UnsubscribePageProps {
  page: PageState;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UnsubscribePage({ page }: UnsubscribePageProps) {
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleConfirm = async () => {
    if (page.status !== 'ready') return;
    setSubmitState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/people/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: page.token, scope: 'all' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      setSubmitState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitState('error');
    }
  };

  return (
    <>
      <Head>
        <title>Unsubscribe | Fine Diet</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <main className="min-h-[60vh] flex items-center justify-center px-4 py-20 bg-brand-900">
        <div className="w-full max-w-md">
          {/* Token invalid or expired */}
          {page.status !== 'ready' && (
            <Card>
              <IconCircle variant="warning">
                <ExclamationIcon />
              </IconCircle>
              <h1 className="text-xl font-semibold text-white antialiased mt-4">
                {page.reason === 'expired' ? 'This link has expired' : 'Invalid unsubscribe link'}
              </h1>
              <p className="mt-2 text-sm text-white/65 antialiased leading-relaxed">
                {page.reason === 'expired'
                  ? 'Unsubscribe links are valid for 30 days. Please use the link from a recent email, or contact us directly.'
                  : 'This link is not valid. Please use the unsubscribe link from one of your Fine Diet emails.'}
              </p>
              <div className="mt-6">
                <Link
                  href="/"
                  className="text-sm text-white/60 hover:text-white/90 antialiased transition-colors underline underline-offset-2"
                >
                  Return home
                </Link>
              </div>
            </Card>
          )}

          {/* Ready — awaiting confirmation */}
          {page.status === 'ready' && submitState === 'idle' && (
            <Card>
              <h1 className="text-xl font-semibold text-white antialiased">
                Unsubscribe from Fine Diet emails
              </h1>
              <p className="mt-3 text-sm text-white/65 antialiased leading-relaxed">
                You&apos;re about to unsubscribe{' '}
                <span className="text-white/85">{page.email}</span> from all Fine Diet
                marketing emails.
              </p>
              <p className="mt-2 text-sm text-white/50 antialiased">
                You&apos;ll still receive transactional emails related to your account.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={handleConfirm}
                  className="w-full px-5 py-3 rounded-full text-sm font-semibold antialiased
                    bg-white text-neutral-900 hover:bg-white/90 transition-opacity
                    focus:outline-none focus:ring-2 focus:ring-white/60"
                >
                  Confirm unsubscribe
                </button>
                <Link
                  href="/"
                  className="text-center text-sm text-white/50 hover:text-white/75 antialiased transition-colors"
                >
                  Keep me subscribed
                </Link>
              </div>
            </Card>
          )}

          {/* Submitting */}
          {page.status === 'ready' && submitState === 'submitting' && (
            <Card>
              <div className="flex justify-center">
                <span className="w-7 h-7 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
              </div>
              <p className="mt-4 text-sm text-white/60 antialiased text-center">
                Updating your preferences…
              </p>
            </Card>
          )}

          {/* Success */}
          {page.status === 'ready' && submitState === 'done' && (
            <Card>
              <IconCircle variant="success">
                <CheckIcon />
              </IconCircle>
              <h1 className="text-xl font-semibold text-white antialiased mt-4">
                You&apos;ve been unsubscribed
              </h1>
              <p className="mt-2 text-sm text-white/65 antialiased leading-relaxed">
                <span className="text-white/85">{page.email}</span> has been removed from
                Fine Diet marketing emails. This may take up to 24 hours to take effect
                across all systems.
              </p>
              <div className="mt-6">
                <Link
                  href="/"
                  className="text-sm text-white/60 hover:text-white/90 antialiased transition-colors underline underline-offset-2"
                >
                  Return home
                </Link>
              </div>
            </Card>
          )}

          {/* API error */}
          {page.status === 'ready' && submitState === 'error' && (
            <Card>
              <IconCircle variant="warning">
                <ExclamationIcon />
              </IconCircle>
              <h1 className="text-xl font-semibold text-white antialiased mt-4">
                Something went wrong
              </h1>
              <p className="mt-2 text-sm text-white/65 antialiased">{errorMsg}</p>
              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={handleConfirm}
                  className="w-full px-5 py-3 rounded-full text-sm font-semibold antialiased
                    bg-white text-neutral-900 hover:bg-white/90 transition-opacity
                    focus:outline-none focus:ring-2 focus:ring-white/60"
                >
                  Try again
                </button>
              </div>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-neutral-800/60 border border-white/10 rounded-3xl p-8 text-center backdrop-blur-sm">
      {children}
    </div>
  );
}

function IconCircle({
  variant,
  children,
}: {
  variant: 'success' | 'warning';
  children: React.ReactNode;
}) {
  const colors =
    variant === 'success'
      ? 'bg-emerald-500/15 text-emerald-400'
      : 'bg-amber-500/15 text-amber-400';
  return (
    <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center ${colors}`}>
      {children}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ExclamationIcon() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Server-side: verify token before rendering
// ---------------------------------------------------------------------------

export const getServerSideProps: GetServerSideProps<UnsubscribePageProps> = async (ctx) => {
  const token = typeof ctx.query.t === 'string' ? ctx.query.t : '';

  if (!token) {
    return { props: { page: { status: 'invalid', reason: 'malformed' } } };
  }

  const result = verifyEmailToken(token);

  if (!result.ok) {
    return { props: { page: { status: 'invalid', reason: result.reason } } };
  }

  return {
    props: {
      page: {
        status: 'ready',
        token,
        email: result.payload.email,
      },
    },
  };
};
