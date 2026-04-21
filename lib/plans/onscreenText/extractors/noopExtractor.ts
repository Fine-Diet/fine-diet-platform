/**
 * Plans Phase 22 — No-op on-screen text extractor.
 *
 * The default extractor that ships with V1. Declares support for
 * any classification but always declines with `status='unavailable'`.
 * Exists so the registry is never empty and so feature code can
 * always dispatch through the same path; real OCR/vision extractors
 * will register ahead of it in later packets.
 */

import { registerOnscreenExtractor } from '../extractorRegistry';
import type { OnscreenExtractor, OnscreenTextOutcome } from '../types';

export const noopOnscreenExtractor: OnscreenExtractor = {
  key: 'noop',
  supports() {
    return true;
  },
  async extract(): Promise<OnscreenTextOutcome> {
    return {
      status: 'unavailable',
      text: null,
      chars: 0,
      source: 'none',
      extractor_key: 'noop',
      latency_ms: 0,
      error_text: null,
    };
  },
};

registerOnscreenExtractor(noopOnscreenExtractor);
