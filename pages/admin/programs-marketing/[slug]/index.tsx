/**
 * Admin: /admin/programs-marketing/[slug]
 *
 * Edit product record metadata: title, SEO, status, sortOrder.
 * Publish/unpublish toggle. Preview link. Link to composition editor.
 *
 * Admin-only. kind / collectionSlug / programSlug are derived from the slug at
 * creation and shown read-only; they are preserved on every save.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import {
  getProgramsMarketingProductRecord,
  type ProgramsMarketingProduct,
} from '@/lib/programs/programsMarketingApi';

interface Props {
  product: ProgramsMarketingProduct;
}

export default function ProgramsMarketingProductEdit({ product: initial }: Props) {
  const slug = initial.slug;

  const [form, setForm] = useState({
    title: initial.title,
    seoTitle: initial.seoTitle,
    seoDescription: initial.seoDescription,
    sortOrder: initial.sortOrder,
    status: initial.status,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'sortOrder' ? parseInt(value, 10) || 0 : value,
    }));
    setSaved(false);
  }

  function buildPayload(overrides?: Partial<ProgramsMarketingProduct>): ProgramsMarketingProduct {
    return {
      slug,
      category: 'programs',
      templateFamily: 'programs',
      kind: initial.kind,
      collectionSlug: initial.collectionSlug,
      ...(initial.programSlug ? { programSlug: initial.programSlug } : {}),
      title: form.title,
      seoTitle: form.seoTitle,
      seoDescription: form.seoDescription,
      sortOrder: form.sortOrder,
      status: form.status,
      ...overrides,
    };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/programs-marketing/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? 'Save failed'); return; }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishToggle() {
    const action = form.status === 'published' ? 'unpublish' : 'publish';
    const confirmed = window.confirm(
      `${action === 'publish' ? 'Publish' : 'Unpublish'} this record?`,
    );
    if (!confirmed) return;

    const res = await fetch(`/api/admin/programs-marketing/${slug}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (!json.success) { setError(json.error ?? 'Status change failed'); return; }
    setForm((prev) => ({ ...prev, status: json.status }));
  }

  return (
    <>
      <Head>
        <title>{form.title || slug} · Programs Marketing Admin</title>
      </Head>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        {/* Breadcrumb */}
        <div className="mb-6 text-sm text-gray-500">
          <Link href="/admin/programs-marketing" className="hover:text-gray-700">
            Programs Marketing
          </Link>
          {' / '}
          <span className="font-mono text-gray-700">{slug}</span>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{form.title || slug}</h1>
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              form.status === 'published'
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {form.status}
            </span>
            <Link
              href={`/admin/programs-marketing/${slug}/preview`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Preview ↗
            </Link>
            <Link
              href={`/admin/programs-marketing/${slug}/composition`}
              className="text-sm text-purple-600 hover:text-purple-800 font-medium"
            >
              Edit Composition →
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {saved && (
          <div className="mb-6 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Saved successfully.
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* Read-only fields */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Marketing Slug
            </label>
            <p className="font-mono text-sm text-gray-700 bg-gray-50 rounded px-3 py-2 border border-gray-200">
              {slug}
            </p>
            <p className="mt-1 text-xs text-gray-400">Slug cannot be changed after creation.</p>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 border border-gray-200">
            <div><span className="font-medium">Kind:</span> {initial.kind}</div>
            <div><span className="font-medium">Collection:</span> {initial.collectionSlug}</div>
            <div><span className="font-medium">Program:</span> {initial.programSlug ?? '—'}</div>
          </div>

          {/* Editable fields */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              value={form.title}
              onChange={handleChange}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="seoTitle" className="block text-sm font-medium text-gray-700 mb-1">
              SEO Title
            </label>
            <input
              id="seoTitle"
              name="seoTitle"
              type="text"
              value={form.seoTitle}
              onChange={handleChange}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="seoDescription" className="block text-sm font-medium text-gray-700 mb-1">
              SEO Description
            </label>
            <textarea
              id="seoDescription"
              name="seoDescription"
              rows={3}
              value={form.seoDescription}
              onChange={handleChange}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="sortOrder" className="block text-sm font-medium text-gray-700 mb-1">
              Sort Order
            </label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              value={form.sortOrder}
              onChange={handleChange}
              className="w-32 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-gray-100">
            <button
              type="button"
              onClick={handlePublishToggle}
              className={`text-sm font-medium px-4 py-2 rounded-md border transition-colors ${
                form.status === 'published'
                  ? 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                  : 'border-green-300 text-green-700 hover:bg-green-50'
              }`}
            >
              {form.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || user.role !== 'admin') {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  const slug = context.params?.slug as string;
  const product =
    (await getProgramsMarketingProductRecord(slug, 'draft')) ??
    (await getProgramsMarketingProductRecord(slug, 'published'));

  if (!product) return { notFound: true };

  return { props: { product } };
};
