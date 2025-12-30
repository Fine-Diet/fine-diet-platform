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
  const currentQuestion = currentIndex + 1;

  return (
    <div className="w-full">
      {/* Headline */}
      <h2 className="text-base font-semibold text-[#4F4234] text-left mb-4">
        Question {currentQuestion} of {totalQuestions}
      </h2>
      
      {/* Progress Segments */}
      <div className="flex gap-1">
        {Array.from({ length: totalQuestions }, (_, index) => {
          const isCompleted = index < currentIndex;
          const isActive = index === currentIndex;
          
          return (
            <div
              key={index}
              className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
                isCompleted || isActive
                  ? 'bg-[#6AB1AE]'
                  : 'bg-[#E3E3E3]'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

