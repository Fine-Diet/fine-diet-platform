/**
 * Results Screen Component
 * Displays assessment results with avatar insights
 * Authoritative: Reads from database via submission_id query param
 * 
 * For v2 results packs with flow.page1/page2/page3, renders 3-screen navigation.
 * For v1 results packs (no flow), falls back to single-page rendering.
 */

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { ResultsIntro } from './ResultsIntro';
import { ResultsMechanism } from './ResultsMechanism';
import { ResultsMethod } from './ResultsMethod';
import { EmailCaptureInline } from './EmailCaptureInline';
import { Button } from '@/components/ui/Button';
import { trackResultsScrolled, trackMethodVslClicked } from '@/lib/assessmentAnalytics';
import { loadResultsPack, type ResultsPack } from '@/lib/assessments/results/loadResultsPack';
import { GUT_CHECK_RESULTS_CONTENT_VERSION } from '@/lib/assessments/results/constants';

interface SubmissionData {
  id: string;
  primary_avatar: string;
  secondary_avatar?: string | null;
  score_map: Record<string, number>;
  normalized_score_map: Record<string, number>;
  confidence_score: number;
  assessment_type: string;
  assessment_version: number;
  session_id: string;
}

export function ResultsScreen() {
  const router = useRouter();
  const { submission_id } = router.query;
  const [submissionData, setSubmissionData] = useState<SubmissionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultsPack, setResultsPack] = useState<ResultsPack | null>(null);
  const [screenIndex, setScreenIndex] = useState<0 | 1 | 2>(0);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const hasTrackedScroll = useRef(false);
  const hasInitializedScreen = useRef(false);

  // Fetch submission data from API (authoritative source)
  useEffect(() => {
    async function fetchSubmission() {
      if (!submission_id || typeof submission_id !== 'string') {
        setError('Missing submission ID');
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/assessments/submission?submission_id=${submission_id}`);
        const result = await response.json();

        if (!result.success || !result.data) {
          setError(result.error || 'Failed to load submission');
          setIsLoading(false);
          return;
        }

        setSubmissionData(result.data);
      } catch (err) {
        console.error('Error fetching submission:', err);
        setError('Failed to load results. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchSubmission();
  }, [submission_id]);

  // Load results pack when submission data is available
  useEffect(() => {
    if (!submissionData?.primary_avatar || !submissionData?.assessment_type) return;

    // primary_avatar contains levelId or avatar ID (will be normalized by loader)
    const levelId = submissionData.primary_avatar;
    // Use constant for results content version (decoupled from assessment_version)
    const resultsVersion = GUT_CHECK_RESULTS_CONTENT_VERSION;

    try {
      const pack = loadResultsPack({
        assessmentType: submissionData.assessment_type,
        resultsVersion: resultsVersion,
        levelId: levelId,
      });

      if (!pack) {
        console.error(`Failed to load results pack for levelId: ${levelId}, version: ${resultsVersion}`);
        setError(`Unable to load results content for this assessment result. Please contact support if this issue persists.`);
        setIsLoading(false);
        return;
      }

      setResultsPack(pack);
      setIsLoading(false);
    } catch (err) {
      console.error('Error loading results pack:', err);
      setError(`Unable to load results content. Please try again or contact support if this issue persists.`);
      setIsLoading(false);
    }
  }, [submissionData]);

  // Initialize screenIndex from query param (only for v2 with flow, only once)
  useEffect(() => {
    if (!resultsPack || !router.isReady || hasInitializedScreen.current) return;
    
    // Check if pack has flow structure (v2)
    const hasFlowCheck = resultsPack?.flow && (
      (resultsPack.flow as any).page1 || 
      ((resultsPack.flow as any).pages && Array.isArray((resultsPack.flow as any).pages))
    );
    
    // Only initialize from query param if flow exists (v2)
    if (hasFlowCheck && submissionData) {
      const screenParam = router.query.screen;
      if (screenParam) {
        const screenNum = typeof screenParam === 'string' ? parseInt(screenParam, 10) : parseInt(screenParam[0], 10);
        // Convert screen=1,2,3 to screenIndex=0,1,2 and clamp
        if (screenNum >= 1 && screenNum <= 3) {
          setScreenIndex(Math.min(screenNum - 1, 2) as 0 | 1 | 2);
        }
      }
      hasInitializedScreen.current = true;
    } else if (!hasFlowCheck) {
      // For v1 (no flow), mark as initialized so we don't try again
      hasInitializedScreen.current = true;
    }
  }, [resultsPack, router.isReady, router.query.screen, submissionData]);

  // Track scroll
  useEffect(() => {
    if (!submissionData) return;

    const handleScroll = () => {
      if (!hasTrackedScroll.current && window.scrollY > 200) {
        trackResultsScrolled(
          'gut-check',
          submissionData.assessment_version,
          submissionData.session_id,
          submissionData.primary_avatar
        );
        hasTrackedScroll.current = true;
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [submissionData]);

  const handleEmailSubmit = async (email: string) => {
    // Update submission with email (non-blocking)
    // Note: This would require a separate endpoint or upsert logic
    // For now, we'll just track the event (email is captured in events)
    // The email can be updated via a separate PATCH endpoint if needed
    console.log('Email captured:', email);
  };

  // Update URL when screenIndex changes (only for v2 with flow)
  useEffect(() => {
    if (!resultsPack || !router.isReady || !submissionData?.id) return;
    
    // Calculate hasFlow locally in useEffect to avoid shadowing component-level variable
    const hasFlowCheck = resultsPack?.flow && (
      (resultsPack.flow as any).page1 || 
      ((resultsPack.flow as any).pages && Array.isArray((resultsPack.flow as any).pages))
    );
    
    if (hasFlowCheck) {
      const newScreen = screenIndex + 1; // Convert 0,1,2 to 1,2,3
      const currentScreen = router.query.screen;
      const currentScreenNum = currentScreen ? (typeof currentScreen === 'string' ? parseInt(currentScreen, 10) : parseInt(currentScreen[0], 10)) : 1;
      
      // Only update URL if it's different from current
      if (currentScreenNum !== newScreen) {
        router.replace(
          {
            pathname: router.pathname,
            query: { ...router.query, screen: newScreen },
          },
          undefined,
          { shallow: true }
        );
      }
    }
  }, [screenIndex, resultsPack, router, submissionData?.id]);

  // Navigation handlers
  const handleNext = () => {
    if (screenIndex < 2) {
      setScreenIndex((screenIndex + 1) as 0 | 1 | 2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (screenIndex > 0) {
      setScreenIndex((screenIndex - 1) as 0 | 1 | 2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // PDF download handler
  const handleDownloadPdf = async () => {
    // Get submission ID from submissionData or router query as fallback
    const submissionIdFromRoute = typeof submission_id === 'string' ? submission_id : undefined;
    const sid = submissionData?.id ?? submissionIdFromRoute;
    
    if (!sid || isDownloadingPdf) return;
    
    setIsDownloadingPdf(true);
    
    // Start download (non-blocking)
    fetch(`/api/assessments/results-pdf?submissionId=${sid}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to generate PDF');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fine-diet-gut-check-results-${sid}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.error('PDF download error:', err);
        // Don't block navigation even if PDF fails
      })
      .finally(() => {
        setIsDownloadingPdf(false);
      });
    
    // Immediately advance to screen 3 while download happens
    setScreenIndex(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Video watch handler
  const handleWatchVideo = () => {
    if (!submissionData?.id) return;
    
    // Build return URL with screen=3
    const currentPath = router.asPath.split('?')[0]; // Get path without query
    const returnTo = `${currentPath}?submission_id=${submissionData.id}&screen=3`;
    const encodedReturnTo = encodeURIComponent(returnTo);
    
    // Navigate to video page with returnTo param
    router.push(`/gut-pattern-breakdown?returnTo=${encodedReturnTo}`);
  };

  // Debug logging (must be before any early returns to satisfy Rules of Hooks)
  useEffect(() => {
    if (resultsPack && !error && submissionData) {
      const hasFlowCheck = resultsPack?.flow && (
        (resultsPack.flow as any).page1 || 
        ((resultsPack.flow as any).pages && Array.isArray((resultsPack.flow as any).pages))
      );
      console.log('[ResultsScreen Debug]', {
        hasFlow: hasFlowCheck,
        screenIndex,
        flowExists: !!resultsPack.flow,
        page1Exists: !!(resultsPack.flow as any)?.page1,
        routerScreen: router.query.screen,
      });
    }
  }, [resultsPack, screenIndex, router.query.screen, error, submissionData]);

  // Loading state (only show if still loading and no error)
  if (isLoading && !error) {
    return (
      <div className="min-h-screen bg-brand-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-dark_accent-500 border-t-transparent mb-4"></div>
          <p className="text-white text-lg">Loading results...</p>
        </div>
      </div>
    );
  }

  // Error state or missing pack
  if (error || !submissionData || !resultsPack) {
    return (
      <div className="min-h-screen bg-brand-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <h1 className="text-2xl font-bold text-white mb-4">Results Not Found</h1>
          <p className="text-neutral-300 mb-6">
            {error || 'Unable to load your assessment results. Please try again.'}
          </p>
          <button
            onClick={() => router.push('/gut-check')}
            className="bg-dark_accent-500 hover:bg-dark_accent-600 text-neutral-900 font-semibold px-6 py-3 rounded-full transition-colors"
          >
            Start New Assessment
          </button>
        </div>
      </div>
    );
  }

  // Get flow page content (v2 structure uses page1/page2/page3 keys)
  const flow = resultsPack?.flow as any;
  const getPageContent = (pageNum: 1 | 2 | 3) => {
    if (!flow) return null;
    // Support both page1/page2/page3 structure and pages array structure
    const pageKey = `page${pageNum}`;
    return flow[pageKey] || (flow.pages && flow.pages.find((p: any) => p.pageNumber === pageNum));
  };

  // Check if pack has flow structure (v2) or should use single-page (v1)
  const hasFlow = resultsPack?.flow && (
    (resultsPack.flow as any).page1 || 
    ((resultsPack.flow as any).pages && Array.isArray((resultsPack.flow as any).pages))
  );

  // Render 3-screen flow (v2) or single-page fallback (v1)
  if (hasFlow) {
    const page1Content = getPageContent(1);
    const page2Content = getPageContent(2);
    const page3Content = getPageContent(3);

    return (
      <div className="min-h-screen bg-brand-900">
        <div className="max-w-3xl mx-auto px-4 py-12">
          {/* Progress Tracker */}
          <div className="mb-8">
            <div className="flex items-center justify-center mb-4">
              <p className="text-neutral-300 text-sm antialiased">
                Results {screenIndex + 1} of 3
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className={`h-1 rounded-full transition-all ${
                    index <= screenIndex
                      ? 'bg-dark_accent-500 w-12'
                      : 'bg-neutral-700 w-12'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Screen 0: Page 1 Content - Pattern/Mechanism */}
          {screenIndex === 0 && page1Content && (
            <div>
              <div className="mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 antialiased">
                  {page1Content.headline || resultsPack.label}
                </h1>
                {page1Content.body && Array.isArray(page1Content.body) && (
                  <div className="space-y-4 mb-6">
                    {page1Content.body.map((paragraph: string, idx: number) => (
                      <p key={idx} className="text-lg text-neutral-200 antialiased">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                )}
                {page1Content.snapshotTitle && (
                  <div className="mt-8">
                    <h3 className="text-xl font-semibold text-white mb-4 antialiased">
                      {page1Content.snapshotTitle}
                    </h3>
                    {page1Content.snapshotBullets && Array.isArray(page1Content.snapshotBullets) && (
                      <ul className="space-y-2 mb-4">
                        {page1Content.snapshotBullets.map((bullet: string, idx: number) => (
                          <li key={idx} className="text-neutral-200 flex items-start antialiased">
                            <span className="text-dark_accent-500 mr-2">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {page1Content.snapshotCloser && (
                      <p className="text-neutral-300 italic antialiased">
                        {page1Content.snapshotCloser}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-center mt-8">
                <Button variant="primary" size="lg" onClick={handleNext}>
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Screen 1: Page 2 Content - First Steps, Video, Email, PDF */}
          {screenIndex === 1 && (
            <div className="pb-8">
              <div className="mb-8">
                {page2Content && (
                  <>
                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 antialiased">
                      {page2Content.headline}
                    </h1>
                    {page2Content.body && Array.isArray(page2Content.body) && (
                  <div className="space-y-4 mb-6">
                    {page2Content.body.map((paragraph: string, idx: number) => (
                      <p key={idx} className="text-lg text-neutral-200 antialiased">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                )}
                {page2Content.reframeTitle && (
                  <div className="mt-8 mb-6">
                    <h3 className="text-xl font-semibold text-white mb-3 antialiased">
                      {page2Content.reframeTitle}
                    </h3>
                    {page2Content.reframeBody && Array.isArray(page2Content.reframeBody) && (
                      <div className="space-y-2">
                        {page2Content.reframeBody.map((paragraph: string, idx: number) => (
                          <p key={idx} className="text-lg text-neutral-200 antialiased">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                    )}
                  </>
                )}

                {/* First Steps (if present in pack) */}
                {resultsPack.firstFocusAreas && resultsPack.firstFocusAreas.length > 0 && (
                  <div className="mt-8 mb-6">
                    <h3 className="text-xl font-semibold text-white mb-3 antialiased">
                      First Steps
                    </h3>
                    <ul className="space-y-2">
                      {resultsPack.firstFocusAreas.map((area, index) => (
                        <li key={index} className="text-neutral-200 flex items-start antialiased">
                          <span className="text-dark_accent-500 mr-2">•</span>
                          <span>{area}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Watch Video Button */}
                <div className="mt-8 mb-6">
                  <Button variant="primary" size="lg" onClick={handleWatchVideo}>
                    Watch Your Gut Pattern Breakdown
                  </Button>
                </div>

                {/* Email Capture */}
                <div className="mt-8 mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3 antialiased">
                    Email Your Results
                  </h3>
                  <EmailCaptureInline
                    assessmentType={submissionData.assessment_type}
                    assessmentVersion={submissionData.assessment_version}
                    sessionId={submissionData.session_id}
                    levelId={submissionData.primary_avatar}
                    resultsVersion={GUT_CHECK_RESULTS_CONTENT_VERSION}
                    submissionId={submissionData.id}
                    onSubmit={handleEmailSubmit}
                  />
                </div>

                {/* Download PDF Button - Always render, disable only if submission ID missing */}
                <div className="mt-8 mb-6 pb-4">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={handleDownloadPdf}
                    disabled={isDownloadingPdf || !submissionData?.id}
                  >
                    {isDownloadingPdf ? 'Preparing PDF…' : 'Download PDF'}
                  </Button>
                </div>

                {/* Account Save Messaging */}
                <div className="mt-8 pt-6 border-t border-neutral-700">
                  <p className="text-neutral-300 text-sm mb-3 antialiased">
                    Save your results to access them anytime.
                  </p>
                  <div className="flex gap-4 justify-center">
                    <a
                      href="/login"
                      className="text-dark_accent-500 hover:text-dark_accent-400 text-sm underline antialiased"
                    >
                      Already have an account? Log in
                    </a>
                    <span className="text-neutral-500">•</span>
                    <a
                      href="/login"
                      className="text-dark_accent-500 hover:text-dark_accent-400 text-sm underline antialiased"
                    >
                      Create an account to save your results
                    </a>
                  </div>
                </div>
              </div>
              <div className="flex justify-center gap-4 mt-8">
                <Button variant="tertiary" size="md" onClick={handleBack}>
                  Back
                </Button>
                <Button variant="primary" size="md" onClick={handleNext}>
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Screen 2: Page 3 Content - Next Step/Solution Alignment */}
          {screenIndex === 2 && page3Content && (
            <div>
              <div className="mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 antialiased">
                  {page3Content.headline}
                </h1>
                {page3Content.body && Array.isArray(page3Content.body) && (
                  <div className="space-y-4 mb-6">
                    {page3Content.body.map((paragraph: string, idx: number) => (
                      <p key={idx} className="text-lg text-neutral-200 antialiased">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                )}
                {page3Content.closingTitle && (
                  <div className="mt-8 mb-6">
                    <h3 className="text-xl font-semibold text-white mb-3 antialiased">
                      {page3Content.closingTitle}
                    </h3>
                    {page3Content.closingBody && Array.isArray(page3Content.closingBody) && (
                      <div className="space-y-2">
                        {page3Content.closingBody.map((paragraph: string, idx: number) => (
                          <p key={idx} className="text-lg text-neutral-200 antialiased">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-center gap-4 mt-8">
                <Button variant="tertiary" size="md" onClick={handleBack}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    trackMethodVslClicked(
                      submissionData.assessment_type as any,
                      submissionData.assessment_version,
                      submissionData.session_id,
                      submissionData.primary_avatar,
                      '/method' // TODO: Get actual VSL URL from pack or constants
                    );
                    window.location.href = '/method';
                  }}
                >
                  Learn The Fine Diet Method
                </Button>
              </div>
            </div>
          )}

          {/* Legal Disclaimer */}
          <div className="mt-12 pt-8 border-t border-neutral-700">
            <p className="text-sm text-neutral-400 text-center antialiased">
              This assessment is for educational purposes only and is not a medical diagnosis. It
              does not replace personalized medical advice.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: Single-page rendering (v1 compatibility, no flow structure)
  return (
    <div className="min-h-screen bg-brand-900">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Results Intro */}
        <ResultsIntro
          pack={resultsPack}
          assessmentType={submissionData.assessment_type}
          assessmentVersion={submissionData.assessment_version}
          sessionId={submissionData.session_id}
        />

        {/* Results Mechanism */}
        <ResultsMechanism pack={resultsPack} />

        {/* Results Method */}
        <ResultsMethod
          pack={resultsPack}
          assessmentType={submissionData.assessment_type}
          assessmentVersion={submissionData.assessment_version}
          sessionId={submissionData.session_id}
          levelId={submissionData.primary_avatar}
        />

        {/* Email Capture */}
        <EmailCaptureInline
          assessmentType={submissionData.assessment_type}
          assessmentVersion={submissionData.assessment_version}
          sessionId={submissionData.session_id}
          levelId={submissionData.primary_avatar}
          resultsVersion={GUT_CHECK_RESULTS_CONTENT_VERSION}
          submissionId={submissionData.id}
          onSubmit={handleEmailSubmit}
        />

        {/* Legal Disclaimer */}
        <div className="mt-12 pt-8 border-t border-neutral-700">
          <p className="text-sm text-neutral-400 text-center antialiased">
            This assessment is for educational purposes only and is not a medical diagnosis. It
            does not replace personalized medical advice.
          </p>
        </div>
      </div>
    </div>
  );
}

