/**
 * Results Method Component
 * Displays method positioning and VSL link
 */

import React from 'react';
import { trackMethodVslClicked } from '@/lib/assessmentAnalytics';
import { Button } from '@/components/ui/Button';
import type { AvatarInsight } from '@/lib/assessmentTypes';

interface ResultsMethodProps {
  insight: AvatarInsight | null;
  assessmentType: string;
  assessmentVersion: number;
  sessionId: string;
  primaryAvatar: string;
}

export function ResultsMethod({
  insight,
  assessmentType,
  assessmentVersion,
  sessionId,
  primaryAvatar,
}: ResultsMethodProps) {
  const handleVslClick = () => {
    trackMethodVslClicked(
      assessmentType as any,
      assessmentVersion,
      sessionId,
      primaryAvatar,
      '/method' // Placeholder VSL URL
    );
    // Navigate to VSL (placeholder)
    window.location.href = '/method';
  };

  return (
    <div className="mb-8">
      {insight?.methodPositioning && (
        <div className="mb-6">
          <p className="text-lg text-neutral-200 mb-4 antialiased">{insight.methodPositioning}</p>
        </div>
      )}

      <Button variant="primary" size="lg" onClick={handleVslClick}>
        Learn The Fine Diet Method
      </Button>
    </div>
  );
}

