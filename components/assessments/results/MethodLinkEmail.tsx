/**
 * MethodLinkEmail
 *
 * "Email me the Method video link" control on results Page 3. Extracted from
 * `ResultsScreen.tsx` unchanged in rendered output. State logic now lives in
 * `useEmailCaptureState(emailType: 'method_link')`.
 */

import React from 'react';
import { useEmailCaptureState } from './useEmailCaptureState';
import type { SubmissionData } from '@/lib/assessments/results/types';

export function MethodLinkEmail({
  submissionData,
}: {
  submissionData: SubmissionData;
  // `page3` was previously passed but unused; kept out of the extracted shape.
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
    requestInput,
  } = useEmailCaptureState(submissionData, 'method_link');

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

  // Needs input - show email input form
  if (emailState === 'needs_input') {
    return (
      <form onSubmit={submitForm} className="space-y-2">
        <input
          type="email"
          value={inputEmail}
          onChange={(e) => {
            setInputEmail(e.target.value);
          }}
          placeholder="Enter your email"
          required
          className="w-full px-4 py-2 rounded-full text-base font-semibold text-[#0A0800] bg-neutral-100 border-none focus:outline-none focus:ring-2 focus:ring-denim-900"
        />
        <button
          type="submit"
          disabled={!inputEmail || isSubmitting}
          className="w-full px-4 py-2 text-sm font-semibold text-white bg-denim-900 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isSubmitting ? 'Sending...' : 'Send Link'}
        </button>
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}
      </form>
    );
  }

  const handleClick = () => {
    if (emailState === 'logged_in' && authUser) {
      sendToEmail(authUser.email);
    } else if (emailState === 'guest_with_email' && submissionData.email) {
      sendToEmail(submissionData.email);
    } else {
      requestInput();
    }
  };

  // Default state - show text-only button that triggers action based on user state
  return (
    <>
      <button
        onClick={handleClick}
        disabled={isSubmitting}
        className="text-denim-900 font-semibold hover:opacity-80 transition-opacity text-sm disabled:opacity-50"
      >
        {isSubmitting ? 'Sending...' : 'Email me the Method video link'}
      </button>
      {error && (
        <span className="text-red-400 text-sm ml-2">{error}</span>
      )}
    </>
  );
}
