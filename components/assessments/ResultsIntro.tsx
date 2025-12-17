/**
 * Results Intro Component
 * Displays the primary avatar and introduction
 */

import React, { useEffect, useRef } from 'react';
import { trackResultsViewed } from '@/lib/assessmentAnalytics';
import type { AvatarInsight } from '@/lib/assessmentTypes';

interface ResultsIntroProps {
  primaryAvatar: string;
  insight: AvatarInsight | null;
  assessmentType: string;
  assessmentVersion: number;
  sessionId: string;
}

export function ResultsIntro({
  primaryAvatar,
  insight,
  assessmentType,
  assessmentVersion,
  sessionId,
}: ResultsIntroProps) {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!hasTracked.current) {
      trackResultsViewed(assessmentType as any, assessmentVersion, sessionId, primaryAvatar);
      hasTracked.current = true;
    }
  }, [primaryAvatar, assessmentType, assessmentVersion, sessionId]);

  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 antialiased">
        Your Gut Check Results
      </h1>
      {insight && (
        <>
          <h2 className="text-2xl md:text-3xl font-semibold text-dark_accent-500 mb-4 antialiased">
            {insight.label}
          </h2>
          <p className="text-lg text-neutral-200 max-w-2xl mx-auto antialiased">
            {insight.summary}
          </p>
        </>
      )}
    </div>
  );
}

