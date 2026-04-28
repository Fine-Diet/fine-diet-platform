/**
 * Admin Support: Planning/Grocery Support Case
 *
 * Packet 64 read-only UI over the support-case export endpoint. This page
 * summarizes and links to detailed support tools without exposing actions.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type {
  PlanningGrocerySupportCase,
  SupportCaseSection,
  SupportCaseSeverity,
} from '@/lib/admin/planningGrocerySupportCaseService';

interface Props {
  user: AuthenticatedUser | null;
  initialPersonId: string | null;
  initialAnomalyLimit: number;
}

function parseLimit(value: unknown): number {
  if (typeof value !== 'string') return 25;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function severityClasses(severity: SupportCaseSeverity | undefined): string {
  if (severity === 'high') return 'bg-red-50 border-red-200 text-red-800';
  if (severity === 'warning') return 'bg-amber-50 border-amber-200 text-amber-800';
  return 'bg-blue-50 border-blue-200 text-blue-800';
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
      {label}
    </div>
  );
}

function SectionCard({ section }: { section: SupportCaseSection }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
          <div className="mt-1 font-mono text-xs text-gray-500">{section.key}</div>
        </div>
        {section.severity && (
          <Badge className={severityClasses(section.severity)}>{section.severity}</Badge>
        )}
      </div>
      {section.bullets.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          {section.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <EmptyState label="No section bullets." />
      )}
      {section.evidence && section.evidence.length > 0 && (
        <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Evidence</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600">
            {section.evidence.slice(0, 10).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {section.related_links && section.related_links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {section.related_links.map((link) => (
            <Link
              key={`${section.key}-${link.href}`}
              href={link.href}
              className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryCards({ supportCase }: { supportCase: PlanningGrocerySupportCase }) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-gray-500">Plans</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{supportCase.summary.active_plan_count}</div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-gray-500">Grocery Lists</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{supportCase.summary.grocery_list_count}</div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-gray-500">Pantry Items</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{supportCase.summary.pantry_item_count}</div>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-amber-700">Anomalies</div>
        <div className="mt-1 text-2xl font-bold text-amber-900">{supportCase.summary.anomaly_count}</div>
        <div className="mt-1 text-xs text-amber-700">
          highest {supportCase.summary.highest_anomaly_severity}
        </div>
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-blue-700">Legacy Review</div>
        <div className="mt-1 text-2xl font-bold text-blue-900">{supportCase.summary.review_required_count}</div>
        <div className="mt-1 text-xs text-blue-700">
          candidates {supportCase.summary.legacy_cleanup_candidate_count}
        </div>
      </div>
    </div>
  );
}

function DetailLinks({ supportCase }: { supportCase: PlanningGrocerySupportCase }) {
  const links = [
    ['Snapshot', supportCase.links.snapshot_url],
    ['Storage audit', supportCase.links.storage_audit_url],
    ['Legacy cleanup dry-run', supportCase.links.legacy_cleanup_dry_run_url],
    ['Anomalies', supportCase.links.anomalies_url],
  ] as const;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Detailed Support Links</h2>
      <div className="flex flex-wrap gap-2">
        {links.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function PlanningGrocerySupportCasePage({
  user,
  initialPersonId,
  initialAnomalyLimit,
}: Props) {
  const router = useRouter();
  const [personId, setPersonId] = useState(initialPersonId ?? '');
  const [anomalyLimit, setAnomalyLimit] = useState(String(initialAnomalyLimit));
  const [supportCase, setSupportCase] = useState<PlanningGrocerySupportCase | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const loadedInitialRef = useRef(false);
  const reportTextAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadSupportCase = useCallback(
    async (options?: { syncUrl?: boolean }) => {
      const trimmedPersonId = personId.trim();
      if (!trimmedPersonId) {
        setSupportCase(null);
        setError('Enter a person_id to export a support case.');
        return;
      }

      const limit = parseLimit(anomalyLimit);
      const params = new URLSearchParams();
      params.set('person_id', trimmedPersonId);
      params.set('anomaly_limit', String(limit));
      params.set('include_details', 'true');

      setLoading(true);
      setError(null);
      setCopyStatus(null);
      try {
        const response = await fetch(`/api/admin/support/planning-grocery-support-case?${params}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load support case');
        }
        setSupportCase(data as PlanningGrocerySupportCase);
        if (options?.syncUrl) {
          await router.replace(
            {
              pathname: router.pathname,
              query: Object.fromEntries(params.entries()),
            },
            undefined,
            { shallow: true },
          );
        }
      } catch (err) {
        setSupportCase(null);
        setError(err instanceof Error ? err.message : 'Failed to load support case');
      } finally {
        setLoading(false);
      }
    },
    [anomalyLimit, personId, router],
  );

  useEffect(() => {
    if (loadedInitialRef.current || !initialPersonId) return;
    loadedInitialRef.current = true;
    void loadSupportCase({ syncUrl: false });
  }, [initialPersonId, loadSupportCase]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadSupportCase({ syncUrl: true });
  }

  async function handleCopyReport() {
    if (!supportCase) return;
    try {
      await navigator.clipboard.writeText(supportCase.copyable_report_markdown);
      setCopyStatus('Report copied.');
    } catch {
      const textArea = reportTextAreaRef.current;
      if (textArea) {
        textArea.focus();
        textArea.select();
        if (document.execCommand('copy')) {
          setCopyStatus('Report copied.');
          return;
        }
      }
      setCopyStatus('Copy failed. The report text is selected for manual copy.');
    }
  }

  const resultLabel = useMemo(() => {
    if (!supportCase) return null;
    return `Generated ${formatTimestamp(supportCase.generated_at)} · person ${
      supportCase.person.person_id
    } · anomaly limit ${parseLimit(anomalyLimit)}`;
  }, [anomalyLimit, supportCase]);

  if (!user || user.role !== 'admin') {
    return (
      <>
        <Head>
          <title>Planning/Grocery Support Case · Fine Diet Admin</title>
        </Head>
        <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
          <div className="max-w-md text-center">
            <h1 className="mb-4 text-3xl font-bold text-gray-900">Access Denied</h1>
            <p className="mb-8 text-lg text-gray-600">
              Only administrators can export planning/grocery support cases.
            </p>
            <Link href="/admin" className="inline-block rounded-md bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700">
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
        <title>Planning/Grocery Support Case · Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-12">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link href="/admin" className="mb-4 inline-flex text-sm text-gray-600 hover:text-gray-900">
              Back to Admin Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Planning/Grocery Support Case</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Export a compact internal support report from the read-only snapshot, storage audit,
              legacy cleanup dry-run, and anomaly tools.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Signed in as <span className="font-medium text-gray-700">{user.email ?? 'Unknown'}</span>
            </p>
          </div>

          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            This export is read-only operator context. It does not repair, delete, clean up, backfill,
            regenerate, or mutate any data.
          </div>

          <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-[1fr_160px_auto]">
              <div>
                <label htmlFor="person_id" className="block text-sm font-medium text-gray-700">
                  Person ID
                </label>
                <input
                  id="person_id"
                  type="text"
                  value={personId}
                  onChange={(event) => setPersonId(event.target.value)}
                  placeholder="Required person UUID..."
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="anomaly_limit" className="block text-sm font-medium text-gray-700">
                  Anomaly limit
                </label>
                <input
                  id="anomaly_limit"
                  type="number"
                  min={1}
                  max={100}
                  value={anomalyLimit}
                  onChange={(event) => setAnomalyLimit(event.target.value)}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load support case'}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              The browser calls only the read-only support case endpoint.
            </p>
          </form>

          {error && (
            <div
              role="alert"
              className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          {loading && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 shadow-sm">
              Loading planning/grocery support case...
            </div>
          )}

          {!loading && !supportCase && !error && (
            <EmptyState label="Enter a person_id to generate an internal support case export." />
          )}

          {supportCase && (
            <div className="space-y-6">
              <SummaryCards supportCase={supportCase} />
              {resultLabel && (
                <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-600 shadow-sm">
                  {resultLabel}
                </div>
              )}
              <DetailLinks supportCase={supportCase} />
              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Copyable Report</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Markdown-style internal support summary. It links to detailed admin pages instead of dumping raw blobs.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyReport}
                    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Copy report
                  </button>
                </div>
                {copyStatus && <p className="mb-3 text-sm text-gray-600">{copyStatus}</p>}
                <textarea
                  ref={reportTextAreaRef}
                  readOnly
                  value={supportCase.copyable_report_markdown}
                  className="h-72 w-full rounded-md border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-700"
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {supportCase.report_sections.map((section) => (
                  <SectionCard key={section.key} section={section} />
                ))}
              </div>
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
        destination: '/login?redirect=/admin/support/planning-grocery-support-case',
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

  return {
    props: {
      user,
      initialPersonId:
        typeof context.query.person_id === 'string' && context.query.person_id
          ? context.query.person_id
          : null,
      initialAnomalyLimit: parseLimit(context.query.anomaly_limit),
    },
  };
};
