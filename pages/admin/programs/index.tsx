/**
 * Admin Page: Programs list (Plans Phase 12)
 *
 * Entry point for program content authoring. Lists programs from the
 * `programs` table (admin scope: all statuses). Links to the editor for
 * create / edit / module & item authoring.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type { Program, ProgramStatus } from '@/lib/programs/contentTypes';

interface Props {
  user: AuthenticatedUser;
}

interface ListResponse {
  rows: Program[];
  total: number;
  limit: number;
  offset: number;
}

const STATUS_BADGES: Record<ProgramStatus, string> = {
  draft: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  published: 'bg-green-100 text-green-900 border-green-300',
  archived: 'bg-gray-100 text-gray-800 border-gray-300',
};

const LIGHT_CONTROL_CLASS =
  'rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500';

export default function AdminProgramsListPage({ user: _user }: Props) {
  const [rows, setRows] = useState<Program[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'' | ProgramStatus>('');
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newError, setNewError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '200');
      const resp = await fetch(`/api/admin/programs?${params.toString()}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to list programs.');
      }
      const data = (await resp.json()) as ListResponse;
      setRows(data.rows);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewError(null);
    try {
      const resp = await fetch('/api/admin/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: newSlug.trim(),
          title: newTitle.trim(),
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Create failed.');
      }
      const created = (await resp.json()) as Program;
      setCreating(false);
      setNewSlug('');
      setNewTitle('');
      window.location.href = `/admin/programs/${created.id}`;
    } catch (err) {
      setNewError(err instanceof Error ? err.message : 'Create failed.');
    }
  };

  return (
    <>
      <Head>
        <title>Programs · Fine Diet Admin</title>
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
                <h1 className="text-3xl font-bold text-gray-900">Programs</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Admin-managed program catalogue. Modules and content items
                  are edited inside each program.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreating((c) => !c)}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
              >
                {creating ? 'Cancel' : 'New program'}
              </button>
            </div>
          </div>

          {creating && (
            <form
              onSubmit={onCreate}
              className="bg-white border border-gray-200 rounded-lg p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-3"
            >
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Slug (url-safe, immutable)
                </label>
                <input
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="e.g. gut-check"
                  className={`w-full ${LIGHT_CONTROL_CLASS} font-mono`}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Gut Check"
                  className={`w-full ${LIGHT_CONTROL_CLASS}`}
                  required
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
                >
                  Create
                </button>
              </div>
              {newError && (
                <p className="text-sm text-red-700 md:col-span-3">{newError}</p>
              )}
            </form>
          )}

          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as '' | ProgramStatus)
              }
              className={LIGHT_CONTROL_CLASS}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {error && (
              <div className="p-4 bg-red-50 text-red-800 text-sm border-b border-red-200">
                {error}
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Slug</th>
                  <th className="text-left px-4 py-2">Title</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Updated</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-gray-500"
                    >
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-gray-500"
                    >
                      No programs yet.
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((p) => (
                    <tr key={p.id} className="border-t border-gray-200">
                      <td className="px-4 py-2 font-mono text-xs">{p.slug}</td>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {p.title}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs rounded-full border ${STATUS_BADGES[p.status]}`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {new Date(p.updated_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/admin/programs/${p.id}`}
                          className="text-blue-700 hover:underline text-xs"
                        >
                          Edit →
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-200">
              {total} program{total === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (
  context,
) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/programs',
        permanent: false,
      },
    };
  }
  return { props: { user } };
};
