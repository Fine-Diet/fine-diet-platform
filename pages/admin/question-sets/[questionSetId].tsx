/**
 * Admin Page: Question Set Detail / Manage
 * 
 * Shows question set details, revisions, and allows setting preview/publish pointers.
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';

interface QuestionSetDetail {
  id: string;
  assessmentType: string;
  assessmentVersion: string;
  locale: string | null;
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
  notes: string | null;
}

interface DetailPageProps {
  user: AuthenticatedUser | null;
  questionSetId: string;
}

export default function QuestionSetDetailPage({ user, questionSetId }: DetailPageProps) {
  const router = useRouter();
  const [questionSet, setQuestionSet] = useState<QuestionSetDetail | null>(null);
  const [pointers, setPointers] = useState<PointerInfo | null>(null);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>('');

  // Defensive check for unauthorized users
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Question Set • Fine Diet Admin</title>
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
      const response = await fetch(`/api/admin/question-sets/${questionSetId}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch question set');
      }

      const data = await response.json();
      setQuestionSet(data.questionSet);
      setPointers(data.pointers);
      setRevisions(data.revisions || []);
    } catch (err) {
      console.error('Error fetching question set:', err);
      setError(err instanceof Error ? err.message : 'Failed to load question set');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (questionSetId) {
      fetchData();
    }
  }, [questionSetId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const handleSetPreview = async (revisionId: string) => {
    try {
      setActionLoading((prev) => new Set(prev).add(`preview-${revisionId}`));
      setError(null);
      setSuccessMessage(null);

      const response = await fetch('/api/admin/question-set-pointers/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionSetId, revisionId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set preview');
      }

      setSuccessMessage('Preview pointer updated successfully');
      await fetchData();
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
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
    try {
      setActionLoading((prev) => new Set(prev).add(`publish-${revisionId}`));
      setError(null);
      setSuccessMessage(null);

      const response = await fetch('/api/admin/question-set-pointers/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionSetId, revisionId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to publish revision');
      }

      setSuccessMessage('Revision published successfully');
      await fetchData();
      // Clear success message after 5 seconds
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

  if (!questionSet) {
    return (
      <>
        <Head>
          <title>Question Set • Fine Diet Admin</title>
        </Head>
        <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            {loading ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <p className="text-gray-600">Loading question set...</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <p className="text-gray-600">Question set not found.</p>
                <Link
                  href="/admin/question-sets"
                  className="mt-4 inline-block text-blue-600 hover:text-blue-800 underline"
                >
                  ← Back to Question Sets
                </Link>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  const previewUrl = `/api/question-sets/resolve?assessmentType=${encodeURIComponent(
    questionSet.assessmentType
  )}&assessmentVersion=${encodeURIComponent(questionSet.assessmentVersion)}${
    questionSet.locale ? `&locale=${encodeURIComponent(questionSet.locale)}` : ''
  }&preview=1`;

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
        <title>Question Set • Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/admin/question-sets"
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to Question Sets
            </Link>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Question Set</h1>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
              <p className="text-sm text-green-800">{successMessage}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Question Set Identity */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Identity</h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Assessment Type</dt>
                <dd className="mt-1 text-sm text-gray-900">{questionSet.assessmentType}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Version</dt>
                <dd className="mt-1 text-sm text-gray-900">{questionSet.assessmentVersion}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Locale</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {questionSet.locale || <span className="text-gray-400">default</span>}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Updated At</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(questionSet.updatedAt).toLocaleString('en-US')}
                </dd>
              </div>
            </dl>
          </div>

          {/* Current Pointers */}
          {pointers && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Pointers</h2>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Published Revision</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {pointers.publishedRevisionId ? (
                      <span className="font-medium">
                        Revision #{revisions.find((r) => r.id === pointers.publishedRevisionId)?.revisionNumber || '?'}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not published</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Preview Revision</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {pointers.previewRevisionId ? (
                      <span className="font-medium text-blue-600">
                        Revision #{revisions.find((r) => r.id === pointers.previewRevisionId)?.revisionNumber || '?'}
                      </span>
                    ) : (
                      <span className="text-gray-400">No preview set</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Preview URL Widget */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Preview URL</h2>
            <p className="text-sm text-gray-600 mb-3">
              Use this URL to preview the question set (requires editor/admin login):
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-blue-300 rounded px-3 py-2 text-sm text-gray-800 break-all">
                {origin}
                {previewUrl}
              </code>
              <button
                onClick={() => {
                  const fullUrl = `${origin}${previewUrl}`;
                  navigator.clipboard.writeText(fullUrl);
                  setSuccessMessage('Preview URL copied to clipboard');
                  setTimeout(() => setSuccessMessage(null), 3000);
                }}
                className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Revisions Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Revisions</h2>
            </div>
            {revisions.length === 0 ? (
              <div className="p-8 text-center text-gray-600">
                <p>No revisions found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Revision #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Content Hash
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created At
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Notes
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {revisions.map((revision) => {
                      const status = getRevisionStatus(revision);
                      const isPreviewLoading = actionLoading.has(`preview-${revision.id}`);
                      const isPublishLoading = actionLoading.has(`publish-${revision.id}`);
                      const isPublished = pointers?.publishedRevisionId === revision.id;
                      const isPreview = pointers?.previewRevisionId === revision.id;

                      return (
                        <tr key={revision.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            #{revision.revisionNumber}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {status === 'published' && (
                              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                                Published
                              </span>
                            )}
                            {status === 'preview' && (
                              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                                Preview
                              </span>
                            )}
                            {status === 'draft' && (
                              <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                                Draft
                              </span>
                            )}
                            {status === 'archived' && (
                              <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                                Archived
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono text-xs">
                            {revision.contentHash.substring(0, 8)}...
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {new Date(revision.createdAt).toLocaleString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {revision.notes || <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            {!isPreview && (
                              <button
                                onClick={() => handleSetPreview(revision.id)}
                                disabled={isPreviewLoading || isPublishLoading}
                                className="text-blue-600 hover:text-blue-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                              >
                                {isPreviewLoading ? 'Loading...' : 'Set Preview'}
                              </button>
                            )}
                            {isPreview && (
                              <span className="text-blue-600 text-sm">Preview Active</span>
                            )}
                            {!isPublished && (
                              <>
                                {user.role === 'admin' ? (
                                  <button
                                    onClick={() => handlePublish(revision.id)}
                                    disabled={isPreviewLoading || isPublishLoading}
                                    className="text-green-600 hover:text-green-900 disabled:text-gray-400 disabled:cursor-not-allowed ml-2"
                                  >
                                    {isPublishLoading ? 'Loading...' : 'Publish'}
                                  </button>
                                ) : (
                                  <span className="text-gray-400 text-sm ml-2">Admin only</span>
                                )}
                              </>
                            )}
                            {isPublished && (
                              <span className="text-green-600 text-sm">Published</span>
                            )}
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
    return { props: { user: null, questionSetId: '' } };
  }

  const questionSetId = context.params?.questionSetId;
  if (!questionSetId || typeof questionSetId !== 'string') {
    return {
      notFound: true,
    };
  }

  return { props: { user, questionSetId } };
};

