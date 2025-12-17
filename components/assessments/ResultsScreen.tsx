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
  const { state, config, submitAssessment } = useAssessment();
  const [insight, setInsight] = useState<AvatarInsight | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(true);
  const hasTrackedScroll = useRef(false);

  // Submit assessment on mount
  useEffect(() => {
    if (state.status === 'completed' && state.primaryAvatar) {
      submitAssessment();
    }
  }, [state.status, state.primaryAvatar]);

  // Load avatar insight
  useEffect(() => {
    async function loadInsight() {
      if (!state.primaryAvatar || state.status !== 'completed') return;

      try {
        const { data, error } = await supabase
          .from('avatar_insights')
          .select('*')
          .eq('assessment_type', config.assessmentType)
          .eq('avatar_id', state.primaryAvatar)
          .single();

        if (error) {
          console.error('Error loading avatar insight:', error);
          // Use placeholder if not found
          setInsight({
            id: '',
            assessmentType: config.assessmentType,
            avatarId: state.primaryAvatar,
            label: state.primaryAvatar.charAt(0).toUpperCase() + state.primaryAvatar.slice(1),
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
  }, [state.primaryAvatar, config.assessmentType]);

  // Track scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!hasTrackedScroll.current && window.scrollY > 200) {
        trackResultsScrolled(
          config.assessmentType,
          config.assessmentVersion,
          state.sessionId,
          state.primaryAvatar
        );
        hasTrackedScroll.current = true;
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [config, state.sessionId, state.primaryAvatar]);

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
          primaryAvatar={state.primaryAvatar}
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
          primaryAvatar={state.primaryAvatar}
        />

        {/* Email Capture */}
        <EmailCaptureInline
          assessmentType={config.assessmentType}
          assessmentVersion={config.assessmentVersion}
          sessionId={state.sessionId}
          primaryAvatar={state.primaryAvatar}
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

