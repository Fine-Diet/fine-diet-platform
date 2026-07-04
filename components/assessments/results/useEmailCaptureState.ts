/**
 * useEmailCaptureState
 *
 * Shared state machine for the two "email me" controls on the results screen:
 *   • `MethodLinkEmail`  — "Email me the Method video link" (emailType: method_link)
 *   • `EmailYourResults` — "Email your results"            (emailType: results)
 *
 * Both previously duplicated the same auth-check + guest-state + send logic
 * inline inside `ResultsScreen.tsx`. This hook consolidates that logic; the two
 * components keep their own rendered output (button vs. inline form) and simply
 * consume the exposed state + actions.
 *
 * Behavior preserved:
 *   • Check Supabase browser session → `logged_in` when an auth email exists.
 *   • Otherwise `guest_with_email` when the submission row has an email, else
 *     `guest_no_email`.
 *   • `sendToEmail(email)` POSTs to /api/assessments/email-capture with the
 *     given `emailType`, then transitions to `sent`.
 *   • `requestInput()` transitions to `needs_input` (used by MethodLinkEmail's
 *     text-button path for guests without an email).
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabaseBrowser';
import { GUT_CHECK_RESULTS_CONTENT_VERSION } from '@/lib/assessments/results/constants';
import type { SubmissionData } from '@/lib/assessments/results/types';

export type EmailCaptureState =
  | 'checking'
  | 'logged_in'
  | 'guest_with_email'
  | 'guest_no_email'
  | 'sent'
  | 'needs_input';

export interface UseEmailCaptureState {
  emailState: EmailCaptureState;
  authUser: { email: string } | null;
  inputEmail: string;
  setInputEmail: (value: string) => void;
  isSubmitting: boolean;
  error: string | null;
  sentEmail: string | null;
  /** Send to a known email (auth or submission). Returns true on success. */
  sendToEmail: (email: string) => Promise<boolean>;
  /** Submit handler for the inline input form. */
  submitForm: (e: React.FormEvent) => Promise<void>;
  /** Transition to the input form (used by the text-button guest path). */
  requestInput: () => void;
}

export function useEmailCaptureState(
  submissionData: SubmissionData,
  emailType: 'method_link' | 'results'
): UseEmailCaptureState {
  const [authUser, setAuthUser] = useState<{ email: string } | null>(null);
  const [emailState, setEmailState] = useState<EmailCaptureState>('checking');
  const [inputEmail, setInputEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function checkStates() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user?.email) {
          setAuthUser({ email: session.user.email });
          setEmailState('logged_in');
          return;
        }
      } catch (err) {
        console.warn('Error checking auth:', err);
      }
      if (cancelled) return;
      // Guest state — use submissionData.email (not metadata).
      setEmailState(submissionData.email ? 'guest_with_email' : 'guest_no_email');
    }
    checkStates();
    return () => {
      cancelled = true;
    };
  }, [submissionData]);

  const sendToEmail = async (emailToUse: string): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/assessments/email-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailToUse,
          assessmentType: submissionData.assessment_type,
          assessmentVersion: submissionData.assessment_version,
          sessionId: submissionData.session_id,
          levelId: submissionData.primary_avatar,
          resultsVersion: GUT_CHECK_RESULTS_CONTENT_VERSION,
          submissionId: submissionData.id,
          emailType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send email');
      }

      setSentEmail(emailToUse);
      setEmailState('sent');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputEmail || isSubmitting) return;
    await sendToEmail(inputEmail);
  };

  const requestInput = () => {
    setEmailState('needs_input');
  };

  // Typing clears any prior error — matches the inline components' old behavior.
  const handleSetInputEmail = (value: string) => {
    setInputEmail(value);
    setError(null);
  };

  return {
    emailState,
    authUser,
    inputEmail,
    setInputEmail: handleSetInputEmail,
    isSubmitting,
    error,
    sentEmail,
    sendToEmail,
    submitForm,
    requestInput,
  };
}
