import { acquireOnscreenText } from '@/lib/plans/onscreenText/onscreenTextService';
import {
  fetchTikTokCaptionViaOembed,
  normalizeTikTokPageUrlForOembed,
} from './platformEvidence/tiktokOEmbed';
import { fetchYouTubePublicPageMetadata } from '@/lib/plans/videoTranscript/adapters/youtubeAdapter';
import {
  acquireVideoTranscript,
  classifyVideoUrl,
} from '@/lib/plans/videoTranscript/videoTranscriptService';
import type { CreateEvidenceSourceInput } from './persistence';
import type {
  SocialImportCreateInput,
  SocialImportPlatform,
  SocialImportReviewItem,
} from './types';

const MIN_USEFUL_CHARS = 20;
/** Matches YouTube adapter description fallback threshold. */
const YOUTUBE_STRONG_DESCRIPTION_CHARS = 40;

export interface SocialEvidenceAcquisitionResult {
  sources: CreateEvidenceSourceInput[];
  review_items: SocialImportReviewItem[];
}

export async function acquireSocialEvidence(args: {
  personId: string;
  platform: SocialImportPlatform;
  url: string | null;
  input: SocialImportCreateInput;
}): Promise<SocialEvidenceAcquisitionResult> {
  const { personId, platform, url, input } = args;
  const sources: CreateEvidenceSourceInput[] = [];
  const review_items: SocialImportReviewItem[] = [];

  if (url) {
    sources.push({
      source_kind: 'metadata',
      source_label: 'Source URL',
      platform,
      raw_text: url,
      normalized_text: url,
      quality: platform === 'unknown' ? 'weak' : 'partial',
      metadata_json: { url },
    });
  }

  const userHint = normalizeText(input.user_hint);
  if (userHint) {
    sources.push({
      source_kind: 'user_hint',
      source_label: 'User hint',
      platform,
      raw_text: userHint,
      normalized_text: userHint,
      quality: 'partial',
      metadata_json: {},
    });
  }

  const assisted = normalizeText(input.assisted_text);
  if (assisted) {
    sources.push({
      source_kind: 'user_assisted_text',
      source_label: 'User-assisted caption or transcript',
      platform,
      raw_text: assisted,
      normalized_text: assisted,
      quality: assisted.length >= MIN_USEFUL_CHARS ? 'strong' : 'weak',
      metadata_json: { user_supplied: true },
    });
  }

  const userOnscreenForSignals = normalizeText(input.onscreen_text);
  const hasUserSuppliedBody =
    (!!assisted && assisted.length >= MIN_USEFUL_CHARS) ||
    (!!userOnscreenForSignals && userOnscreenForSignals.length >= MIN_USEFUL_CHARS);

  if (url && platform === 'youtube') {
    const classification = classifyVideoUrl(url);
    const videoId = classification.video_id;
    let pageTitle: string | null = null;
    let pageDescription: string | null = null;

    if (videoId) {
      const pageMeta = await fetchYouTubePublicPageMetadata(videoId);
      pageTitle = pageMeta.title?.trim() || null;
      pageDescription = pageMeta.description?.trim() || null;
      const baseMeta = {
        acquisition_ladder_step: 1,
        acquisition_method: 'youtube_watch_page_html',
        video_id: videoId,
        page_fetch_error: pageMeta.error,
      } as const;

      if (pageTitle) {
        sources.push({
          source_kind: 'creator_caption',
          source_label: 'YouTube video title (public page)',
          platform,
          raw_text: pageTitle,
          normalized_text: pageTitle,
          quality: pageTitle.length >= 10 ? 'partial' : 'weak',
          metadata_json: { ...baseMeta, field: 'title' },
        });
      }
      if (pageDescription) {
        sources.push({
          source_kind: 'creator_caption',
          source_label: 'YouTube video description (public page)',
          platform,
          raw_text: pageDescription,
          normalized_text: pageDescription,
          quality:
            pageDescription.length >= YOUTUBE_STRONG_DESCRIPTION_CHARS
              ? 'strong'
              : 'weak',
          metadata_json: { ...baseMeta, field: 'description' },
        });
      }
      if (!pageTitle && !pageDescription) {
        sources.push({
          source_kind: 'metadata',
          source_label: 'YouTube public page metadata attempt',
          platform,
          raw_text: null,
          normalized_text: null,
          quality: 'unavailable',
          metadata_json: {
            ...baseMeta,
            acquisition_status: pageMeta.error ? 'failed' : 'unavailable',
            attempted_fields: ['title', 'description'],
          },
        });
      }
    } else {
      sources.push({
        source_kind: 'metadata',
        source_label: 'YouTube public page metadata attempt',
        platform,
        raw_text: null,
        normalized_text: null,
        quality: 'unavailable',
        metadata_json: {
          acquisition_ladder_step: 1,
          acquisition_method: 'youtube_watch_page_html',
          acquisition_status: 'unavailable',
          page_fetch_error: 'YouTube URL did not contain a recognizable video id.',
          attempted_fields: ['title', 'description'],
        },
      });
    }

    const outcome = await acquireVideoTranscript(url, {
      translationCtx: { personId },
      externalProviderCtx: { personId },
    });

    let transcriptAdded = false;
    if (
      outcome.status === 'acquired' &&
      outcome.transcript &&
      outcome.transcript.trim().length > 0
    ) {
      const transcript = outcome.transcript.trim();
      const pageCombined = [pageTitle, pageDescription].filter(Boolean).join('\n\n').trim();

      const skipAsDuplicateDescription =
        outcome.source === 'youtube_description' &&
        pageDescription &&
        transcript === pageCombined;

      const skipAsDuplicateTitleOnly =
        outcome.source === 'youtube_title_only' &&
        pageTitle &&
        transcript === pageTitle.trim();

      if (!skipAsDuplicateDescription && !skipAsDuplicateTitleOnly) {
        transcriptAdded = true;
        const source_kind =
          outcome.source === 'external_provider' ? 'external_transcript' : 'transcript';
        sources.push({
          source_kind,
          source_label: labelForTranscriptSource(outcome.source),
          platform,
          raw_text: transcript,
          normalized_text: transcript,
          language: outcome.language,
          quality:
            outcome.source === 'youtube_title_only'
              ? 'weak'
              : transcript.length >= MIN_USEFUL_CHARS
                ? 'strong'
                : 'weak',
          metadata_json: {
            video_id: outcome.video_id,
            transcript_source: outcome.source,
            acquisition_status: outcome.status,
            translated_from_language: outcome.translated_from_language ?? null,
            acquisition_ladder_step: 2,
            acquisition_method: `youtube_transcript:${outcome.source}`,
          },
        });
      }
    }

    const hasStrongRecipeBody =
      hasUserSuppliedBody ||
      (pageDescription?.length ?? 0) >= YOUTUBE_STRONG_DESCRIPTION_CHARS ||
      (transcriptAdded && outcome.source !== 'youtube_title_only');

    if (
      !hasStrongRecipeBody &&
      (pageTitle || outcome.source === 'youtube_title_only')
    ) {
      review_items.push({
        code: 'needs_user_assisted_text',
        severity: 'warning',
        message:
          'Only a short or title-level signal was recovered from YouTube (no strong caption/description body). Add caption, transcript, or on-screen text before trusting this draft.',
        evidence_refs: [],
      });
    } else if (
      !hasStrongRecipeBody &&
      outcome.status !== 'acquired' &&
      !pageTitle &&
      !pageDescription
    ) {
      review_items.push({
        code: 'needs_user_assisted_text',
        severity: 'warning',
        message:
          'Automatic YouTube acquisition did not recover a public title, description, or transcript. Add user-assisted text to continue.',
        evidence_refs: [],
      });
    }
  } else if (url && platform === 'tiktok') {
    const normalizedTikTok = normalizeTikTokPageUrlForOembed(url);
    const ttResult = normalizedTikTok
      ? await fetchTikTokCaptionViaOembed(normalizedTikTok)
      : null;

    if (normalizedTikTok && ttResult?.caption?.trim()) {
      const cap = ttResult.caption.trim();
      sources.push({
        source_kind: 'creator_caption',
        source_label: 'TikTok caption (oEmbed)',
        platform,
        raw_text: cap,
        normalized_text: cap,
        quality: cap.length >= YOUTUBE_STRONG_DESCRIPTION_CHARS ? 'strong' : 'weak',
        metadata_json: {
          acquisition_ladder_step: 1,
          acquisition_method: 'tiktok_oembed',
          author_name: ttResult.author_name,
          oembed_status: ttResult.status,
          http_status: ttResult.http_status,
          oembed_error: ttResult.error,
          oembed_url_used: normalizedTikTok,
        },
      });
    } else {
      sources.push({
        source_kind: 'metadata',
        source_label: 'TikTok oEmbed caption attempt',
        platform,
        raw_text: null,
        normalized_text: null,
        quality: 'unavailable',
        metadata_json: {
          acquisition_ladder_step: 1,
          acquisition_method: 'tiktok_oembed',
          acquisition_status: normalizedTikTok
            ? (ttResult?.status ?? 'unavailable')
            : 'invalid_url',
          author_name: ttResult?.author_name ?? null,
          oembed_status: ttResult?.status ?? null,
          http_status: ttResult?.http_status ?? null,
          oembed_error:
            ttResult?.error ??
            (normalizedTikTok ? null : 'TikTok URL could not be normalized.'),
          oembed_url_used: normalizedTikTok,
        },
      });
    }

    const captionLen = ttResult?.caption?.trim().length ?? 0;

    if (!hasUserSuppliedBody) {
      if (!normalizedTikTok) {
        review_items.push({
          code: 'needs_user_assisted_text',
          severity: 'warning',
          message:
            'This TikTok URL could not be normalized for automatic caption fetch. Add user-assisted caption, transcript, or on-screen text.',
          evidence_refs: [],
        });
      } else if (ttResult?.status === 'blocked') {
        review_items.push({
          code: 'needs_user_assisted_text',
          severity: 'warning',
          message:
            ttResult.error ??
            'TikTok blocked automatic caption fetch. Add user-assisted caption, transcript, or on-screen text.',
          evidence_refs: [],
        });
      } else if (
        ttResult &&
        (ttResult.status === 'network' ||
          ttResult.status === 'http_error' ||
          ttResult.status === 'invalid_json') &&
        captionLen === 0
      ) {
        review_items.push({
          code: 'needs_user_assisted_text',
          severity: 'warning',
          message:
            ttResult.error ??
            'Could not retrieve a TikTok caption automatically. Add user-assisted text to continue.',
          evidence_refs: [],
        });
      } else if (ttResult?.status === 'ok' && captionLen === 0) {
        review_items.push({
          code: 'needs_user_assisted_text',
          severity: assisted ? 'info' : 'warning',
          message:
            'TikTok oEmbed returned no caption text for this video. Add user-assisted caption, transcript, or on-screen text.',
          evidence_refs: [],
        });
      } else if (captionLen > 0 && captionLen < YOUTUBE_STRONG_DESCRIPTION_CHARS) {
        review_items.push({
          code: 'needs_user_assisted_text',
          severity: 'warning',
          message:
            'Only a short TikTok caption was recovered automatically. Add fuller caption, transcript, or on-screen text before trusting this draft.',
          evidence_refs: [],
        });
      }
    }
  } else if (url && (platform === 'instagram' || platform === 'facebook')) {
    review_items.push({
      code: 'needs_user_assisted_text',
      severity: assisted ? 'info' : 'warning',
      message:
        'Automatic caption acquisition is not implemented for Instagram or Facebook yet. Add user-assisted caption, transcript, or on-screen text.',
      evidence_refs: [],
    });
  }

  if (userOnscreenForSignals) {
    const outcome = await acquireOnscreenText({
      rawUrl: url,
      userSupplied: userOnscreenForSignals,
    });
    if (outcome.status === 'acquired' && outcome.text) {
      sources.push({
        source_kind: 'onscreen_text',
        source_label: 'User-supplied on-screen text',
        platform,
        raw_text: userOnscreenForSignals,
        normalized_text: outcome.text,
        quality: outcome.text.length >= MIN_USEFUL_CHARS ? 'strong' : 'weak',
        metadata_json: {
          source: outcome.source,
          extractor_key: outcome.extractor_key,
          user_supplied: outcome.source === 'user_supplied',
        },
      });
    }
  } else if (url && platform === 'youtube') {
    // Best-effort automated still OCR for YouTube only. The extractor
    // declines unless enabled; unavailable output is not recorded as
    // evidence because it cannot support claims.
    const outcome = await acquireOnscreenText({ rawUrl: url, userSupplied: null });
    if (outcome.status === 'acquired' && outcome.text) {
      sources.push({
        source_kind: 'onscreen_text',
        source_label: 'On-screen text extractor',
        platform,
        raw_text: outcome.text,
        normalized_text: outcome.text,
        quality: 'partial',
        metadata_json: {
          source: outcome.source,
          extractor_key: outcome.extractor_key,
          provider_key: outcome.provider_key ?? null,
          model_key: outcome.model_key ?? null,
        },
      });
    }
  }

  const hasClaimSupportingEvidence = sources.some(
    (source) =>
      source.source_kind !== 'metadata' &&
      source.source_kind !== 'user_hint' &&
      source.quality !== 'unavailable',
  );
  if (!hasClaimSupportingEvidence) {
    review_items.push({
      code: 'insufficient_evidence',
      severity: 'blocker',
      message:
        'No recipe or meal evidence was acquired beyond metadata or user hints. Add caption, transcript, or on-screen text.',
      evidence_refs: [],
    });
  }

  return { sources, review_items };
}

export function isSocialVideoUrl(url: string): boolean {
  const classified = classifyVideoUrl(url);
  return (
    classified.platform === 'youtube' ||
    classified.platform === 'tiktok' ||
    classified.platform === 'instagram' ||
    classified.platform === 'facebook'
  );
}

function normalizeText(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\r\n?/g, '\n').trim();
  if (text.length === 0) return null;
  return text;
}

function labelForTranscriptSource(source: string): string {
  switch (source) {
    case 'youtube_timedtext':
      return 'YouTube captions';
    case 'youtube_timedtext_asr':
      return 'YouTube auto captions';
    case 'youtube_description':
      return 'YouTube description';
    case 'youtube_title_only':
      return 'YouTube title only';
    case 'external_provider':
      return 'External transcript provider';
    default:
      return source;
  }
}
