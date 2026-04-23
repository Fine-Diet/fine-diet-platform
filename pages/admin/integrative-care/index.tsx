/**
 * Admin: /admin/integrative-care
 *
 * Lists all Integrative Care products (draft + published).
 * Actions: create, duplicate, edit metadata, edit composition, preview, publish toggle.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { listIntegrativeCareProducts, type IntegrativeCareProduct } from '@/lib/integrativeCareApi';

interface Props {
  products: IntegrativeCareProduct[];
}

export default function IntegrativeCareAdminList({ products: initialProducts }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [newSlug, setNewSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!newSlug.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/integrative-care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productSlug: newSlug.trim() }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? 'Create failed'); return; }
      router.push(`/admin/integrative-care/${json.productSlug}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(sourceSlug: string) {
    const newSlugInput = window.prompt(`Duplicate "${sourceSlug}" as:`, `${sourceSlug}-copy`);
    if (!newSlugInput) return;
    setDuplicating(sourceSlug);
    setError('');
    try {
      const res = await fetch(`/api/admin/integrative-care/${sourceSlug}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSlug: newSlugInput.trim() }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? 'Duplicate failed'); return; }
      router.push(`/admin/integrative-care/${json.productSlug}`);
    } finally {
      setDuplicating(null);
    }
  }

  async function handlePublishToggle(product: IntegrativeCareProduct) {
    const action = product.status === 'published' ? 'unpublish' : 'publish';
    const confirmed = window.confirm(
      `${action === 'publish' ? 'Publish' : 'Unpublish'} "${product.title || product.productSlug}"?`,
    );
    if (!confirmed) return;

    const res = await fetch(`/api/admin/integrative-care/${product.productSlug}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (!json.success) { setError(json.error ?? 'Status change failed'); return; }

    setProducts((prev) =>
      prev.map((p) =>
        p.productSlug === product.productSlug ? { ...p, status: json.status } : p,
      ),
    );
  }

  return (
    <>
      <Head>
        <title>Integrative Care Products · Admin</title>
      </Head>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Integrative Care</h1>
            <p className="mt-1 text-sm text-gray-500">
              Product pages at <code className="bg-gray-100 px-1 rounded">/integrative-care/[slug]</code>
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Product table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-10 overflow-hidden">
          {products.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              No products yet. Create one below.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Sort</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => (
                  <tr key={product.productSlug} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{product.title || '—'}</div>
                      <div className="text-gray-400 font-mono text-xs mt-0.5">{product.productSlug}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        product.status === 'published'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{product.sortOrder}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/admin/integrative-care/${product.productSlug}`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/admin/integrative-care/${product.productSlug}/composition`}
                          className="text-purple-600 hover:text-purple-800 font-medium"
                        >
                          Composition
                        </Link>
                        <a
                          href={`/admin/integrative-care/${product.productSlug}/preview`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-500 hover:text-gray-700 font-medium"
                        >
                          Preview ↗
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(product.productSlug)}
                          disabled={duplicating === product.productSlug}
                          className="text-gray-500 hover:text-gray-700 font-medium disabled:opacity-40"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePublishToggle(product)}
                          className={`font-medium ${
                            product.status === 'published'
                              ? 'text-yellow-600 hover:text-yellow-800'
                              : 'text-green-600 hover:text-green-800'
                          }`}
                        >
                          {product.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create new product */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Create new product</h2>
          <p className="text-sm text-gray-500 mb-4">
            Creates a draft product record and scaffolds a starter composition.
          </p>
          <form onSubmit={handleCreate} className="flex items-center gap-3">
            <input
              type="text"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="product-slug"
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
          <p className="mt-2 text-xs text-gray-400">
            Use lowercase letters, numbers, and hyphens only.
          </p>
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

  const products = await listIntegrativeCareProducts(false);
  return { props: { products } };
};
