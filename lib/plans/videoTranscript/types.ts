/**
 * Plans Phase 19 — Video transcript / caption acquisition types.
 *
 * Acquisition is a distinct stage from normalization and structure
 * extraction. A successful acquisition produces text that the
 * existing import pipeline can normalize; a failed or unsupported
 * acquisition must never block the user flow — callers fall back to
 * a manual-review draft with the original URL preserved.
 */

export type VideoPlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'vimeo'
  | 'unknown';

export type TranscriptAcquisitionStatus =
  /** Transcript fetched and non-empty. */
  | 'acquired'
  /** Platform is recognized but we can't reach a transcript API here. */
  | 'unsupported_platform'
  /** Fetch ran but returned no usable transcript text. */
  | 'unavailable'
  /** Network / HTTP / parse error during fetch. */
  | 'fetch_failed'
  /** The input URL could not be parsed or classified. */
  | 'invalid_url'
  /**
   * Packet 21: we didn't auto-transcribe the video, but the user
   * supplied caption / recipe text alongside the URL and we routed
   * that text through the same normalization pipeline. Kept distinct
   * from `acquired` so audit tooling can tell automatic from
   * user-assisted paths apart.
   */
  | 'user_assisted';

export type TranscriptSource =
  | 'youtube_timedtext'
  /** Packet 25: YouTube auto-generated caption track (timedtext kind=asr). */
  | 'youtube_timedtext_asr'
  /**
   * Packet 25: fallback acquisition from the YouTube watch/shorts
   * page metadata (title + `shortDescription`). Useful for Shorts
   * and cooking videos where captions are absent but the
   * description contains the recipe text.
   */
  | 'youtube_description'
  /**
   * Packet 27: last-resort acquisition when the only usable signal
   * YouTube will serve for a Short is the video title. Distinct
   * from `youtube_description` so the UI can prompt the user to
   * paste the recipe body and the audit trail shows honestly that
   * only a title was captured. See `youtubeAdapter.tryWatchPageDescription`.
   */
  | 'youtube_title_only'
  /**
   * Packet 27: transcript recovered via the governed external
   * transcript-provider fallback (e.g. Supadata). Only used when
   * the first-party YouTube/Shorts ladder returned unavailable,
   * fetch_failed, empty, or title-only. Distinct from all
   * first-party sources so the UI and ai_runs audit trail show
   * honestly that the text came from a third party.
   */
  | 'external_provider'
  | 'vimeo_text_track'
  | 'vimeo_oembed_description'
  /** Packet 21: text pasted by the user when automatic transcript was unavailable. */
  | 'user_assisted_caption'
  | 'unknown';

/** Packet 21: how the effective text for a video URL was obtained. */
export type TranscriptAcquisitionMode =
  | 'automatic'
  | 'user_assisted'
  | 'none';

export interface VideoUrlClassification {
  platform: VideoPlatform;
  video_id: string | null;
  canonical_url: string | null;
}

export interface TranscriptAcquisitionOutcome {
  status: TranscriptAcquisitionStatus;
  platform: VideoPlatform;
  video_id: string | null;
  /** The acquired transcript text, or null if we didn't acquire one. */
  transcript: string | null;
  /** Approximate length in characters — used for logging and bounding. */
  transcript_chars: number;
  /** Language hint when known (e.g. "en", "en-US"). */
  language: string | null;
  /** Which acquisition route produced the transcript. */
  source: TranscriptSource;
  /** Wall-clock latency of the acquisition attempt. */
  latency_ms: number;
  /** Human-readable error text when acquisition failed. */
  error_text: string | null;
  /**
   * Packet 26 §3d — When a non-English caption track was acquired and
   * translated to English before downstream normalization, this field
   * captures the original source language code (e.g. "es", "fr").
   * Null for English-native acquisitions, for paths where translation
   * was unavailable, or for user-assisted text.
   */
  translated_from_language?: string | null;
}
