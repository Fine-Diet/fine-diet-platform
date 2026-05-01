import { acquireOnscreenText } from '@/lib/plans/onscreenText/onscreenTextService';
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

  if (url && platform === 'youtube') {
    const outcome = await acquireVideoTranscript(url, {
      translationCtx: { personId },
      externalProviderCtx: { personId },
    });
    if (
      outcome.status === 'acquired' &&
      outcome.transcript &&
      outcome.transcript.trim().length > 0
    ) {
      const source_kind =
        outcome.source === 'external_provider' ? 'external_transcript' : 'transcript';
      const transcript = outcome.transcript.trim();
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
        },
      });
      if (outcome.source === 'youtube_title_only') {
        review_items.push({
          code: 'needs_user_assisted_text',
          severity: 'warning',
          message:
            'Only the YouTube title was available. Add caption, transcript, or on-screen text before trusting this draft.',
          evidence_refs: [],
        });
      }
    } else {
      review_items.push({
        code: 'needs_user_assisted_text',
        severity: 'warning',
        message:
          'Automatic YouTube transcript acquisition did not produce usable recipe evidence. Add user-assisted text to continue.',
        evidence_refs: [],
      });
    }
  } else if (url && (platform === 'tiktok' || platform === 'instagram' || platform === 'facebook')) {
    review_items.push({
      code: 'needs_user_assisted_text',
      severity: assisted ? 'info' : 'warning',
      message:
        'Automatic transcript acquisition is not reliable for this platform in v1. User-assisted caption, transcript, or on-screen text is the primary evidence path.',
      evidence_refs: [],
    });
  }

  const onscreen = normalizeText(input.onscreen_text);
  if (onscreen) {
    const outcome = await acquireOnscreenText({
      rawUrl: url,
      userSupplied: onscreen,
    });
    if (outcome.status === 'acquired' && outcome.text) {
      sources.push({
        source_kind: 'onscreen_text',
        source_label: 'User-supplied on-screen text',
        platform,
        raw_text: onscreen,
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

  if (sources.every((source) => source.source_kind === 'metadata')) {
    review_items.push({
      code: 'insufficient_evidence',
      severity: 'blocker',
      message:
        'No recipe or meal evidence was acquired beyond the source URL. Add caption, transcript, or on-screen text.',
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
