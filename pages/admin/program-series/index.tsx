/**
 * Admin Page: Program Series list (Packet 23)
 *
 * MVP authoring surface for public marketing series. Public routes still fall
 * back to the code-owned catalogue if no published DB series exist.
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
  ProgramSeriesRow,
  ProgramSeriesStatus,
} from '@/lib/programs/programSeriesAdminServerService';

interface Props {
  user: AuthenticatedUser;
}

interface ListResponse {
  rows: ProgramSeriesRow[];
  total: number;
  limit: number;
  offset: number;
}

const STATUS_BADGE: Record<ProgramSeriesStatus, string> = {
  draft: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  published: 'bg-green-100 text-green-900 border-green-300',
  archived: 'bg-gray-100 text-gray-800 border-gray-300',
};

const LIGHT_CONTROL_CLASS =
  'w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500';

export default function AdminProgramSeriesListPage({ user: _user }: Props) {
  const [rows, setRows] = useState<ProgramSeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | ProgramSeriesStatus>('');
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newError, setNewError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (statusFilter) params.set('status', statusFilter);
      const resp = await fetch(`/api/admin/program-series?${params.toString()}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to list program series.');
      }
      const data = (await resp.json()) as ListResponse;
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setNewError(null);
    try {
      const resp = await fetch('/api/admin/program-series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: newSlug.trim(),
          title: newTitle.trim(),
          status: 'draft',
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Create failed.');
      }
      const created = (await resp.json()) as ProgramSeriesRow;
      window.location.href = `/admin/program-series/${created.id}`;
    } catch (err) {
      setNewError(err instanceof Error ? err.message : 'Create failed.');
    }
  };

  return (
    <>
      <Head>
        <title>Program Series · Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pb-10">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link
              href="/admin/app-settings"
              className="mb-3 inline-block text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back to App Settings
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Program Series
                </h1>
                <p className="mt-1 text-sm text-gray-600">
                  Admin-managed foundation for public `/programs` series pages.
                  Code-owned catalogue remains the fallback.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreating((value) => !value)}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {creating ? 'Cancel' : 'New series'}
              </button>
            </div>
          </div>

          {creating && (
            <form
              onSubmit={onCreate}
              className="mb-5 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-3"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Slug
                </label>
                <input
                  value={newSlug}
                  onChange={(event) => setNewSlug(event.target.value)}
                  placeholder="fine-diet-method"
                  className={`${LIGHT_CONTROL_CLASS} font-mono`}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Title
                </label>
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="The Fine Diet Method"
                  className={LIGHT_CONTROL_CLASS}
                  required
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Create
                </button>
              </div>
              {newError && (
                <p className="text-sm text-red-700 md:col-span-3">{newError}</p>
              )}
            </form>
          )}

          <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as '' | ProgramSeriesStatus)
              }
              className={`${LIGHT_CONTROL_CLASS} w-auto`}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {error && (
              <div className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {error}
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left">Order</th>
                  <th className="px-4 py-2 text-left">Slug</th>
                  <th className="px-4 py-2 text-left">Title</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Updated</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-gray-500"
                    >
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-gray-500"
                    >
                      No program series yet.
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((series) => (
                    <tr key={series.id} className="border-t border-gray-200">
                      <td className="px-4 py-2 text-gray-600">
                        {series.display_order}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {series.slug}
                      </td>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {series.title}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-xs ${STATUS_BADGE[series.status]}`}
                        >
                          {series.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {new Date(series.updated_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/admin/program-series/${series.id}`}
                          className="text-sm font-medium text-blue-700 hover:underline"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
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
        destination: '/login?redirect=/admin/program-series',
        permanent: false,
      },
    };
  }

  return { props: { user } };
};
