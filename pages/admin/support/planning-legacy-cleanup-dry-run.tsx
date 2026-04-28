/**
 * Admin Support: Planning Legacy Cleanup Dry-Run
 *
 * Packet 62 read-only UI over the legacy cleanup-readiness dry-run endpoint.
 * This page does not query Supabase directly and exposes no cleanup controls.
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
  LegacyCleanupClassification,
  LegacyPlanningMetadataKey,
  PlanningLegacyCleanupDryRun,
} from '@/lib/admin/planningLegacyCleanupReadinessService';

interface Props {
  user: AuthenticatedUser | null;
  initialPersonId: string | null;
  initialMetadataKey: LegacyPlanningMetadataKey | 'all';
  initialClassification: LegacyCleanupClassification | 'all';
  initialLimit: number;
}

type MetadataKeyFilter = LegacyPlanningMetadataKey | 'all';
type ClassificationFilter = LegacyCleanupClassification | 'all';

const METADATA_KEY_LABELS: Record<LegacyPlanningMetadataKey, string> = {
  plan_day_templates: 'Day templates',
  plan_week_patterns: 'Week patterns',
  pantry_on_hand_items: 'Pantry/on-hand items',
  grocery_ingredient_resolutions: 'Ingredient resolutions',
};

function parseMetadataKey(value: unknown): MetadataKeyFilter {
  if (
    value === 'plan_day_templates' ||
    value === 'plan_week_patterns' ||
    value === 'pantry_on_hand_items' ||
    value === 'grocery_ingredient_resolutions'
  ) {
    return value;
  }
  return 'all';
}

function parseClassification(value: unknown): ClassificationFilter {
  if (
    value === 'cleanup_candidate' ||
    value === 'review_required' ||
    value === 'malformed_legacy' ||
    value === 'unmatched_legacy' ||
    value === 'table_conflict'
  ) {
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

function classificationClasses(classification: LegacyCleanupClassification): string {
  if (classification === 'cleanup_candidate') return 'bg-emerald-50 border-emerald-200 text-emerald-800';
  if (classification === 'table_conflict') return 'bg-red-50 border-red-200 text-red-800';
  if (classification === 'unmatched_legacy' || classification === 'malformed_legacy') {
    return 'bg-amber-50 border-amber-200 text-amber-800';
  }
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

function SummaryCards({ dryRun }: { dryRun: PlanningLegacyCleanupDryRun }) {
  const summary = dryRun.summary;
  const cards = [
    ['People with legacy metadata', summary.person_count_with_legacy_metadata],
    ['Legacy records', summary.legacy_record_count],
    ['Cleanup candidates', summary.cleanup_candidate_count],
    ['Review required', summary.review_required_count],
    ['Malformed legacy', summary.malformed_legacy_count],
    ['Unmatched legacy', summary.unmatched_legacy_count],
    ['Table conflicts', summary.table_conflict_count],
  ] as const;

  return (
    <Section
      title="Dry-Run Summary"
      description="Candidate buckets for future review only. No cleanup action is available here."
    >
      <div className="grid gap-3 md:grid-cols-4">
        {cards.map(([label, count]) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="text-2xl font-semibold text-gray-900">{count}</div>
            <div className="text-sm text-gray-600">{label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Dry-run only. Cleanup candidates are not cleanup approvals and no metadata is changed.
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-gray-900">Inspected metadata keys</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {dryRun.inspected_metadata_keys.map((key) => (
            <Badge key={key} className="bg-gray-50 border-gray-200 text-gray-700">
              {key}
            </Badge>
          ))}
        </div>
      </div>
    </Section>
  );
}

function NotesAndReasons({ dryRun }: { dryRun: PlanningLegacyCleanupDryRun }) {
  const reasons = Object.entries(dryRun.review_reasons);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Dry-Run Notes" description="Policy guardrails included in the dry-run output.">
        <ul className="space-y-2">
          {[...dryRun.summary.notes, ...dryRun.non_goals].map((note, index) => (
            <li
              key={`${note}-${index}`}
              className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"
            >
              {note}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Review Reasons" description="Top reasons records need human review before any future cleanup policy.">
        {reasons.length === 0 ? (
          <EmptyState label="No review reasons in the current filter." />
        ) : (
          <div className="space-y-2">
            {reasons.map(([reason, count]) => (
              <div key={reason} className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-800">{reason}</span>
                <span className="font-semibold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function PersonRows({ dryRun }: { dryRun: PlanningLegacyCleanupDryRun }) {
  return (
    <Section title={`Person Readiness (${dryRun.persons.length})`} description="Person-level counts by metadata key and dry-run classification.">
      {dryRun.persons.length === 0 ? (
        <EmptyState label="No person readiness rows match the current filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-3">Person</th>
                <th className="py-2 pr-3">Records</th>
                <th className="py-2 pr-3">Metadata keys</th>
                <th className="py-2 pr-3">Classifications</th>
                <th className="py-2 pr-3">Review</th>
              </tr>
            </thead>
            <tbody>
              {dryRun.persons.map((person) => (
                <tr key={person.person_id} className="border-t border-gray-100 align-top">
                  <td className="py-2 pr-3">
                    <div className="font-mono text-xs text-gray-900">{person.person_id}</div>
                    <Link
                      href={`/admin/support/planning-grocery?person_id=${person.person_id}`}
                      className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                    >
                      Open support snapshot
                    </Link>
                  </td>
                  <td className="py-2 pr-3 font-semibold text-gray-900">{person.legacy_record_count}</td>
                  <td className="py-2 pr-3 text-xs text-gray-700">
                    {person.metadata_keys_present.map((key) => (
                      <div key={key}>
                        {key}: {person.counts_by_metadata_key[key]}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-700">
                    {Object.entries(person.counts_by_classification).map(([classification, count]) => (
                      <div key={classification}>
                        {classification}: {count}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 pr-3">
                    {person.needs_review ? (
                      <div className="flex flex-wrap gap-1">
                        {person.review_reasons.map((reason) => (
                          <Badge key={reason} className="bg-amber-50 border-amber-200 text-amber-800">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Badge className="bg-emerald-50 border-emerald-200 text-emerald-800">
                        no review flags
                      </Badge>
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

function RecordRows({ dryRun }: { dryRun: PlanningLegacyCleanupDryRun }) {
  return (
    <Section title={`Record Dry-Run Rows (${dryRun.records.length})`} description="Record-level evidence without raw metadata blobs.">
      {dryRun.records.length === 0 ? (
        <EmptyState label="No dry-run records match the current filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-3">Classification</th>
                <th className="py-2 pr-3">Legacy record</th>
                <th className="py-2 pr-3">Table match</th>
                <th className="py-2 pr-3">Evidence</th>
                <th className="py-2 pr-3">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {dryRun.records.map((record, index) => (
                <tr
                  key={`${record.person_id}-${record.metadata_key}-${record.legacy_identifier ?? index}`}
                  className="border-t border-gray-100 align-top"
                >
                  <td className="py-2 pr-3">
                    <Badge className={classificationClasses(record.classification)}>
                      {record.classification}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-700">
                    <div>{record.metadata_key}</div>
                    <div className="font-mono">{record.legacy_identifier ?? '-'}</div>
                    <div>person {shortId(record.person_id)}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-700">
                    <div>{record.matching_table ?? '-'}</div>
                    <div className="font-mono">{record.matching_table_row_id ?? '-'}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-700">
                    <ul className="list-inside list-disc">
                      {record.evidence.map((entry, evidenceIndex) => (
                        <li key={`${entry}-${evidenceIndex}`}>{entry}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-700">
                    {record.warnings.length === 0 ? (
                      <span className="text-gray-400">None</span>
                    ) : (
                      <ul className="list-inside list-disc">
                        {record.warnings.map((warning, warningIndex) => (
                          <li key={`${warning}-${warningIndex}`}>{warning}</li>
                        ))}
                      </ul>
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

export default function PlanningLegacyCleanupDryRunPage({
  user,
  initialPersonId,
  initialMetadataKey,
  initialClassification,
  initialLimit,
}: Props) {
  const router = useRouter();
  const [personId, setPersonId] = useState(initialPersonId ?? '');
  const [metadataKey, setMetadataKey] = useState<MetadataKeyFilter>(initialMetadataKey);
  const [classification, setClassification] = useState<ClassificationFilter>(initialClassification);
  const [limit, setLimit] = useState(String(initialLimit));
  const [dryRun, setDryRun] = useState<PlanningLegacyCleanupDryRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoLoadedKeyRef = useRef<string | null>(null);

  const currentQuery = useMemo(() => {
    const query = router.query;
    return {
      person_id: typeof query.person_id === 'string' ? query.person_id : initialPersonId ?? '',
      metadata_key: parseMetadataKey(query.metadata_key ?? initialMetadataKey),
      classification: parseClassification(query.classification ?? initialClassification),
      limit: typeof query.limit === 'string' ? query.limit : String(initialLimit),
    };
  }, [initialClassification, initialLimit, initialMetadataKey, initialPersonId, router.query]);
  const queryKey = `${currentQuery.person_id}|${currentQuery.metadata_key}|${currentQuery.classification}|${currentQuery.limit}`;

  const loadDryRun = useCallback(
    async (options: {
      personId: string;
      metadataKey: MetadataKeyFilter;
      classification: ClassificationFilter;
      limit: string;
      syncUrl?: boolean;
    }) => {
      const normalizedLimit = parseLimit(options.limit);
      const params = new URLSearchParams();
      if (options.personId.trim()) params.set('person_id', options.personId.trim());
      if (options.metadataKey !== 'all') params.set('metadata_key', options.metadataKey);
      if (options.classification !== 'all') params.set('classification', options.classification);
      params.set('limit', String(normalizedLimit));

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/support/planning-legacy-cleanup-dry-run?${params.toString()}`,
        );
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? 'Failed to load cleanup dry-run.');
        }
        setDryRun(body as PlanningLegacyCleanupDryRun);
        if (options.syncUrl) {
          const nextQuery: Record<string, string> = { limit: String(normalizedLimit) };
          if (options.personId.trim()) nextQuery.person_id = options.personId.trim();
          if (options.metadataKey !== 'all') nextQuery.metadata_key = options.metadataKey;
          if (options.classification !== 'all') nextQuery.classification = options.classification;
          autoLoadedKeyRef.current = `${nextQuery.person_id ?? ''}|${options.metadataKey}|${options.classification}|${normalizedLimit}`;
          void router.replace(
            { pathname: router.pathname, query: nextQuery },
            undefined,
            { shallow: true },
          );
        }
      } catch (err) {
        setDryRun(null);
        setError(err instanceof Error ? err.message : 'Failed to load cleanup dry-run.');
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
    setMetadataKey(currentQuery.metadata_key);
    setClassification(currentQuery.classification);
    setLimit(currentQuery.limit);
    void loadDryRun({
      personId: currentQuery.person_id,
      metadataKey: currentQuery.metadata_key,
      classification: currentQuery.classification,
      limit: currentQuery.limit,
      syncUrl: false,
    });
  }, [
    currentQuery.classification,
    currentQuery.limit,
    currentQuery.metadata_key,
    currentQuery.person_id,
    loadDryRun,
    queryKey,
  ]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadDryRun({ personId, metadataKey, classification, limit, syncUrl: true });
  }

  if (!user || user.role !== 'admin') {
    return (
      <>
        <Head>
          <title>Legacy Cleanup Dry-Run · Fine Diet Admin</title>
        </Head>
        <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
          <div className="max-w-md text-center">
            <h1 className="mb-4 text-3xl font-bold text-gray-900">Access Denied</h1>
            <p className="mb-8 text-lg text-gray-600">
              Only administrators can inspect legacy cleanup dry-runs.
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
        <title>Legacy Cleanup Dry-Run · Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-12">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link href="/admin" className="mb-4 inline-flex text-sm text-gray-600 hover:text-gray-900">
              Back to Admin Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Legacy Cleanup Dry-Run</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Read-only cleanup-readiness analysis for retained legacy planning/grocery metadata.
              This page does not expose cleanup, delete, repair, backfill, or mutation actions.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Signed in as <span className="font-medium text-gray-700">{user.email ?? 'Unknown'}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-[1fr_220px_220px_140px_auto]">
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
                <label htmlFor="metadata_key" className="block text-sm font-medium text-gray-700">
                  Metadata key
                </label>
                <select
                  id="metadata_key"
                  value={metadataKey}
                  onChange={(event) => setMetadataKey(parseMetadataKey(event.target.value))}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All</option>
                  {Object.entries(METADATA_KEY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="classification" className="block text-sm font-medium text-gray-700">
                  Classification
                </label>
                <select
                  id="classification"
                  value={classification}
                  onChange={(event) => setClassification(parseClassification(event.target.value))}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All</option>
                  <option value="cleanup_candidate">cleanup_candidate</option>
                  <option value="review_required">review_required</option>
                  <option value="malformed_legacy">malformed_legacy</option>
                  <option value="unmatched_legacy">unmatched_legacy</option>
                  <option value="table_conflict">table_conflict</option>
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
                  {loading ? 'Loading...' : 'Load dry-run'}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              The browser calls only the read-only legacy cleanup dry-run endpoint.
            </p>
          </form>

          {error && (
            <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {loading && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 shadow-sm">
              Loading legacy cleanup dry-run...
            </div>
          )}

          {dryRun && (
            <div className="space-y-6">
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-600 shadow-sm">
                Generated {formatTimestamp(dryRun.generated_at)} · mode {dryRun.mode} · filter person{' '}
                {dryRun.filters.person_id ?? 'all'} · metadata {dryRun.filters.metadata_key} ·
                classification {dryRun.filters.classification} · limit {dryRun.filters.limit}
              </div>
              <SummaryCards dryRun={dryRun} />
              <NotesAndReasons dryRun={dryRun} />
              <PersonRows dryRun={dryRun} />
              <RecordRows dryRun={dryRun} />
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
        destination: '/login?redirect=/admin/support/planning-legacy-cleanup-dry-run',
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
      initialMetadataKey: parseMetadataKey(context.query.metadata_key),
      initialClassification: parseClassification(context.query.classification),
      initialLimit: parseLimit(context.query.limit),
    },
  };
};
