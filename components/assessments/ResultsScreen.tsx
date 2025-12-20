/**
 * Results Screen Component
 * Displays assessment results with avatar insights
 */

import React, { useEffect, useState, useRef } from 'react';
import { useAssessment } from './AssessmentProvider';
import { ResultsIntro } from './ResultsIntro';
import { ResultsMechanism } from './ResultsMechanism';
import { ResultsMethod } from './ResultsMethod';
import { EmailCaptureInline } from './EmailCaptureInline';
import { trackResultsScrolled } from '@/lib/assessmentAnalytics';
import { supabase } from '@/lib/supabaseClient';
import type { AvatarInsight } from '@/lib/assessmentTypes';

export function ResultsScreen() {
  const { state, config, submitAssessment, submissionPayload } = useAssessment();
  const [insight, setInsight] = useState<AvatarInsight | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(true);
  const hasTrackedScroll = useRef(false);

  // Use canonical submission payload avatar instead of state (which may be stale)
  const displayAvatar = submissionPayload?.primaryAvatar || state.primaryAvatar || '';
  
  // Debug logging: Show both displayed avatar and submitted payload
  useEffect(() => {
    if (displayAvatar && submissionPayload) {
      console.log('[ResultsScreen DEBUG]', {
        displayedAvatar: displayAvatar,
        submittedPayloadPrimaryAvatar: submissionPayload.primaryAvatar,
        submittedPayloadSubmissionId: submissionPayload.submissionId,
        statePrimaryAvatar: state.primaryAvatar,
        alignmentMatch: displayAvatar === submissionPayload.primaryAvatar,
      });
    }
  }, [displayAvatar, submissionPayload, state.primaryAvatar]);

  // Submit assessment on mount
  useEffect(() => {
    if (state.status === 'completed' && state.primaryAvatar) {
      submitAssessment();
    }
  }, [state.status, state.primaryAvatar, submitAssessment]);

  // Load avatar insight - use canonical submission payload avatar
  useEffect(() => {
    async function loadInsight() {
      if (!displayAvatar || state.status !== 'completed') return;

      try {
        const { data, error } = await supabase
          .from('avatar_insights')
          .select('*')
          .eq('assessment_type', config.assessmentType)
          .eq('avatar_id', displayAvatar)
          .single();

        if (error) {
          console.error('Error loading avatar insight:', error);
          // Use placeholder if not found
          setInsight({
            id: '',
            assessmentType: config.assessmentType,
            avatarId: displayAvatar,
            label: displayAvatar.charAt(0).toUpperCase() + displayAvatar.slice(1),
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
  }, [displayAvatar, config.assessmentType, state.status]);

  // Track scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!hasTrackedScroll.current && window.scrollY > 200) {
        trackResultsScrolled(
          config.assessmentType,
          config.assessmentVersion,
          state.sessionId,
          displayAvatar
        );
        hasTrackedScroll.current = true;
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [config, state.sessionId, displayAvatar]);

  const handleEmailSubmit = async (email: string) => {
    // Update submission with email (non-blocking)
    // Note: This would require a separate endpoint or upsert logic
    // For now, we'll just track the event (email is captured in events)
    // The email can be updated via a separate PATCH endpoint if needed
    console.log('Email captured:', email);
  };

  if (isLoadingInsight) {
    return (
      <div className="min-h-screen bg-brand-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-dark_accent-500 border-t-transparent mb-4"></div>
          <p className="text-white text-lg">Loading your results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-900">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Results Intro */}
        <ResultsIntro
          primaryAvatar={displayAvatar}
          insight={insight}
          assessmentType={config.assessmentType}
          assessmentVersion={config.assessmentVersion}
          sessionId={state.sessionId}
        />

        {/* Results Mechanism */}
        <ResultsMechanism insight={insight} />

        {/* Results Method */}
        <ResultsMethod
          insight={insight}
          assessmentType={config.assessmentType}
          assessmentVersion={config.assessmentVersion}
          sessionId={state.sessionId}
          primaryAvatar={displayAvatar}
        />

        {/* Email Capture */}
        <EmailCaptureInline
          assessmentType={config.assessmentType}
          assessmentVersion={config.assessmentVersion}
          sessionId={state.sessionId}
          primaryAvatar={displayAvatar}
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

