/**
 * Admin Support: Planning/Grocery Anomalies
 *
 * Packet 63 read-only UI over the planning/grocery anomaly endpoint. This page
 * does not query Supabase directly and does not expose repair or cleanup tools.
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
  PlanningGroceryAnomaly,
  PlanningGroceryAnomalyCategory,
  PlanningGroceryAnomalyReport,
  PlanningGroceryAnomalySeverity,
} from '@/lib/admin/planningGroceryAnomalyService';

interface Props {
  user: AuthenticatedUser | null;
  initialPersonId: string | null;
  initialCategory: CategoryFilter;
  initialSeverity: SeverityFilter;
  initialCode: string | null;
  initialLimit: number;
}

type CategoryFilter = PlanningGroceryAnomalyCategory | 'all';
type SeverityFilter = PlanningGroceryAnomalySeverity | 'all';

const CATEGORY_LABELS: Record<PlanningGroceryAnomalyCategory, string> = {
  reusable_planning: 'Reusable planning',
  grocery_state: 'Grocery state',
  active_planning: 'Active planning',
  grocery_lists: 'Grocery lists',
  storage_provenance: 'Storage provenance',
  legacy_cleanup_readiness: 'Legacy cleanup readiness',
};

const CATEGORY_OPTIONS: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: 'All categories' },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
    value: value as PlanningGroceryAnomalyCategory,
    label,
  })),
];

const SEVERITY_OPTIONS: Array<{ value: SeverityFilter; label: string }> = [
  { value: 'all', label: 'All severities' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'high', label: 'High' },
];

function parseCategory(value: unknown): CategoryFilter {
  if (
    value === 'reusable_planning' ||
    value === 'grocery_state' ||
    value === 'active_planning' ||
    value === 'grocery_lists' ||
    value === 'storage_provenance' ||
    value === 'legacy_cleanup_readiness'
  ) {
    return value;
  }
  return 'all';
}

function parseSeverity(value: unknown): SeverityFilter {
  if (value === 'info' || value === 'warning' || value === 'high') return value;
  return 'all';
}

function parseLimit(value: unknown): number {
  if (typeof value !== 'string') return 100;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.floor(parsed), 1), 500);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function shortId(value: string | null | undefined): string {
  if (!value) return '-';
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function severityClasses(severity: PlanningGroceryAnomalySeverity): string {
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

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
      {label}
    </div>
  );
}

function SummaryCards({ report }: { report: PlanningGroceryAnomalyReport }) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-gray-500">Anomalies</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{report.summary.anomaly_count}</div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-gray-500">Persons</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{report.summary.person_count}</div>
      </div>
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-red-700">High</div>
        <div className="mt-1 text-2xl font-bold text-red-900">{report.summary.by_severity.high}</div>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-amber-700">Warning</div>
        <div className="mt-1 text-2xl font-bold text-amber-900">{report.summary.by_severity.warning}</div>
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-blue-700">Info</div>
        <div className="mt-1 text-2xl font-bold text-blue-900">{report.summary.by_severity.info}</div>
      </div>
    </div>
  );
}

function CategorySummary({ report }: { report: PlanningGroceryAnomalyReport }) {
  return (
    <Section
      title="Category and Code Counts"
      description="Counts are based on the currently applied filters and limit."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">By category</h3>
          <div className="space-y-2 text-sm">
            {Object.entries(report.summary.by_category).map(([category, count]) => (
              <div key={category} className="flex justify-between rounded bg-gray-50 px-3 py-2">
                <span>{CATEGORY_LABELS[category as PlanningGroceryAnomalyCategory]}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">By code</h3>
          {Object.keys(report.summary.by_code).length === 0 ? (
            <EmptyState label="No anomaly codes in the current result set." />
          ) : (
            <div className="max-h-64 space-y-2 overflow-auto text-sm">
              {Object.entries(report.summary.by_code).map(([code, count]) => (
                <div key={code} className="flex justify-between gap-3 rounded bg-gray-50 px-3 py-2">
                  <span className="font-mono text-xs text-gray-700">{code}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function PersonRows({ report }: { report: PlanningGroceryAnomalyReport }) {
  return (
    <Section
      title="Persons to Review"
      description="Sorted by highest severity, then anomaly count."
    >
      {report.persons.length === 0 ? (
        <EmptyState label="No persons have anomalies in the current result set." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Highest</th>
                <th className="px-3 py-2">Severity counts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.persons.map((person) => (
                <tr key={person.person_id}>
                  <td className="px-3 py-2 font-mono text-xs">{person.person_id}</td>
                  <td className="px-3 py-2">{person.anomaly_count}</td>
                  <td className="px-3 py-2">
                    <Badge className={severityClasses(person.highest_severity)}>
                      {person.highest_severity}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    high={person.by_severity.high}, warning={person.by_severity.warning}, info={person.by_severity.info}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function AnomalyEvidence({ anomaly }: { anomaly: PlanningGroceryAnomaly }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-gray-600">
      {anomaly.evidence.map((entry, index) => (
        <li key={`${anomaly.id}-evidence-${index}`}>{entry}</li>
      ))}
    </ul>
  );
}

function AnomalyRows({ report }: { report: PlanningGroceryAnomalyReport }) {
  return (
    <Section
      title="Anomalies"
      description="Every row is evidence for support review only. No action on this page mutates data."
    >
      {report.anomalies.length === 0 ? (
        <EmptyState label="No anomalies match the current filters." />
      ) : (
        <div className="space-y-3">
          {report.anomalies.map((anomaly) => (
            <article key={anomaly.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={severityClasses(anomaly.severity)}>{anomaly.severity}</Badge>
                    <Badge className="border-gray-200 bg-white text-gray-700">
                      {CATEGORY_LABELS[anomaly.category]}
                    </Badge>
                    <span className="font-mono text-xs text-gray-500">{anomaly.code}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">{anomaly.title}</h3>
                  <p className="mt-1 text-sm text-gray-700">{anomaly.message}</p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>Person: {shortId(anomaly.person_id)}</div>
                  <div>Table: {anomaly.related_table ?? '-'}</div>
                  <div>Row: {shortId(anomaly.related_row_id)}</div>
                </div>
              </div>
              <AnomalyEvidence anomaly={anomaly} />
              {anomaly.suggested_operator_action && (
                <p className="mt-3 rounded border border-gray-200 bg-white p-2 text-xs text-gray-600">
                  Operator context: {anomaly.suggested_operator_action}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

export default function PlanningGroceryAnomaliesPage({
  user,
  initialPersonId,
  initialCategory,
  initialSeverity,
  initialCode,
  initialLimit,
}: Props) {
  const router = useRouter();
  const [personId, setPersonId] = useState(initialPersonId ?? '');
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  const [severity, setSeverity] = useState<SeverityFilter>(initialSeverity);
  const [code, setCode] = useState(initialCode ?? '');
  const [limit, setLimit] = useState(String(initialLimit));
  const [report, setReport] = useState<PlanningGroceryAnomalyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedInitialRef = useRef(false);

  const loadReport = useCallback(
    async (options?: { syncUrl?: boolean }) => {
      const trimmedPersonId = personId.trim();
      const trimmedCode = code.trim();
      const parsedLimit = parseLimit(limit);
      const params = new URLSearchParams();
      if (trimmedPersonId) params.set('person_id', trimmedPersonId);
      if (category !== 'all') params.set('category', category);
      if (severity !== 'all') params.set('severity', severity);
      if (trimmedCode) params.set('code', trimmedCode);
      params.set('limit', String(parsedLimit));

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/support/planning-grocery-anomalies?${params}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load planning/grocery anomalies');
        }
        setReport(data as PlanningGroceryAnomalyReport);
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
        setReport(null);
        setError(err instanceof Error ? err.message : 'Failed to load planning/grocery anomalies');
      } finally {
        setLoading(false);
      }
    },
    [category, code, limit, personId, router],
  );

  useEffect(() => {
    if (loadedInitialRef.current) return;
    loadedInitialRef.current = true;
    void loadReport({ syncUrl: false });
  }, [loadReport]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadReport({ syncUrl: true });
  }

  const resultLabel = useMemo(() => {
    if (!report) return null;
    return `Generated ${formatTimestamp(report.generated_at)} · person ${
      report.filters_applied.person_id ?? 'all'
    } · category ${report.filters_applied.category} · severity ${
      report.filters_applied.severity
    } · code ${report.filters_applied.code ?? 'all'} · limit ${report.filters_applied.limit}`;
  }, [report]);

  if (!user || user.role !== 'admin') {
    return (
      <>
        <Head>
          <title>Planning/Grocery Anomalies · Fine Diet Admin</title>
        </Head>
        <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
          <div className="max-w-md text-center">
            <h1 className="mb-4 text-3xl font-bold text-gray-900">Access Denied</h1>
            <p className="mb-8 text-lg text-gray-600">
              Only administrators can inspect planning/grocery anomaly reports.
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
        <title>Planning/Grocery Anomalies · Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-12">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link href="/admin" className="mb-4 inline-flex text-sm text-gray-600 hover:text-gray-900">
              Back to Admin Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Planning/Grocery Anomalies</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Read-only anomaly detection for planning, reusable templates, pantry state, grocery lists,
              storage provenance, and legacy cleanup-readiness review. This page provides visibility only.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Signed in as <span className="font-medium text-gray-700">{user.email ?? 'Unknown'}</span>
            </p>
          </div>

          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            This tool does not repair, delete, clean up, backfill, regenerate, or mutate any data. Findings are
            conservative review prompts for operators.
          </div>

          <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-[1fr_220px_180px_180px_120px_auto]">
              <div>
                <label htmlFor="person_id" className="block text-sm font-medium text-gray-700">
                  Person ID
                </label>
                <input
                  id="person_id"
                  type="text"
                  value={personId}
                  onChange={(event) => setPersonId(event.target.value)}
                  placeholder="Optional person UUID..."
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700">
                  Category
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(event) => setCategory(parseCategory(event.target.value))}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="severity" className="block text-sm font-medium text-gray-700">
                  Severity
                </label>
                <select
                  id="severity"
                  value={severity}
                  onChange={(event) => setSeverity(parseSeverity(event.target.value))}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {SEVERITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700">
                  Code
                </label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Optional exact code..."
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="limit" className="block text-sm font-medium text-gray-700">
                  Limit
                </label>
                <input
                  id="limit"
                  type="number"
                  min={1}
                  max={500}
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load report'}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              The browser calls only the read-only planning/grocery anomalies endpoint.
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
              Loading planning/grocery anomaly report...
            </div>
          )}

          {report && (
            <div className="space-y-6">
              <SummaryCards report={report} />
              {resultLabel && (
                <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-600 shadow-sm">
                  {resultLabel}
                </div>
              )}
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-600 shadow-sm">
                {report.summary.notes.map((note) => (
                  <div key={note}>{note}</div>
                ))}
              </div>
              <CategorySummary report={report} />
              <PersonRows report={report} />
              <AnomalyRows report={report} />
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
        destination: '/login?redirect=/admin/support/planning-grocery-anomalies',
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
      initialCategory: parseCategory(context.query.category),
      initialSeverity: parseSeverity(context.query.severity),
      initialCode:
        typeof context.query.code === 'string' && context.query.code ? context.query.code : null,
      initialLimit: parseLimit(context.query.limit),
    },
  };
};
