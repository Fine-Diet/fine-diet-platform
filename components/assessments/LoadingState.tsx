/**
 * Loading State Component
 */

import React from 'react';

export function LoadingState() {
  return (
    <div className="min-h-screen bg-brand-900 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-dark_accent-500 border-t-transparent mb-4"></div>
        <p className="text-white text-lg">Loading...</p>
      </div>
    </div>
  );
}

