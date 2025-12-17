/**
 * Progress Bar Component
 * Shows assessment progress
 */

import React from 'react';

interface ProgressBarProps {
  currentIndex: number;
  totalQuestions: number;
}

export function ProgressBar({ currentIndex, totalQuestions }: ProgressBarProps) {
  const progress = ((currentIndex + 1) / totalQuestions) * 100;

  return (
    <div className="w-full h-1 bg-neutral-200 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-dark_accent-500 to-dark_accent-700 transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

