/**
 * useResultsPackResolution
 *
 * Owns results-pack loading + first-render pinning for the results screen.
 * Extracted from the inline effect in `ResultsScreen.tsx`. Behavior preserved:
 *
 *   • Waits until submissionData has `primary_avatar` + `assessment_type`.
 *   • Calls GET /api/results-packs/resolve with assessmentType, resultsVersion
 *     (GUT_CHECK_RESULTS_CONTENT_VERSION), levelId, and — when present — the
 *     pinned `metadata.resultsPackRef`. Forwards `preview=1` when the route is
 *     in preview mode (editor/admin previewing a results-pack revision).
 *   • On success: stores the pack.
 *   • On the first render with a freshly resolved CMS ref, pins it to the
 *     submission via POST /api/assessments/update-pack-ref (non-blocking).
 *   • On failure: surfaces a user-facing error.
 *
 * Safety improvement over the old inline effect: `isLoading` starts true and only
 * flips to false once an attempt has completed. Combined with the submission
 * hook's loading state in `ResultsScreen`, this removes a brief "Results Not
 * Found" flash that could appear between submission-load and pack-load. The
 * happy-path rendered output is unchanged.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';
import { GUT_CHECK_RESULTS_CONTENT_VERSION } from '@/lib/assessments/results/constants';
import type { SubmissionData } from '@/lib/assessments/results/types';

export interface UseResultsPackResolution {
  resultsPack: ResultsPack | null;
  isLoading: boolean;
  error: string | null;
}

export function useResultsPackResolution(
  submissionData: SubmissionData | null
): UseResultsPackResolution {
  const router = useRouter();
  const [resultsPack, setResultsPack] = useState<ResultsPack | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const previewQuery = router.query.preview;
  const isPreviewRequest = previewQuery === '1' || previewQuery === 'true';

  useEffect(() => {
    // Waiting for the submission fetch — keep the loading state asserted so the
    // screen stays on the loading spinner (and off the not-found branch) until
    // there is something to resolve a pack for.
    if (!submissionData) {
      return;
    }
    // Have a submission row but it cannot drive a pack (no primary_avatar /
    // assessment_type). Let the screen fall through to the not-found branch
    // rather than spinning forever.
    if (!submissionData.primary_avatar || !submissionData.assessment_type) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPack() {
      if (!submissionData) return;

      const levelId = submissionData.primary_avatar;
      const resultsVersion = GUT_CHECK_RESULTS_CONTENT_VERSION;
      const existingRef = submissionData.metadata?.resultsPackRef as any;

      try {
        const params = new URLSearchParams({
          assessmentType: submissionData.assessment_type,
          resultsVersion,
          levelId,
        });
        if (isPreviewRequest) {
          params.set('preview', '1');
        }
        if (existingRef) {
          params.set('resultsPackRef', JSON.stringify(existingRef));
        }

        const response = await fetch(`/api/results-packs/resolve?${params.toString()}`);
        const result = await response.json();

        if (cancelled) return;

        if (!response.ok || !result.success || !result.pack) {
          throw new Error(result.error || 'Failed to load results pack');
        }

        setResultsPack(result.pack);
        setIsLoading(false);

        // Pin the pack reference on first render (if not already pinned).
        if (!existingRef && result.resultsPackRef) {
          fetch('/api/assessments/update-pack-ref', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              submissionId: submissionData.id,
              resultsPackRef: result.resultsPackRef,
            }),
          }).catch((err) => {
            console.warn('Failed to pin results pack ref (non-blocking):', err);
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading results pack:', err);
        setError(
          'Unable to load results content. Please try again or contact support if this issue persists.'
        );
        setIsLoading(false);
      }
    }

    loadPack();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionData, isPreviewRequest]);

  return { resultsPack, isLoading, error };
}
