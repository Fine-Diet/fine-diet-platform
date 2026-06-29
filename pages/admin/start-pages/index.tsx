/**
 * Admin: /admin/start-pages
 *
 * Lists Start Pages / Offer Landing Pages (draft + published + archived).
 * Actions: create, edit, preview, publish/unpublish, archive.
 *
 * Start Pages own PRESENTATION for the /start surface only. Access, billing
 * readiness, entitlement mapping, and grants stay in Offers & Bundles.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { listStartPages, type StartPageSummary } from '@/lib/startPages/startPageApi';
import { DEFAULT_START_PAGE_SLUG, routePathForSlug } from '@/lib/startPages/startPageSchema';

type StartPageListItem = StartPageSummary & { hasPublished: boolean; hasDraft: boolean };

interface Props {
  pages: StartPageListItem[];
  userRole: 'editor' | 'admin';
}

export default function StartPagesAdminList({ pages: initialPages, userRole }: Props) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [newSlug, setNewSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // Sync local list state when fresh SSR props arrive (e.g. on hard navigation).
  useEffect(() => {
    setPages(initialPages);
  }, [initialPages]);

  // Authoritative refresh: pull the current list straight from the API and set
  // state from the JSON. router.replace(asPath) proved unreliable in the
  // deployed UI (the list could keep showing stale published+draft until an
  // Edit round-trip), so we fetch + setPages directly after any mutation.
  async function refreshList() {
    try {
      const res = await fetch('/api/admin/start-pages', {
        headers: { 'Cache-Control': 'no-store' },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json.pages)) setPages(json.pages);
    } catch {
      // Network hiccup — leave current state; user can refresh manually.
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const slug = newSlug.trim().toLowerCase();
    if (!slug) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/start-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? 'Create failed');
        return;
      }
      router.push(`/admin/start-pages/${json.slug}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusAction(
    slug: string,
    action: 'publish' | 'unpublish' | 'archive',
  ) {
    const labels: Record<typeof action, string> = {
      publish: 'Publish',
      unpublish: 'Unpublish',
      archive: 'Archive',
    };
    if (!window.confirm(`${labels[action]} Start Page "${slug}"?`)) return;
    setBusy(slug);
    setError('');
    try {
      const res = await fetch(`/api/admin/start-pages/${slug}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!json.success) {
        const detail =
          json.validation?.errors?.length > 0
            ? `\n\n- ${json.validation.errors.join('\n- ')}`
            : '';
        setError((json.error ?? 'Action failed') + detail);
        return;
      }
      // Pull fresh statuses straight from the API so badges/actions update
      // immediately (not dependent on an SSR re-render round-trip).
      await refreshList();
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(slug: string) {
    if (
      !window.confirm(
        `Delete Start Page "${slug}" completely?\n\nThis removes the draft, published, and archived rows for this slug. ` +
          `The public route reverts to code defaults. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(slug);
    setError('');
    try {
      const res = await fetch(`/api/admin/start-pages/${slug}?scope=all`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? 'Delete failed');
        return;
      }
      await refreshList();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Head>
        <title>Start Pages · Admin</title>
      </Head>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Start Pages</h1>
            <p className="mt-1 text-sm text-gray-500">
              Presentation for the{' '}
              <code className="bg-gray-100 px-1 rounded">/start</code> surface and{' '}
              <code className="bg-gray-100 px-1 rounded">/start/[slug]</code> campaign pages.
            </p>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            &larr; Dashboard
          </Link>
        </div>

        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Start Pages control copy, section visibility, approved price option presentation,
          and controlled runtime modules. Use <strong>Modules</strong> for the visual module builder.
          Billing, trial enforcement, entitlement mappings, and grants stay in{' '}
          <Link href="/admin/offers" className="underline font-medium">Offers &amp; Bundles</Link>.
          With no published row, <code className="bg-white px-1 rounded">/start</code> and{' '}
          <code className="bg-white px-1 rounded">/start/launch</code> render the existing code defaults.
          <span className="mt-2 block text-blue-800">
            <strong>Unpublish</strong> takes the live page offline but keeps the draft.{' '}
            <strong>Archive</strong> snapshots the current page into an archived row and takes it
            offline — it keeps the draft and is <em>not</em> a delete.
            {userRole === 'admin' && (
              <> <strong>Delete</strong> (admin) removes all rows for a slug for full cleanup.</>
            )}
          </span>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
            {error}
          </div>
        )}

        {/* Pages table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-10 overflow-hidden">
          {pages.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              No Start Pages yet. Create one below.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Page</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Offer / Price options</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pages.map((page) => (
                  <tr key={page.slug} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{page.slug}</div>
                      <div className="text-gray-400 font-mono text-xs mt-0.5">{page.routePath}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {page.hasPublished && (
                          <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            published
                          </span>
                        )}
                        {page.hasDraft && (
                          <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            draft
                          </span>
                        )}
                        {!page.hasPublished && !page.hasDraft && (
                          <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {page.status}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs text-gray-700">{page.primaryOfferKey}</div>
                      <div className="text-gray-400 text-xs mt-0.5">
                        {page.priceOptionKeys.length > 0
                          ? `${page.priceOptionKeys.length} price option${page.priceOptionKeys.length === 1 ? '' : 's'}`
                          : 'no price options (falls back to defaults)'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/admin/start-pages/${page.slug}`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/admin/start-pages/${page.slug}/modules`}
                          className="text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          Modules
                        </Link>
                        <a
                          href={`/admin/start-pages/${page.slug}/preview`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-500 hover:text-gray-700 font-medium"
                        >
                          Preview ↗
                        </a>
                        {page.hasPublished ? (
                          <button
                            type="button"
                            disabled={busy === page.slug}
                            onClick={() => handleStatusAction(page.slug, 'unpublish')}
                            className="text-yellow-600 hover:text-yellow-800 font-medium disabled:opacity-40"
                          >
                            Unpublish
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy === page.slug}
                            onClick={() => handleStatusAction(page.slug, 'publish')}
                            className="text-green-600 hover:text-green-800 font-medium disabled:opacity-40"
                          >
                            Publish
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy === page.slug}
                          onClick={() => handleStatusAction(page.slug, 'archive')}
                          title="Snapshots the page into an archived row and takes it offline. Keeps the draft — not a delete."
                          className="text-gray-500 hover:text-gray-700 font-medium disabled:opacity-40"
                        >
                          Archive
                        </button>
                        {userRole === 'admin' && (
                          <button
                            type="button"
                            disabled={busy === page.slug}
                            onClick={() => handleDelete(page.slug)}
                            title="Admin only: permanently delete all rows (draft + published + archived) for this slug."
                            className="text-red-600 hover:text-red-800 font-medium disabled:opacity-40"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create new page */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Create new Start Page</h2>
          <p className="text-sm text-gray-500 mb-4">
            Creates a draft. Slug{' '}
            <code className="bg-gray-100 px-1 rounded">{DEFAULT_START_PAGE_SLUG}</code> maps to{' '}
            <code className="bg-gray-100 px-1 rounded">/start</code>; any other slug maps to{' '}
            <code className="bg-gray-100 px-1 rounded">{routePathForSlug('your-slug')}</code>.
          </p>
          <form onSubmit={handleCreate} className="flex items-center gap-3">
            <input
              type="text"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. default, launch, spring-campaign"
              className="flex-1 max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              disabled={creating || !newSlug.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-400">Lowercase letters, numbers, and hyphens only.</p>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  const pages = await listStartPages();
  return { props: { pages, userRole: user.role as 'editor' | 'admin' } };
};
