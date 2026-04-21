/**
 * Plans Phase 22 — On-screen instruction extraction assist types.
 *
 * On-screen text is a **secondary** acquisition layer. It runs after
 * transcript/caption acquisition and can supplement (not replace) the
 * already-acquired text. It never becomes authoritative nutrition
 * truth and never creates trusted food objects.
 *
 * V1 produces real user value via the `user_supplied` source: the
 * import UI offers an optional textarea labelled "On-screen text
 * you saw in the video". The extractor registry also exists so
 * future OCR/vision providers can register additively without
 * touching feature code.
 */

import type { VideoUrlClassification } from '@/lib/plans/videoTranscript/types';

export type OnscreenTextStatus =
  /** Extraction produced usable non-empty text. */
  | 'acquired'
  /** No extractor returned any text (expected default path in V1). */
  | 'unavailable'
  /** Extractor / user input was provided but too short / noisy after filtering. */
  | 'insufficient'
  /** Network / HTTP / parse error during extraction. */
  | 'fetch_failed'
  /** The input URL could not be classified into a supported video platform. */
  | 'unsupported_platform';

export type OnscreenTextSource =
  /** Provided directly by the user via the import form. */
  | 'user_supplied'
  /** Produced by a registered extractor (future OCR/vision providers). */
  | 'extractor'
  /** No source — on-screen stage didn't contribute. */
  | 'none';

export interface OnscreenTextOutcome {
  status: OnscreenTextStatus;
  /** The captured visible text, trimmed + capped, or null. */
  text: string | null;
  chars: number;
  source: OnscreenTextSource;
  /** Which concrete extractor produced the text, if any. */
  extractor_key: string | null;
  latency_ms: number;
  error_text: string | null;
  /**
   * Packet 23 — provider / model / cost metadata populated only by
   * AI-backed extractors (e.g. `openai_vision`). Flows into the
   * `ai_runs.onscreen_text_extract` audit row so admin tooling can
   * slice attempts + spend by provider. Optional / null on
   * user_supplied and noop paths.
   */
  provider_key?: string | null;
  model_key?: string | null;
  cost_cents_estimate?: number | null;
}

export interface OnscreenExtractorInput {
  classification: VideoUrlClassification;
  rawUrl: string;
  timeoutMs: number;
}

export interface OnscreenExtractor {
  readonly key: string;
  /**
   * Return true when this extractor wants to attempt extraction for
   * the given classification. Most extractors will be
   * platform-specific.
   */
  supports(classification: VideoUrlClassification): boolean;
  /**
   * Attempt extraction. MUST NOT throw — always resolve with an
   * outcome. Return `{ status: 'unavailable', ... }` to decline.
   */
  extract(input: OnscreenExtractorInput): Promise<OnscreenTextOutcome>;
}
