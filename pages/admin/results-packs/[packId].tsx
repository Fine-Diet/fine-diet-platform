/**
 * Admin Page: Results Pack Detail / Manage
 * 
 * Shows results pack details, revisions, and allows setting preview/publish pointers.
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';

interface ResultsPackDetail {
  id: string;
  assessmentType: string;
  resultsVersion: string;
  levelId: string;
  createdAt: string;
  updatedAt: string;
}

interface PointerInfo {
  publishedRevisionId: string | null;
  previewRevisionId: string | null;
  updatedAt: string | null;
}

interface RevisionItem {
  id: string;
  revisionNumber: number;
  status: 'draft' | 'published' | 'archived';
  contentHash: string;
  createdAt: string;
  changeSummary: string | null;
  validationErrors: any | null;
}

interface DetailPageProps {
  user: AuthenticatedUser | null;
  packId: string;
}

export default function ResultsPackDetailPage({ user, packId }: DetailPageProps) {
  const router = useRouter();
  const [resultsPack, setResultsPack] = useState<ResultsPackDetail | null>(null);
  const [pointers, setPointers] = useState<PointerInfo | null>(null);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Defensive check for unauthorized users
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Results Pack • Fine Diet Admin</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Admin</h1>
            <p className="text-lg text-gray-600 mb-8">
              You don't have permission to access this area.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Return to Home
            </Link>
          </div>
        </main>
      </>
    );
  }

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/admin/results-packs/${packId}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch results pack');
      }

      const data = await response.json();
      setResultsPack(data.resultsPack);
      setPointers(data.pointers);
      setRevisions(data.revisions || []);
    } catch (err) {
      console.error('Error fetching results pack:', err);
      setError(err instanceof Error ? err.message : 'Failed to load results pack');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (packId) {
      fetchData();
    }
  }, [packId]);

  const handleSetPreview = async (revisionId: string) => {
    try {
      setActionLoading((prev) => new Set(prev).add(`preview-${revisionId}`));
      setError(null);
      setSuccessMessage(null);

      const response = await fetch(`/api/admin/results-packs/${packId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision_id: revisionId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set preview');
      }

      setSuccessMessage('Preview pointer updated successfully');
      await fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
      
      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Error setting preview:', err);
      setError(err instanceof Error ? err.message : 'Failed to set preview');
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(`preview-${revisionId}`);
        return next;
      });
    }
  };

  const handlePublish = async (revisionId: string) => {
    if (!confirm('Are you sure you want to publish this revision? This will make it live for all users.')) {
      return;
    }

    try {
      setActionLoading((prev) => new Set(prev).add(`publish-${revisionId}`));
      setError(null);
      setSuccessMessage(null);

      const response = await fetch(`/api/admin/results-packs/${packId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision_id: revisionId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to publish revision');
      }

      setSuccessMessage('Revision published successfully');
      await fetchData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error publishing revision:', err);
      setError(err instanceof Error ? err.message : 'Failed to publish revision');
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(`publish-${revisionId}`);
        return next;
      });
    }
  };

  if (!resultsPack) {
    return (
      <>
        <Head>
          <title>Results Pack • Fine Diet Admin</title>
        </Head>
        <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            {loading ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <p className="text-gray-600">Loading results pack...</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <p className="text-gray-600">Results pack not found.</p>
                <Link
                  href="/admin/results-packs"
                  className="mt-4 inline-block text-blue-600 hover:text-blue-800 underline"
                >
                  ← Back to Results Packs
                </Link>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  const getRevisionStatus = (revision: RevisionItem) => {
    if (pointers?.publishedRevisionId === revision.id) {
      return 'published';
    }
    if (pointers?.previewRevisionId === revision.id) {
      return 'preview';
    }
    return revision.status;
  };

  return (
    <>
      <Head>
        <title>Results Pack • Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/admin/results-packs"
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to Results Packs
            </Link>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Results Pack</h1>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
              <div className="flex items-center justify-between">
                <p className="text-sm text-green-800">{successMessage}</p>
                {successMessage.includes('Preview') && pointers?.previewRevisionId && (
                  <Link
                    href={`/admin/results-packs/preview/${packId}`}
                    className="ml-4 px-3 py-1 text-sm font-medium text-green-800 bg-green-100 rounded hover:bg-green-200 transition-colors"
                  >
                    View Preview →
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Pack Identity */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Pack Identity</h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Assessment Type</dt>
                <dd className="mt-1 text-sm text-gray-900">{resultsPack.assessmentType}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Results Version</dt>
                <dd className="mt-1 text-sm text-gray-900">{resultsPack.resultsVersion}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Level ID</dt>
                <dd className="mt-1 text-sm text-gray-900">{resultsPack.levelId}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Created At</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(resultsPack.createdAt).toLocaleString('en-US')}
                </dd>
              </div>
            </dl>
          </div>

          {/* Pointers */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Pointers</h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Published Revision</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {pointers?.publishedRevisionId ? (
                    <span className="font-medium text-green-600">
                      {revisions.find((r) => r.id === pointers.publishedRevisionId)?.revisionNumber || 'Unknown'}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not set</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Preview Revision</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {pointers?.previewRevisionId ? (
                    <span className="font-medium text-blue-600">
                      {revisions.find((r) => r.id === pointers.previewRevisionId)?.revisionNumber || 'Unknown'}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not set</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Revisions */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Revisions</h2>
              <Link
                href={`/admin/results-packs/edit/${revisions[0]?.id || packId}`}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                Create New Revision
              </Link>
            </div>
            {revisions.length === 0 ? (
              <p className="text-gray-600 text-sm">No revisions found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Revision
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created At
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Change Summary
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {revisions.map((revision) => {
                      const status = getRevisionStatus(revision);
                      const isPublished = status === 'published';
                      const isPreview = status === 'preview';
                      const isLoading = actionLoading.has(`preview-${revision.id}`) || actionLoading.has(`publish-${revision.id}`);

                      return (
                        <tr key={revision.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            #{revision.revisionNumber}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {isPublished ? (
                              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                                Published
                              </span>
                            ) : isPreview ? (
                              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                                Preview
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                                {revision.status}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {new Date(revision.createdAt).toLocaleString('en-US')}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {revision.changeSummary || <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                            {!isPreview && (
                              <button
                                onClick={() => handleSetPreview(revision.id)}
                                disabled={isLoading}
                                className="text-blue-600 hover:text-blue-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                              >
                                Set Preview
                              </button>
                            )}
                            {!isPublished && user.role === 'admin' && (
                              <button
                                onClick={() => handlePublish(revision.id)}
                                disabled={isLoading}
                                className="text-green-600 hover:text-green-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                              >
                                Publish
                              </button>
                            )}
                            <Link
                              href={`/admin/results-packs/edit/${revision.id}`}
                              className="text-gray-600 hover:text-gray-900"
                            >
                              Edit
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<DetailPageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null, packId: '' } };
  }
  const packId = context.params?.packId as string;
  return { props: { user, packId } };
};

