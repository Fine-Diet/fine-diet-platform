/**
 * Results Screen Component
 * Displays assessment results with avatar insights
 * Authoritative: Reads from database via submission_id query param
 * 
 * For results packs with core fields (summary, keyPatterns, firstFocusAreas), renders 3-page flow:
 * - Page 1: Summary + Framing (summary + methodPositioning)
 * - Page 2: Key Patterns + Level-Specific Video (keyPatterns + deterministic video mapping)
 * - Page 3: First Focus Areas + Static CTA (firstFocusAreas + "Watch How The Fine Diet Method Works")
 * 
 * For packs without core fields, falls back to single-page rendering (v1 compatibility).
 */

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { ResultsIntro } from './ResultsIntro';
import { ResultsMechanism } from './ResultsMechanism';
import { ResultsMethod } from './ResultsMethod';
import { EmailCaptureInline } from './EmailCaptureInline';
import { ResultsProgressBar } from './ResultsProgressBar';
import { Button } from '@/components/ui/Button';
import { trackResultsScrolled, trackMethodVslClicked } from '@/lib/assessmentAnalytics';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';
import { GUT_CHECK_RESULTS_CONTENT_VERSION } from '@/lib/assessments/results/constants';
import { createClient } from '@/lib/supabaseBrowser';

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
  metadata?: Record<string, unknown> | null;
}

/**
 * Account Save CTA Component
 * Shows account save messaging for non-logged-in users
 */
function AccountSaveCTA({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        setIsLoggedIn(!!session);
      } catch (error) {
        console.warn('Error checking auth status:', error);
        setIsLoggedIn(false);
      }
    }
    checkAuth();
  }, []);

  // Don't show if logged in or if we haven't checked yet
  if (isLoggedIn === null || isLoggedIn) {
    return null;
  }

  const handleLoginClick = () => {
    // Ensure claim token is in localStorage before redirecting
    // The claim token should already be there from submission, but check just in case
    const claimToken = localStorage.getItem('fd_gc_claimToken:last');
    if (!claimToken) {
      console.warn('No claim token found in localStorage');
    }
    router.push(`/login?redirect=/results/${submissionId}`);
  };

  const handleSignupClick = () => {
    // Ensure claim token is in localStorage before redirecting
    const claimToken = localStorage.getItem('fd_gc_claimToken:last');
    if (!claimToken) {
      console.warn('No claim token found in localStorage');
    }
    // Route to login page - it should handle signup via AccountDrawer or we can add signup route later
    router.push(`/login?redirect=/results/${submissionId}`);
  };

  return (
    <div className="mt-8 pt-6 border-t border-neutral-700">
      <p className="text-neutral-300 text-sm mb-4 antialiased text-center">
        Want to save this assessment to your account?
      </p>
      <div className="flex gap-4 justify-center flex-wrap">
        <Button
          variant="tertiary"
          size="md"
          onClick={handleLoginClick}
        >
          Log in
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={handleSignupClick}
        >
          Create account
        </Button>
      </div>
    </div>
  );
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
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [hasWatchedVideo, setHasWatchedVideo] = useState(false);
  const [hasEmailedResults, setHasEmailedResults] = useState(false);
  const [hasDownloadedPdf, setHasDownloadedPdf] = useState(false);
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

  // Load results pack when submission data is available (CMS-first with pinning)
  useEffect(() => {
    if (!submissionData?.primary_avatar || !submissionData?.assessment_type) return;

    async function loadPack() {
      // Guard against null (TypeScript narrowing)
      if (!submissionData) return;

      // primary_avatar contains levelId or avatar ID (will be normalized by loader)
      const levelId = submissionData.primary_avatar;
      // Use constant for results content version (decoupled from assessment_version)
      const resultsVersion = GUT_CHECK_RESULTS_CONTENT_VERSION;

      // Check for existing resultsPackRef in metadata
      const existingRef = submissionData.metadata?.resultsPackRef as any;
      
      // Check for preview mode (query param)
      const preview = router.query.preview === '1' || router.query.preview === 'true';

      try {
        // Build query params for resolver API
        const params = new URLSearchParams({
          assessmentType: submissionData.assessment_type,
          resultsVersion: resultsVersion,
          levelId: levelId,
        });
        if (preview) {
          params.set('preview', '1');
        }
        if (existingRef) {
          params.set('resultsPackRef', JSON.stringify(existingRef));
        }

        const response = await fetch(`/api/results-packs/resolve?${params.toString()}`);
        const result = await response.json();

        if (!response.ok || !result.success || !result.pack) {
          throw new Error(result.error || 'Failed to load results pack');
        }

        setResultsPack(result.pack);
        setIsLoading(false);

        // Pin the pack reference on first render (if not already pinned)
        if (!existingRef && result.resultsPackRef) {
          // Update submission metadata asynchronously (non-blocking)
          fetch('/api/assessments/update-pack-ref', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              submissionId: submissionData.id,
              resultsPackRef: result.resultsPackRef,
            }),
          }).catch((err) => {
            console.warn('Failed to pin results pack ref (non-blocking):', err);
          });
        }
      } catch (err) {
        console.error('Error loading results pack:', err);
        setError(`Unable to load results content. Please try again or contact support if this issue persists.`);
        setIsLoading(false);
      }
    }

    loadPack();
  }, [submissionData, router.query.preview]);

  // Initialize screenIndex from query param (only for packs with flow v2 or legacy fields, only once)
  useEffect(() => {
    if (!resultsPack || !router.isReady || hasInitializedScreen.current) return;
    
    // Check if pack has Flow v2 or legacy fields for 3-page flow
    const flow = resultsPack?.flow as any;
    const hasFlowV2Check = flow && flow.page1 && flow.page2 && flow.page3;
    const hasLegacyFieldsCheck = resultsPack && (
      resultsPack.summary &&
      resultsPack.keyPatterns &&
      resultsPack.firstFocusAreas
    );
    
    // Only initialize from query param if flow v2 or legacy fields exist
    if ((hasFlowV2Check || hasLegacyFieldsCheck) && submissionData) {
      const screenParam = router.query.screen;
      if (screenParam) {
        const screenNum = typeof screenParam === 'string' ? parseInt(screenParam, 10) : parseInt(screenParam[0], 10);
        // Convert screen=1,2,3 to screenIndex=0,1,2 and clamp
        if (screenNum >= 1 && screenNum <= 3) {
          setScreenIndex(Math.min(screenNum - 1, 2) as 0 | 1 | 2);
        }
      }
      hasInitializedScreen.current = true;
    } else if (!hasFlowV2Check && !hasLegacyFieldsCheck) {
      // For packs without flow or legacy fields, mark as initialized so we don't try again
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
    setHasEmailedResults(true);
  };

  // Update URL when screenIndex changes (only for packs with flow v2 or legacy fields)
  useEffect(() => {
    if (!resultsPack || !router.isReady || !submissionData?.id) return;
    
    // Check if pack has Flow v2 or legacy fields for 3-page flow
    const flow = resultsPack?.flow as any;
    const hasFlowV2Check = flow && flow.page1 && flow.page2 && flow.page3;
    const hasLegacyFieldsCheck = resultsPack && (
      resultsPack.summary &&
      resultsPack.keyPatterns &&
      resultsPack.firstFocusAreas
    );
    
    if (hasFlowV2Check || hasLegacyFieldsCheck) {
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
    
    // Mark PDF as downloaded to enable Next button
    setHasDownloadedPdf(true);
  };


  // Debug logging (must be before any early returns to satisfy Rules of Hooks)
  useEffect(() => {
    if (resultsPack && !error && submissionData) {
      const flow = resultsPack?.flow as any;
      const hasFlowV2Check = flow && flow.page1 && flow.page2 && flow.page3;
      const hasLegacyFieldsCheck = resultsPack && (
        resultsPack.summary &&
        resultsPack.keyPatterns &&
        resultsPack.firstFocusAreas
      );
      console.log('[ResultsScreen Debug]', {
        hasFlowV2: hasFlowV2Check,
        hasLegacyFields: hasLegacyFieldsCheck,
        screenIndex,
        hasFlow: !!resultsPack.flow,
        hasPage1: !!(flow?.page1),
        hasPage2: !!(flow?.page2),
        hasPage3: !!(flow?.page3),
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

  /**
   * Deterministic mapping function for level-specific videos
   * Maps levelId (level1-level4) to video URL or embed code
   */
  const getLevelSpecificVideo = (levelId: string): string | null => {
    // Normalize levelId to ensure it's in level1-level4 format
    const normalizedLevel = levelId.match(/^level[1-4]$/) ? levelId : null;
    if (!normalizedLevel) {
      console.warn(`Invalid levelId for video mapping: ${levelId}`);
      return null;
    }

    // Deterministic mapping: level1 -> video1, level2 -> video2, etc.
    // In production, these would be actual video URLs or embed codes
    // For now, we'll use the gut-pattern-breakdown page with level parameter
    const videoMap: Record<string, string> = {
      level1: '/gut-pattern-breakdown?level=1',
      level2: '/gut-pattern-breakdown?level=2',
      level3: '/gut-pattern-breakdown?level=3',
      level4: '/gut-pattern-breakdown?level=4',
    };

    return videoMap[normalizedLevel] || null;
  };

  // Check if pack has Flow v2 structure (flow-first)
  const flow = resultsPack?.flow as any;
  const hasFlowV2 = flow && flow.page1 && flow.page2 && flow.page3 &&
    flow.page1.headline && flow.page1.body && flow.page1.snapshotBullets && flow.page1.meaningBody &&
    flow.page2.headline && flow.page2.stepBullets && flow.page2.videoCtaLabel &&
    flow.page3.problemHeadline && flow.page3.problemBody && flow.page3.tryBullets &&
    flow.page3.methodTitle && flow.page3.methodBody && flow.page3.methodLearnBullets &&
    flow.page3.methodCtaLabel && flow.page3.methodEmailLinkLabel;

  // Check if pack has legacy core fields for fallback
  const hasLegacyFields = resultsPack && (
    resultsPack.summary &&
    resultsPack.keyPatterns &&
    resultsPack.firstFocusAreas
  );

  // Render 3-page flow (flow-first, legacy fallback)
  if (hasFlowV2 || hasLegacyFields) {
    const levelId = submissionData.primary_avatar;
    const videoUrl = getLevelSpecificVideo(levelId);
    
    // Helper to get page1 content (flow-first, legacy fallback)
    const getPage1Content = () => {
      if (hasFlowV2 && flow.page1) {
        return {
          headline: flow.page1.headline,
          body: flow.page1.body,
          snapshotTitle: flow.page1.snapshotTitle || "What We're Seeing",
          snapshotBullets: flow.page1.snapshotBullets,
          meaningTitle: flow.page1.meaningTitle || "What This Often Means",
          meaningBody: flow.page1.meaningBody,
        };
      }
      // Legacy fallback
      return {
        headline: resultsPack.label,
        body: [resultsPack.summary || ''],
        snapshotTitle: "What We're Seeing",
        snapshotBullets: resultsPack.keyPatterns?.slice(0, 3) || ['', '', ''],
        meaningTitle: "What This Often Means",
        meaningBody: resultsPack.methodPositioning || 'Generic gut advice assumes the same inputs produce the same outcomes for everyone.',
      };
    };

    // Helper to get page2 content (flow-first, legacy fallback)
    const getPage2Content = () => {
      if (hasFlowV2 && flow.page2) {
        return {
          headline: flow.page2.headline || 'First Steps',
          stepBullets: flow.page2.stepBullets,
          videoCtaLabel: flow.page2.videoCtaLabel,
          emailHelper: flow.page2.emailHelper,
          pdfHelper: flow.page2.pdfHelper,
        };
      }
      // Legacy fallback
      return {
        headline: 'First Steps',
        stepBullets: resultsPack.firstFocusAreas?.slice(0, 3) || ['', '', ''],
        videoCtaLabel: 'Watch Your Gut Pattern Breakdown',
        emailHelper: undefined,
        pdfHelper: undefined,
      };
    };

    // Helper to get page3 content (flow-first, legacy fallback)
    const getPage3Content = () => {
      if (hasFlowV2 && flow.page3) {
        return {
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
        };
      }
      // Legacy fallback - minimal generic narrative
      return {
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
    };

    const page1 = getPage1Content();
    const page2 = getPage2Content();
    const page3 = getPage3Content();

    return (
      <div className="min-h-screen bg-brand-900">
        <div className="max-w-2xl mx-auto px-4 py-12">
          {/* Progress Tracker */}
          <div className="mb-8 px-4">
            <ResultsProgressBar
              currentPage={screenIndex + 1}
              totalPages={3}
            />
          </div>

          {/* Page 1: Pattern Read */}
          {screenIndex === 0 && (
            <div>
              <div className="mb-8 px-4">
                <h1 className="text-4xl md:text-4xl font-semibold text-white mb-6 antialiased">
                  {page1.headline}
                </h1>
                
                {/* Lead Description (Body) */}
                {page1.body && page1.body.length > 0 && (
                  <div className="space-y-4 mb-8">
                    {page1.body.map((paragraph, idx) => (
                      <p key={idx} className="text-lg text-white antialiased leading-snug">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                )}

                {/* Snapshot Section */}
                {page1.snapshotTitle && (
                  <div className="mt-8 mb-6">
                    <h3 className="text-2xl font-semibold text-neutral-50 mb-3 antialiased">
                      {page1.snapshotTitle}
                    </h3>
                    {page1.snapshotBullets && page1.snapshotBullets.length > 0 && (
                      <ul className="ml-10 space-y-1 mb-4">
                        {page1.snapshotBullets.map((bullet, idx) => (
                          <li key={idx} className="text-lg text-white flex items-start antialiased">
                            <div className="w-4 h-4 rounded-full border-2 border-white bg-white flex items-center justify-center flex-shrink-0 mr-3 mt-1">
                              <div className="w-2 h-2 rounded-full bg-brand-900"></div>
                            </div>
                            <span className="leading-relaxed">{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Meaning Section */}
                {page1.meaningTitle && (
                  <div className=" pt-6 border-neutral-700">
                    <h3 className="text-2xl font-semibold text-neutral-50 mb-3 antialiased">
                      {page1.meaningTitle}
                    </h3>
                    {page1.meaningBody && (
                      <p className="text-lg text-white antialiased leading-snug">
                        {page1.meaningBody}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-center mt-8 px-4">
                <button
                  onClick={handleNext}
                  className="w-full px-6 py-3 text-base font-semibold text-center text-white bg-dark_accent-900 rounded-lg transition-colors duration-200 hover:opacity-90"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Page 2: First Steps + Utilities */}
          {screenIndex === 1 && (
            <div className="pb-8">
              <div className="mb-8 px-4">
                <h1 className="text-4xl md:text-4xl font-semibold text-white mb-6 antialiased">
                  {page2.headline}
                </h1>
                
                {/* Step Bullets */}
                {page2.stepBullets && page2.stepBullets.length > 0 && (
                  <div className="mb-8">
                    <ul className="ml-10 space-y-1">
                      {page2.stepBullets.map((bullet, index) => (
                        <li key={index} className="text-lg text-white flex items-start antialiased">
                          <div className="w-4 h-4 rounded-full border-2 border-white bg-white flex items-center justify-center flex-shrink-0 mr-3 mt-1">
                            <div className="w-2 h-2 rounded-full bg-brand-900"></div>
                          </div>
                          <span className="leading-relaxed">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Level-Specific Video */}
                {videoUrl && (
                  <div className="mt-0 mb-5">
                    <button
                      onClick={() => {
                        setIsVideoModalOpen(true);
                        setHasWatchedVideo(true);
                      }}
                      className="w-full px-6 py-5 text-base font-semibold text-center text-white border-2 border-white rounded-lg bg-transparent transition-colors duration-200 hover:bg-white/10"
                    >
                      {page2.videoCtaLabel}
                    </button>
                  </div>
                )}

                {/* Video Modal */}
                {isVideoModalOpen && videoUrl && (
                  <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setIsVideoModalOpen(false);
                      }
                    }}
                  >
                    <div className="relative w-full max-w-4xl bg-brand-900 rounded-lg p-6">
                      <button
                        onClick={() => setIsVideoModalOpen(false)}
                        className="absolute top-4 right-4 text-white hover:text-neutral-300 text-2xl font-bold w-8 h-8 flex items-center justify-center"
                      >
                        ×
                      </button>
                      <div className="mt-4 mb-6">
                        <iframe
                          src={videoUrl}
                          className="w-full aspect-video rounded-lg"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title="Gut Pattern Breakdown Video"
                        />
                      </div>
                      <div className="mt-6">
                        <h3 className="text-lg font-semibold text-white mb-3 antialiased">
                          {page2.emailHelper || 'Email Your Results'}
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
                    </div>
                  </div>
                )}

                {/* Email Capture */}
                <div className="mt-0 mb-5">
                  
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

                {/* Download PDF Button */}
                <div className="mt-0 mb-0 pb-0">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleDownloadPdf}
                    disabled={isDownloadingPdf || !submissionData?.id}
                    className="w-full py-4"
                  >
                    {isDownloadingPdf ? 'Preparing PDF…' : page2.pdfHelper || 'Download PDF'}
                  </Button>
                </div>

                {/* Account Save Messaging */}
                <div className="mt-4 pt-6 border-neutral-700">
                  <p className="text-white text-sm font-normal antialiased text-center">
                    Have an account?{' '}
                    <button
                      onClick={() => {
                        // TODO: Implement login functionality
                        console.log('Login clicked');
                      }}
                      className="text-dark_accent-900 font-semibold hover:opacity-80 transition-opacity"
                    >
                      Log In
                    </button>
                    {' '}to save your results.{' '}
                  </p>
                </div>
              </div>
              
              {/* Bottom: Next and Back Button - Aligned to bottom with matching spacing */}
              <div className="w-full px-4 pb-6 max-w-2xl mx-auto">
                <div className="w-full flex flex-col items-center space-y-0">
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!hasWatchedVideo && !hasEmailedResults && !hasDownloadedPdf}
                    className={`
                      w-full px-6 py-6 text-base font-bold text-center rounded-lg
                      transition-colors duration-200
                      ${
                        (hasWatchedVideo || hasEmailedResults || hasDownloadedPdf)
                          ? 'bg-dark_accent-900 text-white hover:opacity-90'
                          : 'bg-transparent text-brand-700 border-[3px] border-brand-700 cursor-not-allowed'
                      }
                    `}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="w-full py-4 font-semibold text-base text-center text-brand-300 transition-colors duration-200 hover:opacity-70"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Page 3: Narrative Close + Method CTA */}
          {screenIndex === 2 && (
            <div>
              <div className="mb-8 px-4">
                {/* Problem Section */}
                <h1 className="text-4xl md:text-4xl font-semibold text-white mb-6 antialiased">
                  {page3.problemHeadline}
                </h1>
                
                {page3.problemBody && page3.problemBody.length > 0 && (
                  <div className="space-y-4 mb-8">
                    {page3.problemBody.map((paragraph, idx) => (
                      <p key={idx} className="text-lg text-white antialiased leading-relaxed">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                )}

                {/* "What most people try" Section */}
                {page3.tryTitle && (
                  <div className="mt-8 mb-6">
                    <h3 className="text-2xl font-semibold text-white mb-4 antialiased">
                      {page3.tryTitle}
                    </h3>
                    {page3.tryBullets && page3.tryBullets.length > 0 && (
                      <ul className="space-y-3 mb-4">
                        {page3.tryBullets.map((bullet, idx) => (
                          <li key={idx} className="text-lg text-white flex items-start antialiased">
                            <span className="text-dark_accent-500 mr-3 mt-1">•</span>
                            <span className="leading-relaxed">{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {page3.tryCloser && (
                      <p className="text-lg text-white antialiased leading-relaxed italic mt-4">
                        {page3.tryCloser}
                      </p>
                    )}
                  </div>
                )}

                {/* Missing Mechanism Section */}
                {page3.mechanismTitle && (
                  <div className="mt-8 mb-6 pt-6 border-t border-neutral-700">
                    <h3 className="text-2xl font-semibold text-white mb-4 antialiased">
                      {page3.mechanismTitle}
                    </h3>
                    {page3.mechanismBodyTop && (
                      <p className="text-lg text-white antialiased leading-relaxed mb-4">
                        {page3.mechanismBodyTop}
                      </p>
                    )}
                    {page3.mechanismBodyBottom && (
                      <p className="text-lg text-white antialiased leading-relaxed">
                        {page3.mechanismBodyBottom}
                      </p>
                    )}
                  </div>
                )}

                {/* Method Section */}
                {page3.methodTitle && (
                  <div className="mt-8 mb-6 pt-6 border-t border-neutral-700">
                    <h3 className="text-2xl font-semibold text-white mb-4 antialiased">
                      {page3.methodTitle}
                    </h3>
                    {page3.methodBody && page3.methodBody.length > 0 && (
                      <div className="space-y-4 mb-6">
                        {page3.methodBody.map((paragraph, idx) => (
                          <p key={idx} className="text-lg text-white antialiased leading-relaxed">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* "In the video, you'll learn" Section */}
                    {page3.methodLearnTitle && (
                      <div className="mt-6 mb-6">
                        <h4 className="text-lg font-semibold text-white mb-4 antialiased">
                          {page3.methodLearnTitle}
                        </h4>
                        {page3.methodLearnBullets && page3.methodLearnBullets.length > 0 && (
                          <ul className="space-y-3 mb-6">
                            {page3.methodLearnBullets.map((bullet, idx) => (
                              <li key={idx} className="text-lg text-white flex items-start antialiased">
                                <span className="text-dark_accent-500 mr-3 mt-1">•</span>
                                <span className="leading-relaxed">{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Method CTA Buttons */}
                    <div className="mt-8 mb-6 space-y-4">
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={() => {
                          trackMethodVslClicked(
                            submissionData.assessment_type as any,
                            submissionData.assessment_version,
                            submissionData.session_id,
                            submissionData.primary_avatar,
                            '/method'
                          );
                          window.location.href = '/method';
                        }}
                      >
                        {page3.methodCtaLabel}
                      </Button>
                      
                      <div className="mt-4">
                        <Button
                          variant="tertiary"
                          size="md"
                          onClick={async () => {
                            // Check if user email exists, if not prompt capture
                            const supabase = createClient();
                            const { data: { session } } = await supabase.auth.getSession();
                            
                            if (session?.user?.email) {
                              // User has email, trigger email capture with method_link type
                              try {
                                const response = await fetch('/api/assessments/email-capture', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    email: session.user.email,
                                    assessmentType: submissionData.assessment_type,
                                    assessmentVersion: submissionData.assessment_version,
                                    sessionId: submissionData.session_id,
                                    levelId: submissionData.primary_avatar,
                                    resultsVersion: GUT_CHECK_RESULTS_CONTENT_VERSION,
                                    submissionId: submissionData.id,
                                    emailType: 'method_link',
                                  }),
                                });
                                if (response.ok) {
                                  alert('Method link sent to your email!');
                                }
                              } catch (err) {
                                console.error('Error sending method link:', err);
                              }
                            } else {
                              // No email, show email capture inline
                              const email = prompt('Enter your email to receive the method link:');
                              if (email) {
                                try {
                                  const response = await fetch('/api/assessments/email-capture', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      email,
                                      assessmentType: submissionData.assessment_type,
                                      assessmentVersion: submissionData.assessment_version,
                                      sessionId: submissionData.session_id,
                                      levelId: submissionData.primary_avatar,
                                      resultsVersion: GUT_CHECK_RESULTS_CONTENT_VERSION,
                                      submissionId: submissionData.id,
                                      emailType: 'method_link',
                                    }),
                                  });
                                  if (response.ok) {
                                    alert('Method link sent to your email!');
                                  }
                                } catch (err) {
                                  console.error('Error sending method link:', err);
                                }
                              }
                            }
                          }}
                        >
                          {page3.methodEmailLinkLabel}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-center gap-4 mt-8 px-4">
                <Button variant="tertiary" size="md" onClick={handleBack}>
                  Back
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
      <div className="max-w-2xl mx-auto px-4 py-12">
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

