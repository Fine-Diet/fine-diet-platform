/**
 * Results Screen Component
 * Displays assessment results with avatar insights
 * Authoritative: Reads from database via submission_id query param
 */

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { ResultsIntro } from './ResultsIntro';
import { ResultsMechanism } from './ResultsMechanism';
import { ResultsMethod } from './ResultsMethod';
import { EmailCaptureInline } from './EmailCaptureInline';
import { trackResultsScrolled } from '@/lib/assessmentAnalytics';
import { supabase } from '@/lib/supabaseClient';
import type { AvatarInsight } from '@/lib/assessmentTypes';
import { getAssessmentConfig } from '@/lib/assessmentConfig';

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
  const [insight, setInsight] = useState<AvatarInsight | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const hasTrackedScroll = useRef(false);

  const config = getAssessmentConfig('gut-check');

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

  // Load avatar insight when submission data is available
  useEffect(() => {
    async function loadInsight() {
      if (!submissionData?.primary_avatar) return;

      setIsLoadingInsight(true);
      try {
        const { data, error } = await supabase
          .from('avatar_insights')
          .select('*')
          .eq('assessment_type', submissionData.assessment_type)
          .eq('avatar_id', submissionData.primary_avatar)
          .single();

        if (error) {
          console.error('Error loading avatar insight:', error);
          // Use placeholder if not found
          setInsight({
            id: '',
            assessmentType: submissionData.assessment_type,
            avatarId: submissionData.primary_avatar,
            label: submissionData.primary_avatar.charAt(0).toUpperCase() + submissionData.primary_avatar.slice(1),
            summary: 'Your assessment results are being processed. Detailed insights will be available soon.',
            keyPatterns: [],
            firstFocusAreas: [],
            methodPositioning: 'Discover how The Fine Diet Method can help you achieve optimal gut health.',
          });
        } else {
          setInsight(data as AvatarInsight);
        }
      } catch (error) {
        console.error('Error loading insight:', error);
      } finally {
        setIsLoadingInsight(false);
      }
    }

    loadInsight();
  }, [submissionData]);

  // Track scroll
  useEffect(() => {
    if (!submissionData) return;

    const handleScroll = () => {
      if (!hasTrackedScroll.current && window.scrollY > 200) {
        trackResultsScrolled(
          submissionData.assessment_type,
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

  // Loading state
  if (isLoading || isLoadingInsight) {
    return (
      <div className="min-h-screen bg-brand-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-dark_accent-500 border-t-transparent mb-4"></div>
          <p className="text-white text-lg">Loading results...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !submissionData) {
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

  // Render results from authoritative DB data (no fallbacks)
  return (
    <div className="min-h-screen bg-brand-900">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Results Intro */}
        <ResultsIntro
          primaryAvatar={submissionData.primary_avatar}
          insight={insight}
          assessmentType={submissionData.assessment_type}
          assessmentVersion={submissionData.assessment_version}
          sessionId={submissionData.session_id}
        />

        {/* Results Mechanism */}
        <ResultsMechanism insight={insight} />

        {/* Results Method */}
        <ResultsMethod
          insight={insight}
          assessmentType={submissionData.assessment_type}
          assessmentVersion={submissionData.assessment_version}
          sessionId={submissionData.session_id}
          primaryAvatar={submissionData.primary_avatar}
        />

        {/* Email Capture */}
        <EmailCaptureInline
          assessmentType={submissionData.assessment_type}
          assessmentVersion={submissionData.assessment_version}
          sessionId={submissionData.session_id}
          primaryAvatar={submissionData.primary_avatar}
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

