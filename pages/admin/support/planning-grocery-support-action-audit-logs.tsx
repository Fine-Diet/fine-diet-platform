/**
 * Admin Support: Planning/Grocery Support Action Audit Logs
 *
 * Packet 66 read-only UI for inspecting future support-action audit records.
 * This page does not execute, approve, retry, or apply support actions.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type { PlanningGrocerySupportActionRisk } from '@/lib/admin/planningGrocerySupportActionPolicy';
import type {
  PlanningGrocerySupportActionAuditLog,
  PlanningGrocerySupportActionAuditLogReport,
  PlanningGrocerySupportActionAuditResult,
} from '@/lib/admin/planningGrocerySupportActionAuditTypes';

interface Props {
  user: AuthenticatedUser | null;
  initialFilters: {
    target_person_id: string | null;
    actor_user_id: string | null;
    action_name: string | null;
    risk_level: RiskFilter;
    result: ResultFilter;
    from: string | null;
    to: string | null;
    limit: number;
  };
}

type RiskFilter = PlanningGrocerySupportActionRisk | 'all';
type ResultFilter = PlanningGrocerySupportActionAuditResult | 'all';

const RISK_OPTIONS: RiskFilter[] = [
  'all',
  'read_only',
  'low_mutation',
  'moderate_mutation',
  'high_risk',
  'prohibited',
];

const RESULT_OPTIONS: ResultFilter[] = [
  'all',
  'requested',
  'dry_run',
  'approved',
  'applied',
  'failed',
  'rejected',
  'cancelled',
];

function parseLimit(value: unknown): number {
  if (typeof value !== 'string') return 100;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.floor(parsed), 1), 500);
}

function parseRisk(value: unknown): RiskFilter {
  return RISK_OPTIONS.includes(value as RiskFilter) ? (value as RiskFilter) : 'all';
}

function parseResult(value: unknown): ResultFilter {
  return RESULT_OPTIONS.includes(value as ResultFilter) ? (value as ResultFilter) : 'all';
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

function riskClasses(risk: string): string {
  if (risk === 'high_risk' || risk === 'prohibited') return 'bg-red-50 border-red-200 text-red-800';
  if (risk === 'moderate_mutation') return 'bg-amber-50 border-amber-200 text-amber-800';
  if (risk === 'low_mutation') return 'bg-yellow-50 border-yellow-200 text-yellow-800';
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

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-60 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function SummaryCards({ report }: { report: PlanningGrocerySupportActionAuditLogReport }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-gray-500">Rows Returned</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{report.summary.total_returned}</div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-gray-500">Latest Record</div>
        <div className="mt-1 text-sm font-semibold text-gray-900">
          {formatTimestamp(report.summary.latest_created_at)}
        </div>
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-blue-700">Results</div>
        <div className="mt-1 text-xs text-blue-900">
          {Object.entries(report.summary.by_result).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}
        </div>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-amber-700">Risk Levels</div>
        <div className="mt-1 text-xs text-amber-900">
          {Object.entries(report.summary.by_risk_level).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}
        </div>
      </div>
    </div>
  );
}

function AuditLogDetails({ log }: { log: PlanningGrocerySupportActionAuditLog }) {
  return (
    <details className="rounded border border-gray-200 bg-gray-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-gray-800">
        Evidence, approval, and redacted payload
      </summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Request payload redacted
          </h4>
          <JsonBlock value={log.request_payload_redacted} />
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Before evidence
          </h4>
          <JsonBlock value={log.before_evidence} />
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            After evidence
          </h4>
          <JsonBlock value={log.after_evidence} />
        </div>
        <div className="space-y-1 text-sm text-gray-700">
          <div>Failure reason: {log.failure_reason ?? '-'}</div>
          <div>Approval actor: {shortId(log.approval_actor_user_id)}</div>
          <div>Approval note: {log.approval_note ?? '-'}</div>
          <div>Dry-run id: {log.dry_run_id ?? '-'}</div>
          <div>Correlation id: {log.correlation_id ?? '-'}</div>
          <div>Idempotency key: {log.idempotency_key ?? '-'}</div>
        </div>
      </div>
    </details>
  );
}

function AuditLogRows({ report }: { report: PlanningGrocerySupportActionAuditLogReport }) {
  if (report.audit_logs.length === 0) {
    return <EmptyState label="No support action audit-log records match the current filters." />;
  }

  return (
    <div className="space-y-3">
      {report.audit_logs.map((log) => (
        <article key={log.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={riskClasses(log.risk_level)}>{log.risk_level}</Badge>
                <Badge className="border-gray-200 bg-gray-50 text-gray-700">{log.result}</Badge>
                <span className="font-mono text-xs text-gray-500">{log.action_category}</span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">{log.action_name}</h3>
              <p className="mt-1 text-xs text-gray-500">
                Created {formatTimestamp(log.created_at)} · Policy {log.policy_version}
              </p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>Actor: {shortId(log.actor_user_id)} ({log.actor_role})</div>
              <div>Target person: {shortId(log.target_person_id)}</div>
              <div>Target table: {log.target_table ?? '-'}</div>
              <div>Target rows: {log.target_row_ids.length}</div>
            </div>
          </div>
          <div className="mt-3">
            <AuditLogDetails log={log} />
          </div>
        </article>
      ))}
    </div>
  );
}

export default function PlanningGrocerySupportActionAuditLogsPage({
  user,
  initialFilters,
}: Props) {
  const router = useRouter();
  const [targetPersonId, setTargetPersonId] = useState(initialFilters.target_person_id ?? '');
  const [actorUserId, setActorUserId] = useState(initialFilters.actor_user_id ?? '');
  const [actionName, setActionName] = useState(initialFilters.action_name ?? '');
  const [riskLevel, setRiskLevel] = useState<RiskFilter>(initialFilters.risk_level);
  const [result, setResult] = useState<ResultFilter>(initialFilters.result);
  const [from, setFrom] = useState(initialFilters.from ?? '');
  const [to, setTo] = useState(initialFilters.to ?? '');
  const [limit, setLimit] = useState(String(initialFilters.limit));
  const [report, setReport] = useState<PlanningGrocerySupportActionAuditLogReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedInitialRef = useRef(false);

  const loadReport = useCallback(
    async (options?: { syncUrl?: boolean }) => {
      const params = new URLSearchParams();
      if (targetPersonId.trim()) params.set('target_person_id', targetPersonId.trim());
      if (actorUserId.trim()) params.set('actor_user_id', actorUserId.trim());
      if (actionName.trim()) params.set('action_name', actionName.trim());
      if (riskLevel !== 'all') params.set('risk_level', riskLevel);
      if (result !== 'all') params.set('result', result);
      if (from.trim()) params.set('from', from.trim());
      if (to.trim()) params.set('to', to.trim());
      params.set('limit', String(parseLimit(limit)));

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/support/planning-grocery-support-action-audit-logs?${params}`,
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load support action audit logs');
        }
        setReport(data as PlanningGrocerySupportActionAuditLogReport);
        if (options?.syncUrl) {
          await router.replace(
            { pathname: router.pathname, query: Object.fromEntries(params.entries()) },
            undefined,
            { shallow: true },
          );
        }
      } catch (err) {
        setReport(null);
        setError(err instanceof Error ? err.message : 'Failed to load support action audit logs');
      } finally {
        setLoading(false);
      }
    },
    [actionName, actorUserId, from, limit, result, riskLevel, router, targetPersonId, to],
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

  if (!user || user.role !== 'admin') {
    return (
      <>
        <Head>
          <title>Support Action Audit Logs · Fine Diet Admin</title>
        </Head>
        <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
          <div className="max-w-md text-center">
            <h1 className="mb-4 text-3xl font-bold text-gray-900">Access Denied</h1>
            <p className="mb-8 text-lg text-gray-600">
              Only administrators can inspect support action audit logs.
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
        <title>Support Action Audit Logs · Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-12">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link href="/admin" className="mb-4 inline-flex text-sm text-gray-600 hover:text-gray-900">
              Back to Admin Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Support Action Audit Logs</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Read-only inspection of future planning/grocery support-action audit records.
              This page is accountability infrastructure only.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Signed in as <span className="font-medium text-gray-700">{user.email ?? 'Unknown'}</span>
            </p>
          </div>

          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            This page does not execute, approve, retry, apply, clean up, repair, backfill,
            regenerate, delete, or mutate anything. It only reads audit-log records.
          </div>

          <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              <div>
                <label htmlFor="target_person_id" className="block text-sm font-medium text-gray-700">
                  Target person
                </label>
                <input
                  id="target_person_id"
                  type="text"
                  value={targetPersonId}
                  onChange={(event) => setTargetPersonId(event.target.value)}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                />
              </div>
              <div>
                <label htmlFor="actor_user_id" className="block text-sm font-medium text-gray-700">
                  Actor user
                </label>
                <input
                  id="actor_user_id"
                  type="text"
                  value={actorUserId}
                  onChange={(event) => setActorUserId(event.target.value)}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                />
              </div>
              <div>
                <label htmlFor="action_name" className="block text-sm font-medium text-gray-700">
                  Action name
                </label>
                <input
                  id="action_name"
                  type="text"
                  value={actionName}
                  onChange={(event) => setActionName(event.target.value)}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                />
              </div>
              <div>
                <label htmlFor="risk_level" className="block text-sm font-medium text-gray-700">
                  Risk
                </label>
                <select
                  id="risk_level"
                  value={riskLevel}
                  onChange={(event) => setRiskLevel(parseRisk(event.target.value))}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                >
                  {RISK_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="result" className="block text-sm font-medium text-gray-700">
                  Result
                </label>
                <select
                  id="result"
                  value={result}
                  onChange={(event) => setResult(parseResult(event.target.value))}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                >
                  {RESULT_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="from" className="block text-sm font-medium text-gray-700">
                  From
                </label>
                <input
                  id="from"
                  type="text"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  placeholder="ISO timestamp"
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                />
              </div>
              <div>
                <label htmlFor="to" className="block text-sm font-medium text-gray-700">
                  To
                </label>
                <input
                  id="to"
                  type="text"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  placeholder="ISO timestamp"
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
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
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load audit logs'}
              </button>
            </div>
          </form>

          {error && (
            <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {loading && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 shadow-sm">
              Loading support action audit logs...
            </div>
          )}

          {report && (
            <div className="space-y-6">
              <SummaryCards report={report} />
              {report.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {report.warnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              )}
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-600 shadow-sm">
                Generated {formatTimestamp(report.generated_at)} · limit {report.filters_applied.limit}
              </div>
              <AuditLogRows report={report} />
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
        destination: '/login?redirect=/admin/support/planning-grocery-support-action-audit-logs',
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
      initialFilters: {
        target_person_id:
          typeof context.query.target_person_id === 'string' ? context.query.target_person_id : null,
        actor_user_id:
          typeof context.query.actor_user_id === 'string' ? context.query.actor_user_id : null,
        action_name:
          typeof context.query.action_name === 'string' ? context.query.action_name : null,
        risk_level: parseRisk(context.query.risk_level),
        result: parseResult(context.query.result),
        from: typeof context.query.from === 'string' ? context.query.from : null,
        to: typeof context.query.to === 'string' ? context.query.to : null,
        limit: parseLimit(context.query.limit),
      },
    },
  };
};
