/**
 * Pure resolver for the results screen's multi-page content.
 *
 * This isolates the Gut Check results-pack → screen-content adapter that
 * previously lived inline in `ResultsScreen.tsx`'s render body. It owns three
 * responsibilities that were tangled into the component:
 *
 *   1. Flow detection — distinguishing Flow v2 packs (full `flow.page1/2/3`
 *      structure) from legacy packs that only carry the core
 *      `summary` / `keyPatterns` / `firstFocusAreas` fields.
 *   2. Page content extraction — flow-first with a deterministic legacy
 *      fallback so older packs still render the 3-page flow.
 *   3. Video URL resolution — Flow v2 `videoAssetUrl` first, then the Gut Check
 *      deterministic level video map, with YouTube URLs converted to embed URLs.
 *
 * The function is pure (no React, no router, no fetch) so it can be unit-tested.
 * The rendered JSX in `ResultsScreen` consumes the resolved content objects
 * unchanged, so happy-path visuals are identical.
 *
 * Where future result templates / full results-pack preview should plug in:
 * add a new branch in `resolveResultsScreenContent` (or a new resolver) keyed off
 * `assessmentType` / a pack `schemaVersion`. `detectResultsFlow` is the single
 * place that decides whether a pack gets the 3-page flow at all.
 */

import type { ResultsPack } from './loadResultsPack';
import { getLevelSpecificVideo } from './getLevelSpecificVideo';
import { parseYouTube, buildYouTubeEmbedUrl } from '@/lib/video/youtube';
import type {
  ResultsScreenPage1,
  ResultsScreenPage2,
  ResultsScreenPage3,
} from './types';

export interface ResultsFlowDetection {
  hasFlowV2: boolean;
  hasLegacyFields: boolean;
  /** True when the pack should render the 3-page flow (v2 or legacy). */
  renderMultiPage: boolean;
}

/**
 * Detect whether a results pack carries Flow v2 structure and/or the legacy
 * core fields. Kept separate from `resolveResultsScreenContent` so the screen
 * index hook (`useResultsScreenIndex`) can decide URL-sync behavior without
 * paying for full content resolution.
 */
export function detectResultsFlow(resultsPack: ResultsPack): ResultsFlowDetection {
  const flow = resultsPack?.flow as any;
  const hasFlowV2 = !!(
    flow &&
    flow.page1 &&
    flow.page2 &&
    flow.page3 &&
    flow.page1.headline &&
    flow.page1.body &&
    flow.page1.snapshotBullets &&
    flow.page1.meaningBody &&
    flow.page2.headline &&
    flow.page2.stepBullets &&
    flow.page2.videoCtaLabel &&
    flow.page2.videoAssetUrl &&
    flow.page3.problemHeadline &&
    flow.page3.problemBody &&
    flow.page3.tryBullets &&
    flow.page3.mechanismTitle &&
    flow.page3.mechanismBodyTop &&
    flow.page3.mechanismPills &&
    flow.page3.methodTitle &&
    flow.page3.methodBody &&
    flow.page3.methodLearnBullets &&
    flow.page3.methodCtaLabel &&
    flow.page3.methodCtaUrl &&
    flow.page3.methodEmailLinkLabel
  );

  const hasLegacyFields = !!(
    resultsPack &&
    resultsPack.summary &&
    resultsPack.keyPatterns &&
    resultsPack.firstFocusAreas
  );

  return {
    hasFlowV2,
    hasLegacyFields,
    renderMultiPage: hasFlowV2 || hasLegacyFields,
  };
}

export interface ResolvedResultsScreenContent {
  hasFlowV2: boolean;
  hasLegacyFields: boolean;
  renderMultiPage: boolean;
  page1: ResultsScreenPage1;
  page2: ResultsScreenPage2;
  page3: ResultsScreenPage3;
  /** Embed-ready video URL (YouTube parsed) or null when no video applies. */
  videoUrl: string | null;
}

/**
 * Resolve the full screen content for a results pack + level id.
 *
 * @param resultsPack - The loaded results pack (CMS or file).
 * @param levelId     - `submissionData.primary_avatar` (level id or avatar id).
 *                       Passed to `getLevelSpecificVideo` for the legacy fallback.
 */
export function resolveResultsScreenContent(
  resultsPack: ResultsPack,
  levelId: string
): ResolvedResultsScreenContent {
  const { hasFlowV2, hasLegacyFields, renderMultiPage } = detectResultsFlow(resultsPack);
  const flow = resultsPack.flow as any;

  const page1: ResultsScreenPage1 = hasFlowV2 && flow.page1
    ? {
        headline: flow.page1.headline,
        body: flow.page1.body,
        snapshotTitle: flow.page1.snapshotTitle || "What We're Seeing",
        snapshotBullets: flow.page1.snapshotBullets,
        meaningTitle: flow.page1.meaningTitle || "What This Often Means",
        meaningBody: flow.page1.meaningBody,
      }
    : {
        // Legacy fallback
        headline: resultsPack.label,
        body: [resultsPack.summary || ''],
        snapshotTitle: "What We're Seeing",
        snapshotBullets: resultsPack.keyPatterns?.slice(0, 3) || ['', '', ''],
        meaningTitle: "What This Often Means",
        meaningBody:
          resultsPack.methodPositioning ||
          'Generic gut advice assumes the same inputs produce the same outcomes for everyone.',
      };

  const page2: ResultsScreenPage2 = hasFlowV2 && flow.page2
    ? {
        headline: flow.page2.headline || 'First Steps',
        stepBullets: flow.page2.stepBullets,
        videoCtaLabel: flow.page2.videoCtaLabel,
        videoAssetUrl: flow.page2.videoAssetUrl,
        emailHelper: flow.page2.emailHelper,
        pdfHelper: flow.page2.pdfHelper,
      }
    : (() => {
        const legacyVideoUrl = getLevelSpecificVideo(levelId);
        return {
          headline: 'First Steps',
          stepBullets: resultsPack.firstFocusAreas?.slice(0, 3) || ['', '', ''],
          videoCtaLabel: 'Watch Your Gut Pattern Breakdown',
          videoAssetUrl: legacyVideoUrl,
          emailHelper: undefined,
          pdfHelper: undefined,
        };
      })();

  const page3: ResultsScreenPage3 = hasFlowV2 && flow.page3
    ? {
        problemHeadline: flow.page3.problemHeadline,
        problemBody: flow.page3.problemBody,
        tryTitle: flow.page3.tryTitle,
        tryBullets: flow.page3.tryBullets,
        tryCloser: flow.page3.tryCloser,
        mechanismTitle: flow.page3.mechanismTitle,
        mechanismBodyTop: flow.page3.mechanismBodyTop,
        mechanismPills: flow.page3.mechanismPills || [],
        mechanismBodyBottom: flow.page3.mechanismBodyBottom,
        methodTitle: flow.page3.methodTitle,
        methodBody: flow.page3.methodBody,
        methodLearnTitle: flow.page3.methodLearnTitle || "In the video, you'll learn",
        methodLearnBullets: flow.page3.methodLearnBullets,
        methodCtaLabel: flow.page3.methodCtaLabel,
        methodCtaUrl: flow.page3.methodCtaUrl,
        methodEmailLinkLabel: flow.page3.methodEmailLinkLabel,
      }
    : {
        // Legacy fallback — minimal generic narrative
        problemHeadline: 'Most gut advice ignores patterns like this.',
        problemBody: [
          'Generic digestive advice assumes that the same inputs produce the same outcomes for everyone.',
        ],
        tryTitle: 'What most people try',
        tryBullets: [
          'Trying to fix symptoms instead of understanding signals',
          'Chasing consistency through control',
          'Interpreting fluctuation as failure',
        ],
        tryCloser: 'This is where many people get stuck.',
        mechanismTitle: 'The Fine Diet Method',
        mechanismBodyTop: 'The Fine Diet Method was built around a different starting point.',
        mechanismPills: [],
        mechanismBodyBottom:
          'Instead of asking, "What should I add or remove?" it begins with, "What pattern is present — and what does it need to stabilize over time?"',
        methodTitle: 'Learn The Fine Diet Method',
        methodBody: [
          "That distinction matters. And it's the foundation for making changes that actually hold.",
        ],
        methodLearnTitle: "In the video, you'll learn",
        methodLearnBullets: [
          'How to identify your specific gut pattern',
          'What your pattern needs to stabilize',
          'How to make changes that actually hold',
        ],
        methodCtaLabel: 'Watch How The Fine Diet Method Works',
        methodCtaUrl: '/method',
        methodEmailLinkLabel: 'Email me the link',
      };

  // Determine raw video URL: Flow v2 first, then legacy deterministic mapping.
  const rawVideoUrl = hasFlowV2 && page2.videoAssetUrl
    ? page2.videoAssetUrl
    : hasLegacyFields
      ? getLevelSpecificVideo(levelId)
      : null;

  const videoUrl = normalizeVideoUrl(rawVideoUrl);

  return {
    hasFlowV2,
    hasLegacyFields,
    renderMultiPage,
    page1,
    page2,
    page3,
    videoUrl,
  };
}

/**
 * Convert a raw video URL into an embed-ready URL.
 * YouTube URLs are parsed and rebuilt as embed URLs; other URLs (Vimeo, internal
 * routes) are returned as-is. Returns null when no URL is provided.
 */
export function normalizeVideoUrl(rawVideoUrl: string | null | undefined): string | null {
  if (!rawVideoUrl) return null;
  const youtubeParse = parseYouTube(rawVideoUrl);
  if (youtubeParse) {
    return buildYouTubeEmbedUrl(youtubeParse.videoId, youtubeParse.startSeconds);
  }
  return rawVideoUrl;
}
