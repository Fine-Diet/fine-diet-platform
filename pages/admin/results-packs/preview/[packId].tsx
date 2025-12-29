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

          {/* Preview Content - Matches Runtime Flow-First Mapping */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 space-y-8">
            {/* Determine content using same logic as runtime */}
            {(() => {
              const flow = resultsPack?.flow as any;
              const hasFlowV2 = flow && flow.page1 && flow.page2 && flow.page3 &&
                flow.page1.headline && flow.page1.body && flow.page1.snapshotBullets && flow.page1.meaningBody &&
                flow.page2.headline && flow.page2.stepBullets && flow.page2.videoCtaLabel &&
                flow.page3.problemHeadline && flow.page3.problemBody && flow.page3.tryBullets &&
                flow.page3.methodTitle && flow.page3.methodBody && flow.page3.methodLearnBullets &&
                flow.page3.methodCtaLabel && flow.page3.methodEmailLinkLabel;

              const hasLegacyFields = resultsPack && (
                resultsPack.summary &&
                resultsPack.keyPatterns &&
                resultsPack.firstFocusAreas
              );

              if (!hasFlowV2 && !hasLegacyFields) {
                return (
                  <div className="text-center text-gray-500 py-8">
                    <p>This pack does not have Flow v2 or legacy fields. Cannot render preview.</p>
                  </div>
                );
              }

              // Get content using same helpers as runtime
              const page1 = hasFlowV2 && flow.page1 ? {
                headline: flow.page1.headline,
                body: flow.page1.body,
                snapshotTitle: flow.page1.snapshotTitle || "What We're Seeing",
                snapshotBullets: flow.page1.snapshotBullets,
                meaningTitle: flow.page1.meaningTitle || "What This Often Means",
                meaningBody: flow.page1.meaningBody,
              } : {
                headline: resultsPack.label,
                body: [resultsPack.summary || ''],
                snapshotTitle: "What We're Seeing",
                snapshotBullets: resultsPack.keyPatterns?.slice(0, 3) || ['', '', ''],
                meaningTitle: "What This Often Means",
                meaningBody: resultsPack.methodPositioning || 'Generic gut advice assumes the same inputs produce the same outcomes for everyone.',
              };

              const page2 = hasFlowV2 && flow.page2 ? {
                headline: flow.page2.headline || 'First Steps',
                stepBullets: flow.page2.stepBullets,
                videoCtaLabel: flow.page2.videoCtaLabel,
              } : {
                headline: 'First Steps',
                stepBullets: resultsPack.firstFocusAreas?.slice(0, 3) || ['', '', ''],
                videoCtaLabel: 'Watch Your Gut Pattern Breakdown',
              };

              const page3 = hasFlowV2 && flow.page3 ? {
                problemHeadline: flow.page3.problemHeadline,
                problemBody: flow.page3.problemBody,
                tryTitle: flow.page3.tryTitle,
                tryBullets: flow.page3.tryBullets,
                tryCloser: flow.page3.tryCloser,
                mechanismTitle: flow.page3.mechanismTitle,
                mechanismBodyTop: flow.page3.mechanismBodyTop,
                mechanismBodyBottom: flow.page3.mechanismBodyBottom,
                methodTitle: flow.page3.methodTitle,
                methodBody: flow.page3.methodBody,
                methodLearnTitle: flow.page3.methodLearnTitle || "In the video, you'll learn",
                methodLearnBullets: flow.page3.methodLearnBullets,
                methodCtaLabel: flow.page3.methodCtaLabel,
                methodEmailLinkLabel: flow.page3.methodEmailLinkLabel,
              } : {
                problemHeadline: 'Most gut advice ignores patterns like this.',
                problemBody: ['Generic digestive advice assumes that the same inputs produce the same outcomes for everyone.'],
                tryTitle: 'What most people try',
                tryBullets: ['Trying to fix symptoms instead of understanding signals', 'Chasing consistency through control', 'Interpreting fluctuation as failure'],
                tryCloser: 'This is where many people get stuck.',
                mechanismTitle: 'The Fine Diet Method',
                mechanismBodyTop: 'The Fine Diet Method was built around a different starting point.',
                mechanismBodyBottom: 'Instead of asking, "What should I add or remove?" it begins with, "What pattern is present — and what does it need to stabilize over time?"',
                methodTitle: 'Learn The Fine Diet Method',
                methodBody: ['That distinction matters. And it\'s the foundation for making changes that actually hold.'],
                methodLearnTitle: "In the video, you'll learn",
                methodLearnBullets: ['How to identify your specific gut pattern', 'What your pattern needs to stabilize', 'How to make changes that actually hold'],
                methodCtaLabel: 'Watch How The Fine Diet Method Works',
                methodEmailLinkLabel: 'Email me the link',
              };

              return (
                <>
                  <div className="mb-8 pb-4 border-b border-gray-300">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">3-Page Flow Preview</h2>
                    <p className="text-sm text-gray-600">
                      {hasFlowV2 ? 'Rendering from Flow v2' : 'Rendering from Legacy fields (fallback)'}
                    </p>
                  </div>

                  {/* Page 1 Preview */}
                  <div className="border-t border-gray-200 pt-8">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Page 1: Pattern Read</h3>
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-gray-800">{page1.headline}</h4>
                      {page1.body && page1.body.length > 0 && (
                        <div className="space-y-2">
                          {page1.body.map((p, idx) => (
                            <p key={idx} className="text-gray-700 leading-relaxed">{p}</p>
                          ))}
                        </div>
                      )}
                      {page1.snapshotTitle && (
                        <div className="mt-4">
                          <h5 className="font-semibold text-gray-900 mb-2">{page1.snapshotTitle}</h5>
                          <ul className="list-disc list-inside space-y-1 text-gray-700">
                            {page1.snapshotBullets.map((b, idx) => (
                              <li key={idx}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {page1.meaningTitle && (
                        <div className="mt-4">
                          <h5 className="font-semibold text-gray-900 mb-2">{page1.meaningTitle}</h5>
                          <p className="text-gray-700 leading-relaxed">{page1.meaningBody}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Page 2 Preview */}
                  <div className="border-t border-gray-200 pt-8">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Page 2: First Steps + Utilities</h3>
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-gray-800">{page2.headline}</h4>
                      <ul className="list-disc list-inside space-y-1 text-gray-700">
                        {page2.stepBullets.map((b, idx) => (
                          <li key={idx}>{b}</li>
                        ))}
                      </ul>
                      <p className="text-sm text-gray-600 mt-4">Video CTA: {page2.videoCtaLabel}</p>
                      <p className="text-sm text-gray-600">Email capture and PDF download utilities will appear here.</p>
                    </div>
                  </div>

                  {/* Page 3 Preview */}
                  <div className="border-t border-gray-200 pt-8">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Page 3: Narrative Close + Method CTA</h3>
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-gray-800">{page3.problemHeadline}</h4>
                      {page3.problemBody && page3.problemBody.length > 0 && (
                        <div className="space-y-2">
                          {page3.problemBody.map((p, idx) => (
                            <p key={idx} className="text-gray-700 leading-relaxed">{p}</p>
                          ))}
                        </div>
                      )}
                      {page3.tryTitle && (
                        <div className="mt-4">
                          <h5 className="font-semibold text-gray-900 mb-2">{page3.tryTitle}</h5>
                          <ul className="list-disc list-inside space-y-1 text-gray-700">
                            {page3.tryBullets.map((b, idx) => (
                              <li key={idx}>{b}</li>
                            ))}
                          </ul>
                          {page3.tryCloser && (
                            <p className="text-gray-700 italic mt-2">{page3.tryCloser}</p>
                          )}
                        </div>
                      )}
                      {page3.mechanismTitle && (
                        <div className="mt-4">
                          <h5 className="font-semibold text-gray-900 mb-2">{page3.mechanismTitle}</h5>
                          <p className="text-gray-700 leading-relaxed mb-2">{page3.mechanismBodyTop}</p>
                          <p className="text-gray-700 leading-relaxed">{page3.mechanismBodyBottom}</p>
                        </div>
                      )}
                      {page3.methodTitle && (
                        <div className="mt-4">
                          <h5 className="font-semibold text-gray-900 mb-2">{page3.methodTitle}</h5>
                          {page3.methodBody && page3.methodBody.length > 0 && (
                            <div className="space-y-2">
                              {page3.methodBody.map((p, idx) => (
                                <p key={idx} className="text-gray-700 leading-relaxed">{p}</p>
                              ))}
                            </div>
                          )}
                          {page3.methodLearnTitle && (
                            <div className="mt-4">
                              <h6 className="font-semibold text-gray-900 mb-2">{page3.methodLearnTitle}</h6>
                              <ul className="list-disc list-inside space-y-1 text-gray-700">
                                {page3.methodLearnBullets.map((b, idx) => (
                                  <li key={idx}>{b}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <p className="text-sm text-gray-600 mt-4">Method CTA: {page3.methodCtaLabel}</p>
                          <p className="text-sm text-gray-600">Email Link: {page3.methodEmailLinkLabel}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
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

