/**
 * Admin Route: Baseline Readiness Internal Proof Hub (Packet Q)
 *
 * GET /admin/assessments/baseline-readiness
 *
 * Internal/admin-gated launch surface for the second assessment proof.
 * Registry status remains `draft` — /assessments/baseline-readiness 404s on
 * the public route. This hub links to the internal fixture runner and forced
 * result preview harness only.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import { getAssessmentEntry } from '@/lib/assessments/assessmentRegistry';
import { getOperationsContract } from '@/lib/assessments/operationsContract';
import { getScoringAdapter } from '@/lib/assessments/scoring/scoringDispatch';
import { getOutcomeMapper } from '@/lib/assessments/outcomes/outcomeMapping';
import { FORCED_BASELINE_READINESS_LEVELS } from '@/lib/assessments/results/forcedPreviewBaselineReadiness';

interface HubPageProps {
  user: AuthenticatedUser | null;
}

export default function BaselineReadinessInternalHub({ user }: HubPageProps) {
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Baseline Readiness • Fine Diet Admin</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="mb-4 text-3xl font-bold text-gray-900">Admin</h1>
            <p className="mb-8 text-lg text-gray-600">
              You don&apos;t have permission to access this area.
            </p>
            <Link
              href="/"
              className="inline-block rounded-md bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Return to Home
            </Link>
          </div>
        </main>
      </>
    );
  }

  const entry = getAssessmentEntry('baseline-readiness');
  const contract = getOperationsContract('baseline-readiness');
  const scoringAdapter = getScoringAdapter('baseline-readiness');
  const outcomeMapper = getOutcomeMapper('baseline-readiness');

  return (
    <>
      <Head>
        <title>Baseline Readiness Internal Proof • Fine Diet Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="min-h-screen bg-gray-100 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/admin/assessments"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← Back to Assessments admin
          </Link>

          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Internal proof — not publicly launched
            </p>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">
              Baseline Readiness Assessment
            </h1>
            <p className="mt-3 text-sm text-gray-700">
              Second-assessment proof of the dual activation gate (scoring adapter +
              outcome mapper + operations contract + registry entry). Registry status is{' '}
              <code className="rounded bg-amber-100 px-1">{entry?.status ?? 'unknown'}</code>
              — the public route <code className="rounded bg-amber-100 px-1">/assessments/baseline-readiness</code>{' '}
              returns 404 until status is promoted to <code className="rounded bg-amber-100 px-1">active</code> after
              CMS question sets and results packs are published.
            </p>
          </div>

          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Dual activation status</h2>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              <li>
                Registry entry:{' '}
                <span className="font-medium text-green-700">
                  {entry ? `yes (${entry.status})` : 'missing'}
                </span>
              </li>
              <li>
                Scoring adapter:{' '}
                <span className="font-medium text-green-700">
                  {scoringAdapter?.id ?? 'missing'}
                </span>
              </li>
              <li>
                Outcome mapper:{' '}
                <span className="font-medium text-green-700">
                  {outcomeMapper?.id ?? 'missing'}
                </span>
              </li>
              <li>
                Operations contract:{' '}
                <span className="font-medium text-green-700">
                  {contract ? 'declared' : 'missing'}
                </span>
              </li>
            </ul>
          </div>

          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Internal launch surfaces</h2>
            <div className="mt-4 space-y-3">
              <Link
                href="/admin/assessments/baseline-readiness/start"
                className="block rounded-md bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-blue-700"
              >
                Run internal fixture (preview-only, no submission persist)
              </Link>
              <p className="text-xs text-gray-500">
                Uses a code-owned 5-question fixture until a CMS question set is published.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Forced result preview</h2>
            <p className="mt-2 text-sm text-gray-600">
              Force-render each readiness level without scoring or side effects.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {FORCED_BASELINE_READINESS_LEVELS.map((lvl) => (
                <Link
                  key={lvl}
                  href={`/admin/assessments/baseline-readiness/preview?forceOutcome=${lvl}`}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {lvl}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Before public launch</h2>
            <ul className="mt-3 list-disc pl-5 text-sm text-gray-700 space-y-1">
              <li>Publish question set for <code>baseline-readiness</code> v1 in CMS</li>
              <li>
                Publish results packs for readiness-low, readiness-building, readiness-ready at{' '}
                <code>{contract?.resultsContentVersion}</code>
              </li>
              <li>Replace provisional scoring with product-approved logic if needed</li>
              <li>Configure email / PDF / webhook / CTA routing</li>
              <li>Promote registry <code>status</code> from <code>draft</code> to <code>active</code></li>
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<HubPageProps> = async (
  context
) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  return { props: { user } };
};
