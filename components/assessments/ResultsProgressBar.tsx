/**
 * Results Progress Bar Component
 * Shows results page progress
 */

import React from 'react';

interface ResultsProgressBarProps {
  currentPage: number;
  totalPages: number;
}

export function ResultsProgressBar({ currentPage, totalPages }: ResultsProgressBarProps) {
  const isLastPage = currentPage === totalPages;
  
  return (
    <div className="w-full">
      {/* Headline */}
      <h2 className="text-base font-semibold text-white text-left mb-4">
        {isLastPage 
          ? 'Your Results → Next Step'
          : `Results ${currentPage} of ${totalPages}`
        }
      </h2>
      
      {/* Progress Segments */}
      <div className="flex gap-1">
        {Array.from({ length: totalPages }, (_, index) => {
          const pageNum = index + 1;
          const isCompleted = pageNum < currentPage;
          const isActive = pageNum === currentPage;
          
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

