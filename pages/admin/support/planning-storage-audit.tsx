/**
 * Admin Support: Planning Storage Audit
 *
 * Packet 61 read-only UI over the planning-storage audit endpoint. This page
 * does not query Supabase directly and does not expose cleanup or repair tools.
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
  PlanningStorageAudit,
  PlanningStorageAuditTableName,
  StorageAuditAnomaly,
  StorageSourceBucket,
  TableStorageAudit,
} from '@/lib/admin/planningStorageAuditService';

interface Props {
  user: AuthenticatedUser | null;
  initialPersonId: string | null;
  initialStorageSource: StorageSourceBucket | 'all';
  initialLimit: number;
}

type StorageSourceFilter = StorageSourceBucket | 'all';

const TABLE_LABELS: Record<PlanningStorageAuditTableName, string> = {
  reusable_plan_day_templates: 'Reusable day templates',
  reusable_plan_week_patterns: 'Reusable week patterns',
  pantry_on_hand_items: 'Pantry/on-hand items',
  grocery_ingredient_resolutions: 'Grocery ingredient resolutions',
};

function parseStorageSource(value: unknown): StorageSourceFilter {
  if (value === 'table_direct' || value === 'legacy_metadata' || value === 'unknown') {
    return value;
  }
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

function sourceClasses(source: StorageSourceBucket): string {
  if (source === 'legacy_metadata') return 'bg-amber-50 border-amber-200 text-amber-800';
  if (source === 'table_direct') return 'bg-emerald-50 border-emerald-200 text-emerald-800';
  return 'bg-gray-50 border-gray-200 text-gray-700';
}

function severityClasses(severity: StorageAuditAnomaly['severity']): string {
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

function TableAuditCard({ table }: { table: TableStorageAudit }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{TABLE_LABELS[table.table]}</h3>
          <div className="mt-1 font-mono text-xs text-gray-500">{table.table}</div>
        </div>
        <span className="rounded bg-white px-2 py-1 text-xs font-medium text-gray-700">
          {table.total_rows} rows
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-gray-500">table_direct</dt>
          <dd className="mt-1 font-semibold text-emerald-700">
            {table.storage_sources.table_direct}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">legacy_metadata</dt>
          <dd className="mt-1 font-semibold text-amber-700">
            {table.storage_sources.legacy_metadata}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">unknown</dt>
          <dd className="mt-1 font-semibold text-gray-700">{table.storage_sources.unknown}</dd>
        </div>
      </dl>
      <div className="mt-4 space-y-1 text-xs text-gray-600">
        <div>Distinct persons: {table.distinct_person_count}</div>
        <div>Rows with backfill timestamp: {table.legacy_metadata_backfilled_rows}</div>
        <div>
          Backfill range: {formatTimestamp(table.legacy_metadata_backfilled_at_range.oldest)} to{' '}
          {formatTimestamp(table.legacy_metadata_backfilled_at_range.newest)}
        </div>
        <div>
          Created range: {formatTimestamp(table.created_at_range.oldest)} to{' '}
          {formatTimestamp(table.created_at_range.newest)}
        </div>
        <div>
          Updated range: {formatTimestamp(table.updated_at_range.oldest)} to{' '}
          {formatTimestamp(table.updated_at_range.newest)}
        </div>
      </div>
    </div>
  );
}

function TableSummary({ audit }: { audit: PlanningStorageAudit }) {
  return (
    <Section
      title="Table Storage Summary"
      description="Aggregate storage-source and backfill ranges across authoritative migrated tables."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {Object.values(audit.tables).map((table) => (
          <TableAuditCard key={table.table} table={table} />
        ))}
      </div>
    </Section>
  );
}

function CleanupReadiness({ audit }: { audit: PlanningStorageAudit }) {
  const readiness = audit.cleanup_readiness;
  return (
    <Section
      title="Cleanup-Readiness Notes"
      description="Conservative audit notes only. This page does not decide or execute cleanup."
    >
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-2xl font-semibold text-gray-900">
            {readiness.legacy_backfilled_person_count}
          </div>
          <div className="text-sm text-gray-600">legacy-backed persons</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-2xl font-semibold text-gray-900">
            {readiness.table_direct_person_count}
          </div>
          <div className="text-sm text-gray-600">table-direct persons</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-2xl font-semibold text-gray-900">
            {readiness.unknown_storage_source_count}
          </div>
          <div className="text-sm text-gray-600">unknown storage-source rows</div>
        </div>
      </div>
      {readiness.notes.length === 0 ? (
        <EmptyState label="No cleanup-readiness notes." />
      ) : (
        <ul className="space-y-2">
          {readiness.notes.map((note, index) => (
            <li
              key={`${note}-${index}`}
              className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"
            >
              {note}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PersonRows({ audit }: { audit: PlanningStorageAudit }) {
  return (
    <Section
      title={`Person-Level Audit (${audit.persons.length})`}
      description="People with migrated rows, grouped by table and storage source."
    >
      {audit.persons.length === 0 ? (
        <EmptyState label="No person rows match the current audit filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-3">Person</th>
                <th className="py-2 pr-3">Rows</th>
                <th className="py-2 pr-3">Storage source</th>
                <th className="py-2 pr-3">Tables</th>
                <th className="py-2 pr-3">Latest backfill</th>
                <th className="py-2 pr-3">Flags</th>
              </tr>
            </thead>
            <tbody>
              {audit.persons.map((person) => (
                <tr key={person.person_id} className="border-t border-gray-100 align-top">
                  <td className="py-2 pr-3">
                    <div className="font-mono text-xs text-gray-900">{person.person_id}</div>
                    <Link
                      href={`/admin/support/planning-grocery?person_id=${person.person_id}`}
                      className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                    >
                      Open snapshot
                    </Link>
                  </td>
                  <td className="py-2 pr-3 font-semibold text-gray-900">
                    {person.total_migrated_rows}
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-700">
                    <div>table_direct {person.storage_sources.table_direct}</div>
                    <div>legacy_metadata {person.storage_sources.legacy_metadata}</div>
                    <div>unknown {person.storage_sources.unknown}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-700">
                    {Object.entries(person.tables).map(([table, count]) => (
                      <div key={table}>
                        {TABLE_LABELS[table as PlanningStorageAuditTableName]}: {count}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-600">
                    {formatTimestamp(person.latest_backfill_at)}
                  </td>
                  <td className="py-2 pr-3">
                    {person.warning_flags.length === 0 ? (
                      <span className="text-xs text-gray-400">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {person.warning_flags.map((flag) => (
                          <Badge key={flag} className="bg-amber-50 border-amber-200 text-amber-800">
                            {flag}
                          </Badge>
                        ))}
                      </div>
                    )}
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

function AnomalyRows({ audit }: { audit: PlanningStorageAudit }) {
  return (
    <Section
      title={`Anomalies (${audit.anomalies.length})`}
      description="Evidence-based flags derived from migrated table fields only."
    >
      {audit.anomalies.length === 0 ? (
        <EmptyState label="No anomalies match the current audit filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-3">Severity</th>
                <th className="py-2 pr-3">Code</th>
                <th className="py-2 pr-3">Table</th>
                <th className="py-2 pr-3">Person / row</th>
                <th className="py-2 pr-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {audit.anomalies.map((anomaly, index) => (
                <tr
                  key={`${anomaly.table}-${anomaly.row_id ?? 'none'}-${anomaly.code}-${index}`}
                  className="border-t border-gray-100 align-top"
                >
                  <td className="py-2 pr-3">
                    <Badge className={severityClasses(anomaly.severity)}>{anomaly.severity}</Badge>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-gray-800">{anomaly.code}</td>
                  <td className="py-2 pr-3 text-xs text-gray-700">{anomaly.table}</td>
                  <td className="py-2 pr-3 text-xs text-gray-700">
                    <div>person {shortId(anomaly.person_id)}</div>
                    <div>row {shortId(anomaly.row_id)}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-800">{anomaly.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export default function PlanningStorageAuditPage({
  user,
  initialPersonId,
  initialStorageSource,
  initialLimit,
}: Props) {
  const router = useRouter();
  const [personId, setPersonId] = useState(initialPersonId ?? '');
  const [storageSource, setStorageSource] = useState<StorageSourceFilter>(initialStorageSource);
  const [limit, setLimit] = useState(String(initialLimit));
  const [audit, setAudit] = useState<PlanningStorageAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoLoadedKeyRef = useRef<string | null>(null);

  const currentQuery = useMemo(() => {
    const query = router.query;
    return {
      person_id: typeof query.person_id === 'string' ? query.person_id : initialPersonId ?? '',
      storage_source: parseStorageSource(query.storage_source ?? initialStorageSource),
      limit: typeof query.limit === 'string' ? query.limit : String(initialLimit),
    };
  }, [initialLimit, initialPersonId, initialStorageSource, router.query]);

  const queryKey = `${currentQuery.person_id}|${currentQuery.storage_source}|${currentQuery.limit}`;

  const loadAudit = useCallback(
    async (options: {
      personId: string;
      storageSource: StorageSourceFilter;
      limit: string;
      syncUrl?: boolean;
    }) => {
      const normalizedLimit = parseLimit(options.limit);
      const params = new URLSearchParams();
      if (options.personId.trim()) params.set('person_id', options.personId.trim());
      if (options.storageSource !== 'all') params.set('storage_source', options.storageSource);
      params.set('limit', String(normalizedLimit));

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/support/planning-storage-audit?${params.toString()}`);
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? 'Failed to load planning storage audit.');
        }
        setAudit(body as PlanningStorageAudit);

        if (options.syncUrl) {
          const nextQuery: Record<string, string> = { limit: String(normalizedLimit) };
          if (options.personId.trim()) nextQuery.person_id = options.personId.trim();
          if (options.storageSource !== 'all') nextQuery.storage_source = options.storageSource;
          autoLoadedKeyRef.current = `${nextQuery.person_id ?? ''}|${options.storageSource}|${normalizedLimit}`;
          void router.replace(
            {
              pathname: router.pathname,
              query: nextQuery,
            },
            undefined,
            { shallow: true },
          );
        }
      } catch (err) {
        setAudit(null);
        setError(err instanceof Error ? err.message : 'Failed to load planning storage audit.');
      } finally {
        setLoading(false);
      }
    },
    [router.pathname, router.replace],
  );

  useEffect(() => {
    if (autoLoadedKeyRef.current === queryKey) return;
    autoLoadedKeyRef.current = queryKey;
    setPersonId(currentQuery.person_id);
    setStorageSource(currentQuery.storage_source);
    setLimit(currentQuery.limit);
    void loadAudit({
      personId: currentQuery.person_id,
      storageSource: currentQuery.storage_source,
      limit: currentQuery.limit,
      syncUrl: false,
    });
  }, [currentQuery.limit, currentQuery.person_id, currentQuery.storage_source, loadAudit, queryKey]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadAudit({ personId, storageSource, limit, syncUrl: true });
  }

  const totals = useMemo(() => {
    if (!audit) return null;
    return Object.values(audit.tables).reduce(
      (acc, table) => {
        acc.total += table.total_rows;
        acc.table_direct += table.storage_sources.table_direct;
        acc.legacy_metadata += table.storage_sources.legacy_metadata;
        acc.unknown += table.storage_sources.unknown;
        return acc;
      },
      { total: 0, table_direct: 0, legacy_metadata: 0, unknown: 0 },
    );
  }, [audit]);

  if (!user || user.role !== 'admin') {
    return (
      <>
        <Head>
          <title>Planning Storage Audit · Fine Diet Admin</title>
        </Head>
        <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
          <div className="max-w-md text-center">
            <h1 className="mb-4 text-3xl font-bold text-gray-900">Access Denied</h1>
            <p className="mb-8 text-lg text-gray-600">
              Only administrators can inspect planning storage audits.
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
        <title>Planning Storage Audit · Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-12">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link href="/admin" className="mb-4 inline-flex text-sm text-gray-600 hover:text-gray-900">
              Back to Admin Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Planning Storage Audit</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Read-only aggregate audit over migrated planning and grocery storage-source fields.
              This page does not expose cleanup, repair, backfill, or mutation actions.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Signed in as <span className="font-medium text-gray-700">{user.email ?? 'Unknown'}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-[1fr_220px_140px_auto]">
              <div>
                <label htmlFor="person_id" className="block text-sm font-medium text-gray-700">
                  Person ID filter
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
                <label htmlFor="storage_source" className="block text-sm font-medium text-gray-700">
                  Storage source
                </label>
                <select
                  id="storage_source"
                  value={storageSource}
                  onChange={(event) => setStorageSource(parseStorageSource(event.target.value))}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All</option>
                  <option value="table_direct">table_direct</option>
                  <option value="legacy_metadata">legacy_metadata</option>
                  <option value="unknown">unknown</option>
                </select>
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
                  {loading ? 'Loading...' : 'Load audit'}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              The browser calls only the read-only planning storage audit endpoint.
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
              Loading planning storage audit...
            </div>
          )}

          {audit && (
            <div className="space-y-6">
              {totals && (
                <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm md:grid-cols-5">
                  <div><span className="font-semibold">{totals.total}</span> total rows</div>
                  <div><span className="font-semibold">{totals.table_direct}</span> table_direct</div>
                  <div><span className="font-semibold">{totals.legacy_metadata}</span> legacy_metadata</div>
                  <div><span className="font-semibold">{totals.unknown}</span> unknown</div>
                  <div><span className="font-semibold">{audit.anomalies.length}</span> anomalies shown</div>
                </div>
              )}
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-600 shadow-sm">
                Generated {formatTimestamp(audit.generated_at)} · Filter person{' '}
                {audit.filters.person_id ?? 'all'} · source {audit.filters.storage_source} · limit{' '}
                {audit.filters.limit}
              </div>
              <TableSummary audit={audit} />
              <CleanupReadiness audit={audit} />
              <PersonRows audit={audit} />
              <AnomalyRows audit={audit} />
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
        destination: '/login?redirect=/admin/support/planning-storage-audit',
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
      initialStorageSource: parseStorageSource(context.query.storage_source),
      initialLimit: parseLimit(context.query.limit),
    },
  };
};
