/**
 * useAssessmentSubmissionResult
 *
 * Owns the authoritative submission fetch for the results screen:
 *   GET /api/assessments/submission?submission_id=...
 *
 * Extracted from the inline effect in `ResultsScreen.tsx`. Behavior preserved:
 *   • Missing/non-string submission id → error "Missing submission ID".
 *   • Non-success or empty response → error from the API (or a generic fallback).
 *   • Success → submissionData populated.
 *
 * The hook does NOT touch results-pack loading or auth/claim — those live in
 * `useResultsPackResolution` and `useAssessmentClaimFlow` respectively. It does
 * expose `setSubmissionData` so the claim flow can refresh the row in place after
 * a successful post-auth claim (same pattern the old component used).
 */

import { useEffect, useState } from 'react';
import type { SubmissionData } from '@/lib/assessments/results/types';

export interface UseAssessmentSubmissionResult {
  submissionData: SubmissionData | null;
  isLoading: boolean;
  error: string | null;
  setSubmissionData: (data: SubmissionData | null) => void;
}

export function useAssessmentSubmissionResult(
  submissionId: string | string[] | undefined
): UseAssessmentSubmissionResult {
  const [submissionData, setSubmissionData] = useState<SubmissionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSubmission() {
      if (!submissionId || typeof submissionId !== 'string') {
        setError('Missing submission ID');
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/assessments/submission?submission_id=${submissionId}`
        );
        const result = await response.json();

        if (cancelled) return;

        if (!result.success || !result.data) {
          setError(result.error || 'Failed to load submission');
          setIsLoading(false);
          return;
        }

        setSubmissionData(result.data);
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching submission:', err);
        setError('Failed to load results. Please try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchSubmission();

    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  return { submissionData, isLoading, error, setSubmissionData };
}
