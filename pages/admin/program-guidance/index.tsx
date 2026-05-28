/**
 * Admin Page: Program Guidance List (Plans Phase 7)
 *
 * Entry point for the program guidance authoring flow. Editors/admins can
 * filter by program slug, guidance type, active state, and drill into a
 * specific person's currently-active guidance. Links into the editor for
 * create/edit.
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
  ProgramGuidanceType,
  ProgramPlanGuidance,
} from '@/lib/plans/types';
import { PROGRAM_GUIDANCE_TYPES } from '@/lib/plans/types';

interface Props {
  user: AuthenticatedUser;
}

interface ListResponse {
  rows: ProgramPlanGuidance[];
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

function countEmphasis(row: ProgramPlanGuidance): string {
  const p = row.guidance_payload_json;
  const e = p.emphasize?.length ?? 0;
  const a = p.avoid?.length ?? 0;
  return `${e}↑ / ${a}↓`;
}

function hasScheduleOverride(row: ProgramPlanGuidance): boolean {
  return !!row.guidance_payload_json.schedule_override;
}

export default function ProgramGuidanceListPage({ user }: Props) {
  const [rows, setRows] = useState<ProgramPlanGuidance[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [programSlug, setProgramSlug] = useState('');
  const [guidanceType, setGuidanceType] = useState<ProgramGuidanceType | ''>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [personId, setPersonId] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (programSlug.trim()) params.set('program_slug', programSlug.trim());
      if (guidanceType) params.set('guidance_type', guidanceType);
      if (activeFilter) params.set('active', activeFilter);
      if (personId.trim()) params.set('person_id', personId.trim());
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      const resp = await fetch(`/api/admin/program-guidance?${params.toString()}`);
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error ?? 'Failed to list guidance rows.');
      }
      const data = (await resp.json()) as ListResponse;
      setRows(data.rows);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [programSlug, guidanceType, activeFilter, personId, page]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    setPage(0);
  }, [programSlug, guidanceType, activeFilter, personId]);

  const toggleActive = async (row: ProgramPlanGuidance) => {
    const url = row.active
      ? `/api/admin/program-guidance/${row.id}/deactivate`
      : `/api/admin/program-guidance/${row.id}/activate`;
    const resp = await fetch(url, { method: 'POST' });
    if (!resp.ok) {
      const data = await resp.json();
      alert(data.error ?? 'Toggle failed.');
      return;
    }
    await fetchRows();
  };

  return (
    <>
      <Head>
        <title>Program Guidance · Fine Diet Admin</title>
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
                  Program Guidance
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Author, activate, and manage <code>program_plan_guidance</code>{' '}
                  rows consumed by Plans generation.
                </p>
              </div>
              <Link
                href="/admin/program-guidance/new"
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
              >
                New guidance
              </Link>
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
                  Guidance type
                </label>
                <select
                  value={guidanceType}
                  onChange={(e) =>
                    setGuidanceType(e.target.value as ProgramGuidanceType | '')
                  }
                  className={LIGHT_CONTROL_CLASS}
                >
                  <option value="">All types</option>
                  {PROGRAM_GUIDANCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Active
                </label>
                <select
                  value={activeFilter}
                  onChange={(e) =>
                    setActiveFilter(e.target.value as '' | 'true' | 'false')
                  }
                  className={LIGHT_CONTROL_CLASS}
                >
                  <option value="">All</option>
                  <option value="true">Active only</option>
                  <option value="false">Inactive only</option>
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
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Priority</th>
                  <th className="px-4 py-2">Emph/Avoid</th>
                  <th className="px-4 py-2">Schedule</th>
                  <th className="px-4 py-2">Active dates</th>
                  <th className="px-4 py-2">Active</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">
                        {row.program_slug}
                      </div>
                      {row.program_run_id && (
                        <div className="text-xs text-gray-500 font-mono">
                          run: {row.program_run_id.slice(0, 8)}…
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">
                      {row.person_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {row.guidance_type ? (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 rounded">
                          {row.guidance_type.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{row.priority}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {countEmphasis(row)}
                    </td>
                    <td className="px-4 py-2">
                      {hasScheduleOverride(row) ? (
                        <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
                          override
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700">
                      {fmtDate(row.effective_from)} → {fmtDate(row.effective_until)}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => toggleActive(row)}
                        className={`px-2 py-0.5 text-xs rounded border ${
                          row.active
                            ? 'bg-green-100 border-green-300 text-green-800'
                            : 'bg-gray-100 border-gray-300 text-gray-600'
                        }`}
                      >
                        {row.active ? 'active' : 'inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/admin/program-guidance/${row.id}`}
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
                      colSpan={9}
                      className="px-4 py-8 text-center text-sm text-gray-500"
                    >
                      No guidance rows match these filters.
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
        destination: '/login?redirect=/admin/program-guidance',
        permanent: false,
      },
    };
  }
  return { props: { user } };
};
