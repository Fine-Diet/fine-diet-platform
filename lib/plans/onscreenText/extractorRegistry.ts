/**
 * Plans Phase 22 — On-screen text extractor registry.
 *
 * Mirrors the Packet 20 transcript adapter registry pattern:
 * extractors register themselves at module load, and the
 * on-screen acquisition service iterates registered extractors in
 * insertion order, accepting the first one that returns
 * `status='acquired'` with non-empty text.
 *
 * V1 only registers a `noop` extractor so the layer exists and is
 * composable. Future OCR / vision providers can drop in additively
 * by adding an adapter file under `extractors/` and registering
 * themselves.
 */

import type { OnscreenExtractor } from './types';

const registry: OnscreenExtractor[] = [];

export function registerOnscreenExtractor(extractor: OnscreenExtractor): void {
  if (registry.some((e) => e.key === extractor.key)) return;
  registry.push(extractor);
}

export function listOnscreenExtractors(): OnscreenExtractor[] {
  return registry.slice();
}

export function resetOnscreenExtractorsForTest(): void {
  registry.length = 0;
}
