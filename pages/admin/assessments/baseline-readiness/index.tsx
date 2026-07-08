/**
 * Admin Route: Baseline Readiness Operations Hub (Packet Q, updated X4c)
 *
 * GET /admin/assessments/baseline-readiness
 *
 * Internal/admin-gated hub for Baseline Readiness. Guarded activation is live
 * (registry `active`, public route reachable) but public marketing launch
 * remains NO-GO: SEO stays noindex/follow and downstream artifacts stay hidden.
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
  const isOperationallyLive = entry?.status === 'active';

  return (
    <>
      <Head>
        <title>Baseline Readiness Operations • Fine Diet Admin</title>
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
              {isOperationallyLive
                ? 'Operationally live — public marketing launch not approved'
                : 'Internal proof — activation status unknown'}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">
              Baseline Readiness Assessment
            </h1>
            <p className="mt-3 text-sm text-gray-700">
              Guarded activation is complete: registry status is{' '}
              <code className="rounded bg-amber-100 px-1">{entry?.status ?? 'unknown'}</code>
              {' '}and{' '}
              <code className="rounded bg-amber-100 px-1">/assessments/baseline-readiness</code>{' '}
              is reachable for direct-link use. Public marketing launch remains{' '}
              <strong>NO-GO</strong>: the route stays{' '}
              <code className="rounded bg-amber-100 px-1">noindex,follow</code>, is excluded from
              the sitemap, and downstream artifacts (email, PDF, webhook, claim, account-save)
              remain disabled.
            </p>
          </div>

          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Operational status</h2>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              <li>
                Registry entry:{' '}
                <span className="font-medium text-green-700">
                  {entry ? `yes (${entry.status})` : 'missing'}
                </span>
              </li>
              <li>
                Public route:{' '}
                <span className="font-medium text-green-700">
                  {isOperationallyLive ? 'live (direct link)' : 'not confirmed'}
                </span>
              </li>
              <li>
                SEO / indexing:{' '}
                <span className="font-medium text-amber-700">noindex,follow — not in sitemap</span>
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
              <li>
                Results content version:{' '}
                <code className="rounded bg-gray-100 px-1">
                  {contract?.resultsContentVersion ?? 'unknown'}
                </code>
              </li>
            </ul>
          </div>

          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Operator surfaces</h2>
            <div className="mt-4 space-y-3">
              <Link
                href="/assessments/baseline-readiness"
                className="block rounded-md border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                Open public cover route (noindex — direct link only)
              </Link>
              <Link
                href="/admin/assessments/baseline-readiness/start"
                className="block rounded-md bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-blue-700"
              >
                Run internal fixture (preview-only, no submission persist)
              </Link>
              <p className="text-xs text-gray-500">
                CMS question set v1 and result packs at{' '}
                <code>{contract?.resultsContentVersion}</code> should be published in production.
                Use forced preview below to QA each outcome level.
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
            <h2 className="text-lg font-semibold text-gray-900">Disabled downstream artifacts</h2>
            <p className="mt-2 text-sm text-gray-600">
              These remain hidden until a dedicated launch packet enables them:
            </p>
            <ul className="mt-3 list-disc pl-5 text-sm text-gray-700 space-y-1">
              <li>Email summary capture</li>
              <li>PDF download</li>
              <li>n8n webhook events</li>
              <li>Guest claim flow</li>
              <li>Save to account</li>
            </ul>
          </div>

          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Before public marketing launch</h2>
            <ul className="mt-3 list-disc pl-5 text-sm text-gray-700 space-y-1">
              <li>Approve final result-pack copy (replace placeholder CTAs and video URLs)</li>
              <li>Confirm forced preview and live results path for all three outcome levels</li>
              <li>Enable downstream artifacts as needed (email, PDF, webhook, claim, account-save)</li>
              <li>Remove noindex override and add route to sitemap when marketing approves</li>
              <li>Run marketing launch checklist in the CMS publish runbook</li>
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              See{' '}
              <code>docs/assessments/baseline-readiness-cms-publish-runbook.md</code> for the full
              operator runbook and marketing launch checklist.
            </p>
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
