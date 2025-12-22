/**
 * Results Intro Component
 * Displays the primary avatar and introduction
 * Renders from JSON pack ONLY
 */

import React, { useEffect, useRef } from 'react';
import { trackResultsViewed } from '@/lib/assessmentAnalytics';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';

interface ResultsIntroProps {
  pack: ResultsPack;
  assessmentType: string;
  assessmentVersion: number;
  sessionId: string;
}

export function ResultsIntro({
  pack,
  assessmentType,
  assessmentVersion,
  sessionId,
}: ResultsIntroProps) {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!hasTracked.current) {
      trackResultsViewed(assessmentType as any, assessmentVersion, sessionId, pack.label);
      hasTracked.current = true;
    }
  }, [pack.label, assessmentType, assessmentVersion, sessionId]);

  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 antialiased">
        Your Gut Check Results
      </h1>
      <h2 className="text-2xl md:text-3xl font-semibold text-dark_accent-500 mb-4 antialiased">
        {pack.label}
      </h2>
      <p className="text-lg text-neutral-200 max-w-2xl mx-auto antialiased">
        {pack.summary}
      </p>
    </div>
  );
}

