/**
 * Admin Page: Missing-item Requests (Plans Phase 14 + 15)
 *
 * Lightweight ops console for the no-match / low-confidence food item
 * backlog produced by Journal search and the Packet 6 import matcher.
 * Admins can filter by status / context / free-text, inspect a row's
 * conservative fallback payload, then resolve (linking a trusted
 * food_object with optional alias enrichment) or dismiss.
 *
 * Phase 15 additions:
 *   - Resolve modal now includes a typeahead picker backed by
 *     /api/admin/food-objects/search so the admin can choose the
 *     trusted object without leaving the page.
 *   - Alias enrichment toggle (default on when a candidate is
 *     selected) appends the request's normalized input (or an admin
 *     override) to food_objects.aliases on save.
 *   - Post-resolve clarity: resolved rows surface `alias_enrichment_applied`
 *     and `alias_enrichment_value` in the expanded row view.
 *
 * Intentionally single-page: the packet explicitly rejects a giant
 * moderation platform for V1.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type {
  FoodObjectCandidate,
  MissingItemContext,
  MissingItemRequest,
  MissingItemStatus,
} from '@/lib/missingItems/types';
import {
  MISSING_ITEM_CONTEXTS,
  MISSING_ITEM_STATUSES,
} from '@/lib/missingItems/types';

interface Props {
  user: AuthenticatedUser;
}

interface ListResponse {
  rows: MissingItemRequest[];
  total: number;
  limit: number;
  offset: number;
  counts: Record<MissingItemStatus, number>;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusPill(status: MissingItemStatus): string {
  if (status === 'open') return 'bg-amber-100 text-amber-800';
  if (status === 'resolved') return 'bg-emerald-100 text-emerald-800';
  return 'bg-gray-100 text-gray-700';
}

function contextPill(context: MissingItemContext): string {
  switch (context) {
    case 'journal_search':
      return 'bg-blue-100 text-blue-800';
    case 'recipe_import':
      return 'bg-purple-100 text-purple-800';
    case 'manual_meal_entry':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export default function MissingItemRequestsPage({ user: _user }: Props) {
  const [rows, setRows] = useState<MissingItemRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<MissingItemStatus, number>>({
    open: 0,
    resolved: 0,
    dismissed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<MissingItemStatus | ''>('open');
  const [context, setContext] = useState<MissingItemContext | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Phase 15: resolve flow now carries a selected candidate + alias toggle.
  const [resolveDraft, setResolveDraft] = useState<{
    id: string;
    requestNormalizedInput: string;
    candidate: FoodObjectCandidate | null;
    applyAliasEnrichment: boolean;
    aliasValue: string;
    resolutionNotes: string;
  } | null>(null);
  const [candidateQuery, setCandidateQuery] = useState('');
  const [candidateResults, setCandidateResults] = useState<FoodObjectCandidate[]>(
    [],
  );
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const candidateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const limit = 50;

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (context) params.set('context', context);
      const trimmedQ = q.trim();
      if (trimmedQ) params.set('q', trimmedQ);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      const resp = await fetch(
        `/api/admin/missing-item-requests?${params.toString()}`,
      );
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to list requests.');
      }
      const data = (await resp.json()) as ListResponse;
      setRows(data.rows);
      setTotal(data.total);
      setCounts(data.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, context, q, page]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const patchRow = useCallback(
    async (
      id: string,
      body: {
        status: 'resolved' | 'dismissed';
        resolved_food_object_id?: string | null;
        resolution_notes?: string | null;
        apply_alias_enrichment?: boolean;
        alias_value?: string | null;
      },
    ) => {
      setPendingId(id);
      try {
        const resp = await fetch(`/api/admin/missing-item-requests/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data.error ?? 'Update failed.');
        }
        setResolveDraft(null);
        await fetchRows();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Update failed.');
      } finally {
        setPendingId(null);
      }
    },
    [fetchRows],
  );

  const submitResolve = useCallback(() => {
    if (!resolveDraft) return;
    const candidateId = resolveDraft.candidate?.id ?? null;
    const trimmedAlias = resolveDraft.aliasValue.trim();
    patchRow(resolveDraft.id, {
      status: 'resolved',
      resolved_food_object_id: candidateId,
      resolution_notes: resolveDraft.resolutionNotes.trim() || null,
      apply_alias_enrichment:
        resolveDraft.applyAliasEnrichment && !!candidateId,
      alias_value: trimmedAlias ? trimmedAlias : null,
    });
  }, [resolveDraft, patchRow]);

  // Candidate picker: debounced fetch against the admin food-object
  // lookup endpoint. Runs only while the resolve modal is open.
  useEffect(() => {
    if (!resolveDraft) {
      setCandidateResults([]);
      setCandidateError(null);
      setCandidateLoading(false);
      return;
    }
    const query = candidateQuery.trim();
    if (candidateDebounceRef.current) {
      clearTimeout(candidateDebounceRef.current);
    }
    if (query.length < 2) {
      setCandidateResults([]);
      setCandidateLoading(false);
      setCandidateError(null);
      return;
    }
    setCandidateLoading(true);
    candidateDebounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, limit: '15' });
        const resp = await fetch(
          `/api/admin/food-objects/search?${params.toString()}`,
        );
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data.error ?? 'Candidate search failed.');
        }
        const data = (await resp.json()) as { rows: FoodObjectCandidate[] };
        setCandidateResults(data.rows);
        setCandidateError(null);
      } catch (err) {
        setCandidateResults([]);
        setCandidateError(
          err instanceof Error ? err.message : 'Candidate search failed.',
        );
      } finally {
        setCandidateLoading(false);
      }
    }, 250);
    return () => {
      if (candidateDebounceRef.current) clearTimeout(candidateDebounceRef.current);
    };
  }, [candidateQuery, resolveDraft]);

  const openResolveModal = useCallback((row: MissingItemRequest) => {
    setResolveDraft({
      id: row.id,
      requestNormalizedInput: row.normalized_input,
      candidate: null,
      applyAliasEnrichment: true,
      aliasValue: row.normalized_input,
      resolutionNotes: '',
    });
    setCandidateQuery(row.normalized_input);
    setCandidateResults([]);
    setCandidateError(null);
  }, []);

  const countsByContext = useMemo(() => {
    const byCtx: Record<string, number> = {};
    for (const r of rows) byCtx[r.context] = (byCtx[r.context] ?? 0) + 1;
    return byCtx;
  }, [rows]);

  return (
    <>
      <Head>
        <title>Missing-item Requests · Admin · Fine Diet</title>
      </Head>
      <div className="bg-gray-100 min-h-screen pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-6">
            <Link
              href="/admin/app-settings"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← App Settings
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mt-3">
              Missing-item Requests
            </h1>
            <p className="text-gray-600 mt-1 max-w-3xl">
              No-match / low-confidence food items queued from Journal search
              and Imports. Conservative estimates were already used at runtime;
              resolve here to a trusted food object or dismiss.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {(['open', 'resolved', 'dismissed'] as MissingItemStatus[]).map(
              (s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatus(s);
                    setPage(0);
                  }}
                  className={`text-left bg-white rounded-lg shadow-sm border p-4 hover:border-blue-300 transition ${
                    status === s ? 'border-blue-400' : 'border-gray-200'
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    {s}
                  </div>
                  <div className="text-3xl font-bold text-gray-900 mt-1">
                    {counts[s]}
                  </div>
                </button>
              ),
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as MissingItemStatus | '');
                    setPage(0);
                  }}
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">Any</option>
                  {MISSING_ITEM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Context
                </label>
                <select
                  value={context}
                  onChange={(e) => {
                    setContext(e.target.value as MissingItemContext | '');
                    setPage(0);
                  }}
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">Any</option>
                  {MISSING_ITEM_CONTEXTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Search raw / normalized input
                </label>
                <input
                  type="text"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(0);
                  }}
                  placeholder="e.g. paprika"
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {loading
                ? 'Loading…'
                : `${rows.length} shown · ${total} total${
                    Object.keys(countsByContext).length > 0
                      ? ' · ' +
                        Object.entries(countsByContext)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')
                      : ''
                  }`}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Input</th>
                  <th className="px-4 py-2 text-left">Context</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Seen</th>
                  <th className="px-4 py-2 text-left">Last seen</th>
                  <th className="px-4 py-2 text-left">Source ref</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-gray-500"
                    >
                      No requests match the current filters.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const isExpanded = expandedId === r.id;
                  const isPending = pendingId === r.id;
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : r.id)
                          }
                          className="text-left"
                        >
                          <div className="font-medium text-gray-900">
                            {r.raw_input}
                          </div>
                          <div className="text-xs text-gray-500">
                            normalized: {r.normalized_input}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2 border border-gray-200 space-y-1">
                            <div>
                              <span className="font-semibold">id:</span>{' '}
                              <code>{r.id}</code>
                            </div>
                            <div>
                              <span className="font-semibold">person_id:</span>{' '}
                              <code>{r.person_id ?? '—'}</code>
                            </div>
                            <div>
                              <span className="font-semibold">source_kind:</span>{' '}
                              {r.source_kind}
                            </div>
                            {r.notes && (
                              <div>
                                <span className="font-semibold">notes:</span>{' '}
                                {r.notes}
                              </div>
                            )}
                            {r.fallback_metadata != null && (
                              <div>
                                <span className="font-semibold">
                                  fallback_metadata:
                                </span>
                                <pre className="mt-1 text-[11px] whitespace-pre-wrap break-all bg-white border border-gray-200 rounded p-2">
                                  {JSON.stringify(r.fallback_metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                            {r.resolution_notes && (
                              <div>
                                <span className="font-semibold">
                                  resolution_notes:
                                </span>{' '}
                                {r.resolution_notes}
                              </div>
                            )}
                            {r.resolved_food_object_id && (
                              <div>
                                <span className="font-semibold">
                                  resolved_food_object_id:
                                </span>{' '}
                                <code>{r.resolved_food_object_id}</code>
                              </div>
                            )}
                            {r.alias_enrichment_applied && (
                              <div>
                                <span className="font-semibold">
                                  alias_enrichment_applied:
                                </span>{' '}
                                <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-100 text-emerald-800">
                                  yes
                                </span>
                                {r.alias_enrichment_value && (
                                  <>
                                    {' '}
                                    <span className="font-mono">
                                      &ldquo;{r.alias_enrichment_value}&rdquo;
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                            {r.resolved_at && (
                              <div>
                                <span className="font-semibold">
                                  resolved_at:
                                </span>{' '}
                                {fmt(r.resolved_at)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${contextPill(r.context)}`}
                        >
                          {r.context}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusPill(r.status)}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {r.occurrence_count}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {fmt(r.last_seen_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 break-all">
                        {r.source_ref ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {r.status === 'open' ? (
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => openResolveModal(r)}
                              className="px-2 py-1 text-xs font-semibold rounded border border-emerald-600 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              Resolve
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() =>
                                patchRow(r.id, { status: 'dismissed' })
                              }
                              className="px-2 py-1 text-xs font-semibold rounded border border-gray-400 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">closed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <div>
              Page {page + 1} / {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {resolveDraft && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-6 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-6 my-auto">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Resolve request
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Link this request to an existing trusted food object and
                  optionally add the request&apos;s normalized text as an alias
                  so future matches resolve earlier.
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Request:{' '}
                  <span className="font-mono text-gray-700">
                    {resolveDraft.requestNormalizedInput}
                  </span>
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Find trusted food object
                </label>
                <input
                  type="text"
                  value={candidateQuery}
                  onChange={(e) => setCandidateQuery(e.target.value)}
                  placeholder="Search canonical name, brand, or alias"
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                  autoFocus
                />
                <div className="mt-2 border border-gray-200 rounded-md bg-gray-50 max-h-56 overflow-y-auto">
                  {candidateLoading && (
                    <div className="px-3 py-2 text-xs text-gray-500">
                      Searching…
                    </div>
                  )}
                  {!candidateLoading && candidateError && (
                    <div className="px-3 py-2 text-xs text-red-700">
                      {candidateError}
                    </div>
                  )}
                  {!candidateLoading &&
                    !candidateError &&
                    candidateQuery.trim().length >= 2 &&
                    candidateResults.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-500">
                        No trusted candidates found.
                      </div>
                    )}
                  {!candidateLoading &&
                    candidateResults.map((cand) => {
                      const selected = resolveDraft.candidate?.id === cand.id;
                      return (
                        <button
                          key={cand.id}
                          type="button"
                          onClick={() =>
                            setResolveDraft((d) =>
                              d ? { ...d, candidate: cand } : d,
                            )
                          }
                          className={`block w-full text-left px-3 py-2 border-b border-gray-200 last:border-b-0 hover:bg-white ${
                            selected ? 'bg-emerald-50' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold text-gray-900 text-sm">
                              {cand.canonical_name}
                              {cand.brand_name && (
                                <span className="ml-2 text-xs text-gray-500 font-normal">
                                  {cand.brand_name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {cand.is_verified && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                                  verified
                                </span>
                              )}
                              <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded">
                                {cand.source_type}
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 font-mono">
                            {cand.id}
                          </div>
                          {cand.aliases.length > 0 && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              aliases: {cand.aliases.join(', ')}
                            </div>
                          )}
                        </button>
                      );
                    })}
                </div>
                {resolveDraft.candidate && (
                  <div className="mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                    <div className="text-xs text-emerald-900">
                      Linking to{' '}
                      <span className="font-semibold">
                        {resolveDraft.candidate.canonical_name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setResolveDraft((d) =>
                          d ? { ...d, candidate: null } : d,
                        )
                      }
                      className="text-xs text-emerald-800 underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-4">
                <label className="flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={resolveDraft.applyAliasEnrichment}
                    disabled={!resolveDraft.candidate}
                    onChange={(e) =>
                      setResolveDraft((d) =>
                        d
                          ? { ...d, applyAliasEnrichment: e.target.checked }
                          : d,
                      )
                    }
                  />
                  <span>
                    Add alias to trusted object
                    <span className="ml-1 text-xs text-gray-500">
                      (improves future search + matching)
                    </span>
                  </span>
                </label>
                {resolveDraft.candidate &&
                  resolveDraft.applyAliasEnrichment && (
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        alias value
                      </label>
                      <input
                        type="text"
                        value={resolveDraft.aliasValue}
                        onChange={(e) =>
                          setResolveDraft((d) =>
                            d ? { ...d, aliasValue: e.target.value } : d,
                          )
                        }
                        className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm font-mono"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">
                        Defaults to the request&apos;s normalized input. Appended
                        to <code>food_objects.aliases</code> (lowercased,
                        idempotent).
                      </p>
                    </div>
                  )}
                {!resolveDraft.candidate && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Select a trusted object above to enable alias enrichment.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  resolution_notes
                </label>
                <textarea
                  value={resolveDraft.resolutionNotes}
                  onChange={(e) =>
                    setResolveDraft((d) =>
                      d ? { ...d, resolutionNotes: e.target.value } : d,
                    )
                  }
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setResolveDraft(null)}
                className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitResolve}
                disabled={pendingId === resolveDraft.id}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                {resolveDraft.candidate
                  ? resolveDraft.applyAliasEnrichment
                    ? 'Resolve + enrich'
                    : 'Resolve (no alias)'
                  : 'Resolve (no link)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const user = await getCurrentUserWithRoleFromSSR(ctx);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/missing-item-requests',
        permanent: false,
      },
    };
  }
  return { props: { user } };
};
