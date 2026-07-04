/**
 * EmailYourResults
 *
 * "Email your results" control on results Page 2. Extracted from
 * `ResultsScreen.tsx` unchanged in rendered output. State logic now lives in
 * `useEmailCaptureState(emailType: 'results')`.
 */

import React from 'react';
import { useEmailCaptureState } from './useEmailCaptureState';
import type { SubmissionData } from '@/lib/assessments/results/types';

export function EmailYourResults({
  submissionData,
  onSuccess,
}: {
  submissionData: SubmissionData;
  // `page2` was previously passed but unused; kept out of the extracted shape.
  onSuccess?: () => void;
}) {
  const {
    emailState,
    authUser,
    inputEmail,
    setInputEmail,
    isSubmitting,
    error,
    sentEmail,
    sendToEmail,
    submitForm,
  } = useEmailCaptureState(submissionData, 'results');

  if (emailState === 'checking') {
    return null;
  }

  // Success state - show "Sent to {email}"
  if (emailState === 'sent' && sentEmail) {
    return (
      <div className="text-center">
        <p className="text-white text-sm font-normal antialiased">
          Sent to {sentEmail}
        </p>
      </div>
    );
  }

  // Logged in - no input, button sends to auth email
  if (emailState === 'logged_in' && authUser) {
    return (
      <div className="text-center">
        <button
          onClick={async () => {
            if (await sendToEmail(authUser.email)) onSuccess?.();
          }}
          className="w-full px-6 py-4 rounded-full text-base font-semibold text-[#0A0800] bg-neutral-100 hover:opacity-90 transition-opacity disabled:opacity-50"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Sending...' : 'Email your results'}
        </button>
        {error && (
          <p className="text-red-400 text-sm text-center mt-2">{error}</p>
        )}
      </div>
    );
  }

  // Guest with submission email - no input, button sends to submission email
  if (emailState === 'guest_with_email' && submissionData.email) {
    return (
      <div className="text-center">
        <button
          onClick={async () => {
            if (await sendToEmail(submissionData.email!)) onSuccess?.();
          }}
          className="w-full px-6 py-4 rounded-full text-base font-semibold text-[#0A0800] bg-neutral-100 hover:opacity-90 transition-opacity disabled:opacity-50"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Sending...' : 'Email your results'}
        </button>
        {error && (
          <p className="text-red-400 text-sm text-center mt-2">{error}</p>
        )}
      </div>
    );
  }

  // Guest no email - show inline input
  return (
    <form onSubmit={submitForm} className="mb-0">
      <div className="flex flex-col sm:flex-row gap-3 mx-auto">
        <div className="flex-1 relative">
          <input
            type="email"
            value={inputEmail}
            onChange={(e) => {
              setInputEmail(e.target.value);
            }}
            placeholder="Email Your Results"
            required
            disabled={isSubmitting}
            className="w-full px-8 py-4 rounded-full border-0 bg-neutral-100 text-[#0A0800] placeholder-[#0A0800] text-base font-semibold focus:outline-none focus:ring-2 focus:ring-denim-500 antialiased disabled:opacity-50 pr-12"
          />
          <button
            type="submit"
            disabled={isSubmitting || !inputEmail}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 pr-5 disabled:opacity-50"
          >
            <svg
              className="w-5 h-5 text-brand-900"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 15.75 3 12m0 0 3.75-3.75M3 12h18"
              />
            </svg>
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-2 text-center">
          <p className="text-sm text-red-400 antialiased">{error}</p>
        </div>
      )}
    </form>
  );
}
