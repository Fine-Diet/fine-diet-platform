/**
 * Error State Component
 */

import React from 'react';

interface ErrorStateProps {
  message?: string;
}

export function ErrorState({ message = 'Something went wrong' }: ErrorStateProps) {
  return (
    <div className="min-h-screen bg-brand-900 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-white text-lg mb-4">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-dark_accent-500 text-white rounded-full hover:opacity-90 transition-opacity"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

