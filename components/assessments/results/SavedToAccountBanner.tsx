/**
 * SavedToAccountBanner
 *
 * Confirmation banner shown when a submission is attached to a user account.
 * Extracted verbatim from `ResultsScreen.tsx` (presentational only).
 */

import React from 'react';

export function SavedToAccountBanner() {
  return (
    <div className="mb-2 p-2">
      <p className="text-white text-sm font-normal antialiased text-center">
        Results saved to your account. View in{' '}
        <a
          href="/account/assessments"
          className="text-denim-900 font-semibold hover:opacity-80 transition-opacity underline"
        >
          My Assessments
        </a>
      </p>
    </div>
  );
}
