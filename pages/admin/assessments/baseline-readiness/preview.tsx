/**
 * Admin Route: Baseline Readiness Forced Result Preview (Packet Q)
 *
 * GET /admin/assessments/baseline-readiness/preview?forceOutcome=readiness-low|readiness-building|readiness-ready
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import {
  buildForcedBaselineReadinessPreviewResult,
  FORCED_BASELINE_READINESS_LEVELS,
  type ForcedBaselineReadinessPreviewResult,
} from '@/lib/assessments/results/forcedPreviewBaselineReadiness';
import { ForcedBaselineReadinessPreview } from '@/components/admin/assessments/ForcedBaselineReadinessPreview';

interface PreviewPageProps {
  user: AuthenticatedUser | null;
  forced: ForcedBaselineReadinessPreviewResult | null;
  invalidLevel: string | null;
  errorMessage: string | null;
}

export default function BaselineReadinessForcedPreviewPage({
  user,
  forced,
  invalidLevel,
  errorMessage,
}: PreviewPageProps) {
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Forced Preview • Fine Diet Admin</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="mb-4 text-3xl font-bold text-gray-900">Admin</h1>
            <p className="mb-8 text-lg text-gray-600">
              You don&apos;t have permission to access this area.
            </p>
            <Link href="/" className="inline-block rounded-md bg-blue-600 px-6 py-3 font-medium text-white">
              Return to Home
            </Link>
          </div>
        </main>
      </>
    );
  }

  if (!forced) {
    return (
      <>
        <Head>
          <title>Baseline Readiness Forced Preview • Fine Diet Admin</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <section className="min-h-screen bg-brand-900 px-6 py-16 text-white antialiased sm:px-10">
          <div className="mx-auto w-full max-w-[680px]">
            <div className="rounded-[24px] border border-amber-300/40 bg-amber-100/10 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                Forced QA preview — admin only
              </p>
              <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
                Baseline Readiness forced result preview
              </h1>
              <p className="mt-4 text-sm text-white/80">
                Pick a readiness level to force-render. No submission, email,
                webhook, or claim side effects.
              </p>
            </div>

            {errorMessage && (
              <div className="mt-6 rounded-2xl border border-red-300/40 bg-red-100/10 p-5">
                <h2 className="text-lg font-semibold text-red-200">Invalid forced outcome</h2>
                <p className="mt-2 text-sm text-white/80">{errorMessage}</p>
                {invalidLevel && (
                  <p className="mt-2 text-xs text-white/60">
                    Requested: <code className="text-white">{invalidLevel}</code>
                  </p>
                )}
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              {FORCED_BASELINE_READINESS_LEVELS.map((lvl) => (
                <Link
                  key={lvl}
                  href={`/admin/assessments/baseline-readiness/preview?forceOutcome=${lvl}`}
                  className="inline-flex items-center justify-center rounded-full bg-denim-500 px-6 py-3 text-sm font-bold text-neutral-900"
                >
                  {lvl}
                </Link>
              ))}
            </div>

            <div className="mt-8">
              <Link href="/admin/assessments/baseline-readiness" className="text-sm text-white/70 hover:text-white">
                ← Back to internal hub
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Forced Preview · {forced.primaryAvatar} • Baseline Readiness Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <ForcedBaselineReadinessPreview forced={forced} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PreviewPageProps> = async (
  context
) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null, forced: null, invalidLevel: null, errorMessage: null } };
  }

  const raw = context.query.forceOutcome;
  const requestedLevel =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw) && typeof raw[0] === 'string'
        ? raw[0]
        : '';

  if (!requestedLevel) {
    return { props: { user, forced: null, invalidLevel: null, errorMessage: null } };
  }

  const outcome = buildForcedBaselineReadinessPreviewResult(requestedLevel);
  if (!outcome.ok) {
    return {
      props: {
        user,
        forced: null,
        invalidLevel: outcome.error.requestedLevel,
        errorMessage: outcome.error.message,
      },
    };
  }

  return {
    props: {
      user,
      forced: outcome.result,
      invalidLevel: null,
      errorMessage: null,
    },
  };
};
