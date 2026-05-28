/**
 * Admin Page: Program Assignments List (Plans Phase 8)
 *
 * Entry point for the runtime assignment layer. Admins can filter by
 * person, program slug, status, and acquisition source; inspect active
 * windows and priority; and drill into the editor.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type {
  ProgramAcquisitionSource,
  ProgramAssignment,
  ProgramAssignmentStatus,
} from '@/lib/plans/types';
import {
  PROGRAM_ACQUISITION_SOURCES,
  PROGRAM_ASSIGNMENT_STATUSES,
} from '@/lib/plans/types';

interface Props {
  user: AuthenticatedUser;
}

interface ListResponse {
  rows: ProgramAssignment[];
  total: number;
  limit: number;
  offset: number;
}

const LIGHT_CONTROL_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm text-gray-900 placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

export default function ProgramAssignmentsListPage({ user }: Props) {
  const [rows, setRows] = useState<ProgramAssignment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [programSlug, setProgramSlug] = useState('');
  const [status, setStatus] = useState<ProgramAssignmentStatus | ''>('');
  const [source, setSource] = useState<ProgramAcquisitionSource | ''>('');
  const [personId, setPersonId] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (programSlug.trim()) params.set('program_slug', programSlug.trim());
      if (status) params.set('status', status);
      if (source) params.set('acquisition_source', source);
      if (personId.trim()) params.set('person_id', personId.trim());
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      const resp = await fetch(
        `/api/admin/program-assignments?${params.toString()}`,
      );
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error ?? 'Failed to list assignments.');
      }
      const data = (await resp.json()) as ListResponse;
      setRows(data.rows);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [programSlug, status, source, personId, page]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    setPage(0);
  }, [programSlug, status, source, personId]);

  const setStatusOnRow = async (
    row: ProgramAssignment,
    next: ProgramAssignmentStatus,
  ) => {
    const resp = await fetch(
      `/api/admin/program-assignments/${row.id}/status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      },
    );
    if (!resp.ok) {
      const data = await resp.json();
      alert(data.error ?? 'Status update failed.');
      return;
    }
    await fetchRows();
  };

  return (
    <>
      <Head>
        <title>Program Assignments · Fine Diet Admin</title>
      </Head>
      <div className="bg-gray-100 min-h-screen pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-6">
            <Link
              href="/admin/app-settings"
              className="text-sm text-gray-600 hover:text-gray-900 inline-block mb-3"
            >
              ← Back to App Settings
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Program Assignments
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Runtime layer: which programs are currently assigned to
                  which people, and for how long. Active assignments gate
                  the inheritance of{' '}
                  <code>program_plan_guidance</code> into Plans generation.
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/admin/program-assignments/automation"
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-50"
                >
                  Automation
                </Link>
                <Link
                  href="/admin/program-assignments/inspect"
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-50"
                >
                  Inspect per-person
                </Link>
                <Link
                  href="/admin/program-assignments/new"
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
                >
                  New assignment
                </Link>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Program slug
                </label>
                <input
                  type="text"
                  value={programSlug}
                  onChange={(e) => setProgramSlug(e.target.value)}
                  placeholder="e.g. gut-check-reset"
                  className={LIGHT_CONTROL_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as ProgramAssignmentStatus | '')
                  }
                  className={LIGHT_CONTROL_CLASS}
                >
                  <option value="">All statuses</option>
                  {PROGRAM_ASSIGNMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Acquisition source
                </label>
                <select
                  value={source}
                  onChange={(e) =>
                    setSource(e.target.value as ProgramAcquisitionSource | '')
                  }
                  className={LIGHT_CONTROL_CLASS}
                >
                  <option value="">All sources</option>
                  {PROGRAM_ACQUISITION_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Person id (exact)
                </label>
                <input
                  type="text"
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  placeholder="UUID"
                  className={`${LIGHT_CONTROL_CLASS} font-mono`}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 text-xs text-gray-500 flex items-center justify-between">
              <span>
                {loading
                  ? 'Loading…'
                  : `${total.toLocaleString()} row${total === 1 ? '' : 's'}`}
              </span>
              <span>Signed in as {user.email}</span>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-2">Program</th>
                  <th className="px-4 py-2">Person</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Origin</th>
                  <th className="px-4 py-2">Priority</th>
                  <th className="px-4 py-2">Active dates</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {row.program_slug}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">
                      <Link
                        href={`/admin/program-assignments/inspect?person_id=${row.person_id}`}
                        className="hover:underline"
                      >
                        {row.person_id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      <span className="px-2 py-0.5 text-xs bg-gray-100 rounded">
                        {row.acquisition_source.replace(/_/g, ' ')}
                      </span>
                      {row.source_ref && (
                        <div
                          className="text-[10px] text-gray-500 font-mono mt-0.5 truncate max-w-[12rem]"
                          title={row.source_ref}
                        >
                          {row.source_ref}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {row.auto_created ? (
                        <span className="px-2 py-0.5 text-xs bg-indigo-50 border border-indigo-200 text-indigo-800 rounded">
                          auto
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs bg-gray-50 border border-gray-200 text-gray-700 rounded">
                          manual
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{row.priority}</td>
                    <td className="px-4 py-2 text-xs text-gray-700">
                      {fmtDate(row.active_from)} → {fmtDate(row.active_to)}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={row.status}
                        onChange={(e) =>
                          setStatusOnRow(
                            row,
                            e.target.value as ProgramAssignmentStatus,
                          )
                        }
                        className={`px-2 py-0.5 text-xs rounded border bg-white disabled:bg-gray-100 disabled:text-gray-500 ${
                          row.status === 'active'
                            ? 'border-green-300 text-green-800'
                            : row.status === 'completed'
                              ? 'border-blue-300 text-blue-800'
                              : row.status === 'cancelled'
                                ? 'border-red-300 text-red-800'
                                : 'border-gray-300 text-gray-700'
                        }`}
                      >
                        {PROGRAM_ASSIGNMENT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/admin/program-assignments/${row.id}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-sm text-gray-500"
                    >
                      No assignments match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <div>
              Page {page + 1}
              {total > limit && ` of ${Math.ceil(total / limit)}`}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="px-3 py-1 border border-gray-300 rounded bg-white text-gray-800 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500"
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * limit >= total || loading}
                className="px-3 py-1 border border-gray-300 rounded bg-white text-gray-800 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/program-assignments',
        permanent: false,
      },
    };
  }
  return { props: { user } };
};
