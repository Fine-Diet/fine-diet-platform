/**
 * Admin Page: Results Pack Preview
 * 
 * Shows a formatted, readable preview of a results pack.
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import { useRouter } from 'next/router';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';

interface PreviewPageProps {
  user: AuthenticatedUser | null;
  packId: string;
}

export default function ResultsPackPreviewPage({ user, packId }: PreviewPageProps) {
  const router = useRouter();
  const [resultsPack, setResultsPack] = useState<ResultsPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [packInfo, setPackInfo] = useState<{ assessmentType: string; resultsVersion: string; levelId: string } | null>(null);

  // Defensive check for unauthorized users
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Results Pack Preview • Fine Diet Admin</title>
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

  useEffect(() => {
    async function loadPreview() {
      try {
        setLoading(true);
        setError(null);

        // First, get the pack details
        const detailResponse = await fetch(`/api/admin/results-packs/${packId}`);
        if (!detailResponse.ok) {
          throw new Error('Failed to fetch results pack details');
        }

        const detailData = await detailResponse.json();
        setPackInfo({
          assessmentType: detailData.resultsPack.assessmentType,
          resultsVersion: detailData.resultsPack.resultsVersion,
          levelId: detailData.resultsPack.levelId,
        });

        // Build query params for results pack resolve
        const params = new URLSearchParams({
          assessmentType: detailData.resultsPack.assessmentType,
          resultsVersion: detailData.resultsPack.resultsVersion,
          levelId: detailData.resultsPack.levelId,
          preview: '1',
        });

        // Resolve the pack (will use preview revision if set)
        const resolveResponse = await fetch(`/api/results-packs/resolve?${params.toString()}`);
        if (!resolveResponse.ok) {
          const resolveData = await resolveResponse.json();
          throw new Error(resolveData.error || 'Failed to resolve results pack');
        }

        const resolveData = await resolveResponse.json();
        setResultsPack(resolveData.pack);
      } catch (err) {
        console.error('Error loading preview:', err);
        setError(err instanceof Error ? err.message : 'Failed to load preview');
      } finally {
        setLoading(false);
      }
    }

    if (packId) {
      loadPreview();
    }
  }, [packId]);

  if (loading) {
    return (
      <>
        <Head>
          <title>Results Pack Preview • Fine Diet Admin</title>
        </Head>
        <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-600">Loading preview...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error || !resultsPack) {
    return (
      <>
        <Head>
          <title>Results Pack Preview • Fine Diet Admin</title>
        </Head>
        <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
              <div className="mb-4">
                <Link
                  href="/admin/results-packs"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  ← Back to Results Packs
                </Link>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error || 'Results pack not found'}</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Results Pack Preview • Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/admin/results-packs"
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to Results Packs
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Results Pack Preview</h1>
                {packInfo && (
                  <p className="text-lg text-gray-600">
                    {packInfo.assessmentType} v{packInfo.resultsVersion} • {packInfo.levelId}
                  </p>
                )}
              </div>
              <Link
                href={`/admin/results-packs/${packId}`}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Manage Pack
              </Link>
            </div>
          </div>

          {/* Preview Content */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 space-y-8">
            {/* Label */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{resultsPack.label}</h2>
            </div>

            {/* Summary */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Summary</h3>
              <p className="text-gray-700 leading-relaxed">{resultsPack.summary}</p>
            </div>

            {/* Key Patterns */}
            {resultsPack.keyPatterns && resultsPack.keyPatterns.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Key Patterns</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  {resultsPack.keyPatterns.map((pattern, index) => (
                    <li key={index}>{pattern}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* First Focus Areas */}
            {resultsPack.firstFocusAreas && resultsPack.firstFocusAreas.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">First Focus Areas</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  {resultsPack.firstFocusAreas.map((area, index) => (
                    <li key={index}>{area}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Method Positioning */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Method Positioning</h3>
              <p className="text-gray-700 leading-relaxed">{resultsPack.methodPositioning}</p>
            </div>

            {/* Flow (if present) */}
            {resultsPack.flow && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Flow Content</h3>
                <div className="space-y-6">
                  {Object.entries(resultsPack.flow).map(([pageKey, pageContent]: [string, any]) => (
                    <div key={pageKey} className="border-t border-gray-200 pt-6">
                      <h4 className="text-md font-semibold text-gray-900 mb-2">{pageKey}</h4>
                      {pageContent.headline && (
                        <h5 className="text-lg font-medium text-gray-800 mb-2">{pageContent.headline}</h5>
                      )}
                      {pageContent.body && Array.isArray(pageContent.body) && (
                        <div className="space-y-2 mb-4">
                          {pageContent.body.map((paragraph: string, idx: number) => (
                            <p key={idx} className="text-gray-700 leading-relaxed">{paragraph}</p>
                          ))}
                        </div>
                      )}
                      {pageContent.snapshotTitle && (
                        <div className="mt-4">
                          <h6 className="font-semibold text-gray-900 mb-2">{pageContent.snapshotTitle}</h6>
                          {pageContent.snapshotBullets && (
                            <ul className="list-disc list-inside space-y-1 text-gray-700">
                              {pageContent.snapshotBullets.map((bullet: string, idx: number) => (
                                <li key={idx}>{bullet}</li>
                              ))}
                            </ul>
                          )}
                          {pageContent.snapshotCloser && (
                            <p className="mt-2 text-gray-700 italic">{pageContent.snapshotCloser}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PreviewPageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null, packId: '' } };
  }
  const packId = context.params?.packId as string;
  return { props: { user, packId } };
};

