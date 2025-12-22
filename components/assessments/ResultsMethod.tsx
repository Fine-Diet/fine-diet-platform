/**
 * Results Method Component
 * Displays method positioning and VSL link
 * Renders from JSON pack ONLY
 */

import React from 'react';
import { trackMethodVslClicked } from '@/lib/assessmentAnalytics';
import { Button } from '@/components/ui/Button';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';

interface ResultsMethodProps {
  pack: ResultsPack;
  assessmentType: string;
  assessmentVersion: number;
  sessionId: string;
  levelId: string;
}

export function ResultsMethod({
  pack,
  assessmentType,
  assessmentVersion,
  sessionId,
  levelId,
}: ResultsMethodProps) {
  const handleVslClick = () => {
    trackMethodVslClicked(
      assessmentType as any,
      assessmentVersion,
      sessionId,
      levelId,
      '/method' // Placeholder VSL URL
    );
    // Navigate to VSL (placeholder)
    window.location.href = '/method';
  };

  return (
    <div className="mb-8">
      {pack.methodPositioning && (
        <div className="mb-6">
          <p className="text-lg text-neutral-200 mb-4 antialiased">{pack.methodPositioning}</p>
        </div>
      )}

      <Button variant="primary" size="lg" onClick={handleVslClick}>
        Learn The Fine Diet Method
      </Button>
    </div>
  );
}

