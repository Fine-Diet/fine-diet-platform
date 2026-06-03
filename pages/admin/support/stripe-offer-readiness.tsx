/**
 * Admin Support: Stripe Live Offer Readiness
 *
 * Packet C read-only UI over the stripe-offer-readiness endpoint. This page
 * does not query Supabase directly and exposes no mutation, key-rotation, or
 * offer-activation tools. It only renders readiness findings so an operator
 * can verify launch readiness before promoting offers live.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type {
  ReadinessSeverity,
  StripeOfferReadinessReport,
  StripeReadinessFinding,
} from '@/lib/admin/stripeOfferReadinessService';

interface Props {
  user: AuthenticatedUser | null;
}

function severityClasses(severity: ReadinessSeverity): string {
  if (severity === 'blocking') return 'bg-red-50 border-red-200 text-red-800';
  if (severity === 'warning') return 'bg-amber-50 border-amber-200 text-amber-800';
  return 'bg-blue-50 border-blue-200 text-blue-800';
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function FindingsTable({ findings }: { findings: StripeReadinessFinding[] }) {
  if (findings.length === 0) {
    return (
      <div className="rounded border border-dashed border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
        No readiness findings. All active offers look configured for live checkout.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="py-2 pr-3">Severity</th>
            <th className="py-2 pr-3">Code</th>
            <th className="py-2 pr-3">Offer</th>
            <th className="py-2 pr-3">Detail</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding, index) => (
            <tr
              key={`${finding.code}-${finding.offer_key ?? 'none'}-${index}`}
              className="border-t border-gray-100 align-top"
            >
              <td className="py-2 pr-3">
                <Badge className={severityClasses(finding.severity)}>{finding.severity}</Badge>
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-gray-800">{finding.code}</td>
              <td className="py-2 pr-3 font-mono text-xs text-gray-700">
                {finding.offer_key ?? '-'}
              </td>
              <td className="py-2 pr-3 text-xs text-gray-800">{finding.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StripeOfferReadinessPage({ user }: Props) {
  const [report, setReport] = useState<StripeOfferReadinessReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/support/stripe-offer-readiness');
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'Failed to load Stripe offer readiness.');
      }
      setReport(body as StripeOfferReadinessReport);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : 'Failed to load Stripe offer readiness.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') void loadReport();
  }, [user, loadReport]);

  if (!user || user.role !== 'admin') {
    return (
      <>
        <Head>
          <title>Stripe Offer Readiness · Fine Diet Admin</title>
        </Head>
        <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
          <div className="max-w-md text-center">
            <h1 className="mb-4 text-3xl font-bold text-gray-900">Access Denied</h1>
            <p className="mb-8 text-lg text-gray-600">
              Only administrators can inspect Stripe offer readiness.
            </p>
            <Link
              href="/admin"
              className="inline-block rounded-md bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
            >
              Return to Admin Dashboard
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Stripe Offer Readiness · Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-12">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link href="/admin" className="mb-4 inline-flex text-sm text-gray-600 hover:text-gray-900">
              Back to Admin Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Stripe Live Offer Readiness</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Read-only readiness report over active offers and entitlement mappings. This page
              exposes no key rotation, env switching, offer activation, or Stripe write actions. It
              mirrors <span className="font-mono text-xs">scripts/sql/auditStripeLiveOfferReadiness.sql</span> so
              launch readiness is verifiable without running SQL by hand.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Signed in as <span className="font-medium text-gray-700">{user.email ?? 'Unknown'}</span> ·{' '}
              <Link href="/admin/offers" className="text-blue-600 hover:underline">
                Offers &amp; Bundles
              </Link>
            </p>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadReport()}
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Re-run readiness check'}
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          {loading && !report && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 shadow-sm">
              Loading Stripe offer readiness...
            </div>
          )}

          {report && (
            <div className="space-y-6">
              <div
                className={`rounded-lg border p-4 text-sm shadow-sm ${
                  report.summary.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-red-200 bg-red-50 text-red-900'
                }`}
              >
                <div className="text-base font-semibold">
                  {report.summary.ok
                    ? 'No blocking readiness issues detected.'
                    : `${report.summary.blocking_count} blocking issue(s) must be resolved before live checkout.`}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-5">
                  <div>
                    <span className="font-semibold">{report.offer_count}</span> offers
                  </div>
                  <div>
                    <span className="font-semibold">{report.active_offer_count}</span> active
                  </div>
                  <div>
                    <span className="font-semibold">{report.summary.blocking_count}</span> blocking
                  </div>
                  <div>
                    <span className="font-semibold">{report.summary.warning_count}</span> warnings
                  </div>
                  <div>
                    <span className="font-semibold">{report.summary.info_count}</span> info
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-600 shadow-sm">
                Generated {formatTimestamp(report.generated_at)} · Read-only · No Stripe or Supabase
                writes performed.
              </div>

              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Findings ({report.findings.length})
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Blocking issues fail live checkout or grant nothing. Warnings are config to
                    confirm before launch. Info items are advisory.
                  </p>
                </div>
                <FindingsTable findings={report.findings} />
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">Next steps (human-only)</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                  <li>
                    Resolve blocking findings in{' '}
                    <Link href="/admin/offers" className="text-blue-600 hover:underline">
                      Offers &amp; Bundles
                    </Link>{' '}
                    (price IDs, entitlement mappings).
                  </li>
                  <li>
                    Confirm any shared/duplicate price IDs are intentional before going live.
                  </li>
                  <li>
                    Follow{' '}
                    <span className="font-mono text-xs">
                      docs/payments/STRIPE-LIVE-CHECKOUT-TEST-PLAN.md
                    </span>{' '}
                    for the manual live-checkout QA pass.
                  </li>
                  <li>
                    Stripe Dashboard products/prices, keys, and webhook endpoints remain
                    human-managed; this tool never edits them.
                  </li>
                </ul>
              </section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/support/stripe-offer-readiness',
        permanent: false,
      },
    };
  }
  if (user.role !== 'admin') {
    return {
      redirect: {
        destination: '/admin/unauthorized',
        permanent: false,
      },
    };
  }

  return { props: { user } };
};
