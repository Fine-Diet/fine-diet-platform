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
 *
 * ---------------------------------------------------------------------------
 * Packet E — results-system cleanup.
 *
 * Data-loading, claim/auth, screen-state, and results-pack resolution logic now
 * live in focused hooks under `components/assessments/results/`:
 *   • useAssessmentSubmissionResult  — submission fetch + loading/error
 *   • useResultsPackResolution       — results-pack fetch + first-render pinning
 *   • useAssessmentClaimFlow         — auth check + post-auth claim + refresh
 *   • useResultsScreenIndex          — ?screen= init + shallow URL sync
 *
 * Page-content + video resolution is pure and lives in
 * `lib/assessments/results/resolveResultsScreenContent.ts`. The Gut Check-specific
 * level→video map is isolated in `lib/assessments/results/getLevelSpecificVideo.ts`.
 *
 * The rendered JSX (3-page flow + single-page fallback) is unchanged. Where
 * future result templates / full results-pack preview should plug in: add a new
 * branch in `resolveResultsScreenContent` keyed off assessmentType or a pack
 * `schemaVersion`, and a new results-screen component for non-Gut-Check types.
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
import { GUT_CHECK_RESULTS_CONTENT_VERSION } from '@/lib/assessments/results/constants';
import { resolveResultsScreenContent } from '@/lib/assessments/results/resolveResultsScreenContent';
import { useAssessmentSubmissionResult } from './results/useAssessmentSubmissionResult';
import { useResultsPackResolution } from './results/useResultsPackResolution';
import { useAssessmentClaimFlow } from './results/useAssessmentClaimFlow';
import { useResultsScreenIndex } from './results/useResultsScreenIndex';
import { MethodLinkEmail } from './results/MethodLinkEmail';
import { EmailYourResults } from './results/EmailYourResults';
import { SavedToAccountBanner } from './results/SavedToAccountBanner';
import { buildAuthUrl } from '@/lib/auth/authContext';

export function ResultsScreen() {
  const router = useRouter();
  const { submission_id } = router.query;

  // --- Data loading (extracted hooks) -------------------------------------
  const {
    submissionData,
    isLoading: submissionLoading,
    error: submissionError,
    setSubmissionData,
  } = useAssessmentSubmissionResult(submission_id);

  const {
    resultsPack,
    isLoading: packLoading,
    error: packError,
  } = useResultsPackResolution(submissionData);

  const { authUser } = useAssessmentClaimFlow(submissionData, setSubmissionData);

  const { screenIndex, setScreenIndex } = useResultsScreenIndex(resultsPack, submissionData);

  // Merged loading/error. Keeping loading asserted while the pack resolves
  // removes a brief "Results Not Found" flash that used to appear between
  // submission-load and pack-load. Happy-path rendered output is unchanged.
  const isLoading = submissionLoading || packLoading;
  const error = submissionError || packError;

  // --- Local UI state -----------------------------------------------------
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [hasWatchedVideo, setHasWatchedVideo] = useState(false);
  const [hasEmailedResults, setHasEmailedResults] = useState(false);
  const [hasDownloadedPdf, setHasDownloadedPdf] = useState(false);
  const hasTrackedScroll = useRef(false);

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
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-denim-500 border-t-transparent mb-4"></div>
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
            onClick={() =>
              router.push(
                submissionData?.assessment_type
                  ? `/assessments/${submissionData.assessment_type}`
                  : '/assessments/gut-check'
              )
            }
            className="bg-denim-500 hover:bg-denim-600 text-neutral-900 font-semibold px-6 py-3 rounded-full transition-colors"
          >
            Start New Assessment
          </button>
        </div>
      </div>
    );
  }

  // Resolve multi-page content + video URL (pure).
  const {
    renderMultiPage,
    page1,
    page2,
    page3,
    videoUrl,
  } = resolveResultsScreenContent(resultsPack, submissionData.primary_avatar);

  // Render 3-page flow (flow-first, legacy fallback)
  if (renderMultiPage) {
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
                  className="w-full px-6 py-3 text-base font-semibold text-center text-white bg-denim-900 rounded-lg transition-colors duration-200 hover:opacity-90"
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
                          emailType="results"
                          onSubmit={handleEmailSubmit}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Saved to Account Banner */}
                {authUser && submissionData.user_id && (
                  <div className="mt-0 mb-5">
                    <SavedToAccountBanner />
                  </div>
                )}

                {/* Email Capture */}
                <div className="mt-0 mb-5">
                  <EmailYourResults
                    submissionData={submissionData}
                    onSuccess={() => setHasEmailedResults(true)}
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

                {/* Account Save Messaging - Only show when not logged in */}
                {!authUser && (
                  <div className="mt-4 pt-6 border-neutral-700">
                    <p className="text-white text-sm font-normal antialiased text-center">
                      Have an account?{' '}
                      <button
                        onClick={() => {
                          // Claim token should already be in localStorage from submission.
                          const claimToken = localStorage.getItem('fd_gc_claimToken:last');
                          if (!claimToken) {
                            console.warn('No claim token found in localStorage');
                          }
                          router.push(
                            buildAuthUrl({
                              intent: 'login',
                              source: 'assessment',
                              redirectTo: `/results/${submissionData.id}`,
                              assessmentSlug: submissionData.assessment_type,
                              submissionId: submissionData.id,
                              sessionId: submissionData.session_id,
                            })
                          );
                        }}
                        className="text-denim-900 font-semibold hover:opacity-80 transition-opacity"
                      >
                        Log in
                      </button>
                      {' '}to save your results.
                    </p>
                  </div>
                )}
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
                          ? 'bg-denim-900 text-white hover:opacity-90'
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
              <div className="mb-6 px-4">
                {/* Problem Section */}
                <h1 className="text-4xl md:text-4xl font-semibold text-white mb-3 antialiased">
                  {page3.problemHeadline}
                </h1>

                {page3.problemBody && page3.problemBody.length > 0 && (
                  <div className="space-y-4 mb-8">
                    {page3.problemBody.map((paragraph, idx) => (
                      <p key={idx} className="text-lg text-white antialiased leading-snug">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                )}

                {/* "What most people try" Section */}
                {page3.tryTitle && (
                  <div className="mt-8 mb-0 border-t border-neutral-700">
                    <h3 className="text-2xl font-semibold text-white mb-1 mt-6 antialiased">
                      {page3.tryTitle}
                    </h3>
                    {page3.tryBullets && page3.tryBullets.length > 0 && (
                      <ul className="space-y-0 ml-10 mb-1">
                        {page3.tryBullets.map((bullet, idx) => (
                          <li key={idx} className="text-lg text-white flex items-start antialiased">
                            <span className="text-xl mr-2">•</span>
                            <span className="leading-relaxed">{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {page3.tryCloser && (
                      <p className="text-sm ml-10 font-light text-white antialiased leading-relaxed mt-0">
                        {page3.tryCloser}
                      </p>
                    )}
                  </div>
                )}

                {/* Missing Mechanism Section */}
                {page3.mechanismTitle && (
                  <div className="mt-8 pt-6 border-t border-neutral-700">
                    <h3 className="text-2xl font-semibold text-white mb-2 antialiased">
                      {page3.mechanismTitle}
                    </h3>
                    {page3.mechanismBodyTop && (
                      <p className="text-lg ml-10 text-white antialiased leading-relaxed mb-3">
                        {page3.mechanismBodyTop}
                      </p>
                    )}

                    {/* Missing Mechanism Pills */}
                    {page3.mechanismPills && page3.mechanismPills.length > 0 && (
                      <div className="flex ml-10 flex-col gap-3 mb-4">
                        {page3.mechanismPills.map((pill, idx) => (
                          <div
                            key={idx}
                            className="w-full px-5 py-1 border border-white/20 rounded-full text-white/60 text-base font-medium antialiased"
                          >
                            {pill}
                          </div>
                        ))}
                      </div>
                    )}

                    {page3.mechanismBodyBottom && (
                      <p className="ml-10 font-light text-lg text-white antialiased leading-relaxed">
                        {page3.mechanismBodyBottom}
                      </p>
                    )}
                  </div>
                )}

                {/* Method Section */}
                {page3.methodTitle && (
                  <div className="mt-8 mb-0 pt-6 border-t border-neutral-700">
                    <h3 className="text-2xl font-semibold text-white mb-3 antialiased">
                      {page3.methodTitle}
                    </h3>
                    {page3.methodBody && page3.methodBody.length > 0 && (
                      <div className="space-y-0 mb-3 ml-10">
                        {page3.methodBody.map((paragraph, idx) => (
                          <p key={idx} className="text-lg text-white antialiased leading-relaxed">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* "In the video, you'll learn" Section */}
                    {page3.methodLearnTitle && (
                      <div className="mt-0 mb-0 ml-10">
                        <h4 className="text-lg font-semibold text-white mb-2 antialiased">
                          {page3.methodLearnTitle}
                        </h4>
                        {page3.methodLearnBullets && page3.methodLearnBullets.length > 0 && (
                          <ul className="space-y-2 ml-10 mb-6">
                            {page3.methodLearnBullets.map((bullet, idx) => (
                              <li key={idx} className="text-lg text-white flex items-start antialiased">
                                <span className="text-xl mr-2">•</span>
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
                        size="lg"
                        className="w-full px-6 py-8 text-base font-semibold text-center text-white bg-denim-900 rounded-lg transition-colors duration-200 hover:opacity-90"
                        onClick={() => {
                          const methodUrl = page3.methodCtaUrl || '/method';
                          trackMethodVslClicked(
                            submissionData.assessment_type as any,
                            submissionData.assessment_version,
                            submissionData.session_id,
                            submissionData.primary_avatar,
                            methodUrl
                          );
                          window.location.href = methodUrl;
                        }}
                      >
                        {page3.methodCtaLabel}
                      </Button>

                      <div className="mt-4">
                        <p className="text-white text-sm font-normal antialiased text-center mb-3">
                          Prefer to watch later?{' '}
                          <MethodLinkEmail submissionData={submissionData} />
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Legal Disclaimer */}
          <div className="mt-9 pt-2 border-t border-neutral-700">
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
          emailType="results"
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
