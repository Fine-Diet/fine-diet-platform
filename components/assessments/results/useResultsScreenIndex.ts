/**
 * useResultsScreenIndex
 *
 * Owns the 3-page flow's screen index state: initialization from the `?screen=`
 * query param and shallow URL sync when the index changes. Extracted from the
 * inline effects in `ResultsScreen.tsx`. Behavior preserved:
 *
 *   • Only packs with Flow v2 OR legacy core fields participate in the 3-page
 *     flow (decided via `detectResultsFlow`).
 *   • `?screen=1/2/3` is converted to a 0-based index and clamped to 0..2,
 *     once, after the pack is loaded and the router is ready.
 *   • When the index changes, the URL is updated with `router.replace` shallow
 *     so the back/forward stack and shareable deep links keep working.
 *
 * Extracted as a hook so `ResultsScreen` no longer carries screen-state plumbing
 * alongside rendering.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';
import { detectResultsFlow } from '@/lib/assessments/results/resolveResultsScreenContent';
import type { SubmissionData } from '@/lib/assessments/results/types';

export type ScreenIndex = 0 | 1 | 2;

export interface UseResultsScreenIndex {
  screenIndex: ScreenIndex;
  setScreenIndex: (index: ScreenIndex) => void;
}

function parseScreenParam(value: string | string[] | undefined): number | null {
  if (!value) return null;
  const screenNum = typeof value === 'string' ? parseInt(value, 10) : parseInt(value[0], 10);
  if (Number.isNaN(screenNum)) return null;
  return screenNum;
}

export function useResultsScreenIndex(
  resultsPack: ResultsPack | null,
  submissionData: SubmissionData | null
): UseResultsScreenIndex {
  const router = useRouter();
  const [screenIndex, setScreenIndex] = useState<ScreenIndex>(0);
  const hasInitializedScreen = useRef(false);

  // Initialize screenIndex from ?screen= (only for multi-page packs, only once).
  useEffect(() => {
    if (!resultsPack || !router.isReady || hasInitializedScreen.current) return;

    const { renderMultiPage } = detectResultsFlow(resultsPack);

    if (renderMultiPage && submissionData) {
      const screenNum = parseScreenParam(router.query.screen);
      if (screenNum !== null && screenNum >= 1 && screenNum <= 3) {
        setScreenIndex(Math.min(screenNum - 1, 2) as ScreenIndex);
      }
      hasInitializedScreen.current = true;
    } else if (!renderMultiPage) {
      // For packs without flow/legacy fields, mark as initialized so we don't retry.
      hasInitializedScreen.current = true;
    }
  }, [resultsPack, router.isReady, router.query.screen, submissionData]);

  // Update URL when screenIndex changes (only for multi-page packs).
  useEffect(() => {
    if (!resultsPack || !router.isReady || !submissionData?.id) return;

    const { renderMultiPage } = detectResultsFlow(resultsPack);
    if (!renderMultiPage) return;

    const newScreen = screenIndex + 1; // 0,1,2 → 1,2,3
    const currentScreenNum = parseScreenParam(router.query.screen) ?? 1;

    if (currentScreenNum !== newScreen) {
      router.replace(
        {
          pathname: router.pathname,
          query: { ...router.query, screen: newScreen },
        },
        undefined,
        { shallow: true }
      );
    }
  }, [screenIndex, resultsPack, router, submissionData?.id]);

  return { screenIndex, setScreenIndex };
}
