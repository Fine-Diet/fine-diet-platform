/**
 * Admin Page: Foods List
 * 
 * List and manage foods in the database. Supports filtering, search, and actions.
 * Protected: requires admin or editor role
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';
import type { AdminFoodObject, AdminFoodListResponse, FoodSourceProvider } from '@/lib/admin/foodTypes';

interface AdminFoodsProps {
  user: AuthenticatedUser;
}

const PROVIDERS: { value: FoodSourceProvider | ''; label: string }[] = [
  { value: '', label: 'All Providers' },
  { value: 'fine_diet', label: 'Fine Diet' },
  { value: 'usda', label: 'USDA' },
  { value: 'user', label: 'User-created' },
  { value: 'scan', label: 'Scanned' },
];

export default function AdminFoods({ user }: AdminFoodsProps) {
  const [foods, setFoods] = useState<AdminFoodObject[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<FoodSourceProvider | ''>('');
  const [verified, setVerified] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchFoods = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('query', query.trim());
      if (provider) params.set('provider', provider);
      if (verified) params.set('verified', verified);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      const response = await fetch(`/api/admin/foods?${params.toString()}`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch foods');
      }

      const data: AdminFoodListResponse = await response.json();
      setFoods(data.foods);
      setTotal(data.total);
    } catch (err) {
      console.error('Error fetching foods:', err);
      setError(err instanceof Error ? err.message : 'Failed to load foods');
    } finally {
      setLoading(false);
    }
  }, [query, provider, verified, page]);

  useEffect(() => {
    fetchFoods();
  }, [fetchFoods]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [query, provider, verified]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      const response = await fetch(`/api/admin/foods/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete food');
      }
      // Refresh list
      fetchFoods();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete food');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <Head>
        <title>Foods • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Foods</h1>
                <p className="text-lg text-gray-600">
                  Manage Fine Diet foods, USDA imports, and user-created items.
                </p>
              </div>
              <div className="flex gap-3">
                <Link
                  href="/admin"
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  ← Back
                </Link>
                <Link
                  href="/admin/foods/import"
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Bulk Import
                </Link>
                <Link
                  href="/admin/foods/merge"
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Merge Tool
                </Link>
                <Link
                  href="/admin/foods/new"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  + New Food
                </Link>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, brand, or UPC..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              <div className="w-48">
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as FoodSourceProvider | '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="w-36">
                <label className="block text-sm font-medium text-gray-700 mb-1">Verified</label>
                <select
                  value={verified}
                  onChange={(e) => setVerified(e.target.value as '' | 'true' | 'false')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                >
                  <option value="">Any</option>
                  <option value="true">Verified</option>
                  <option value="false">Not Verified</option>
                </select>
              </div>
              <button
                onClick={() => {
                  setQuery('');
                  setProvider('');
                  setVerified('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Results count */}
          <div className="mb-4 text-sm text-gray-600">
            {loading ? 'Loading...' : `${total.toLocaleString()} foods found`}
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verified</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Calories</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td>
                    </tr>
                  ) : foods.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No foods found.</td>
                    </tr>
                  ) : (
                    foods.map((food) => (
                      <tr key={food.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link href={`/admin/foods/${food.id}`} className="text-blue-600 hover:underline font-medium">
                            {food.canonical_name}
                          </Link>
                          {food.upc && <div className="text-xs text-gray-400 mt-0.5">UPC: {food.upc}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{food.brand_name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                            food.source_provider === 'fine_diet' ? 'bg-purple-100 text-purple-800' :
                            food.source_provider === 'usda' ? 'bg-blue-100 text-blue-800' :
                            food.source_provider === 'user' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {food.source_provider || 'unknown'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {food.is_verified ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {food.calories !== null ? `${food.calories} kcal` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(food.updated_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/admin/foods/${food.id}`}
                              className="text-sm text-blue-600 hover:underline"
                            >
                              Edit
                            </Link>
                            <button
                              onClick={() => handleDelete(food.id, food.canonical_name)}
                              className="text-sm text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Page {page + 1} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AdminFoodsProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
    return {
      redirect: {
        destination: '/admin/unauthorized',
        permanent: false,
      },
    };
  }

  return {
    props: { user },
  };
};
