/**
 * Plans Phase 20 — Platform transcript adapter registry.
 *
 * Adapters register themselves here at module load so the acquisition
 * service can dispatch to the right one based on platform
 * classification, without the main service needing to know about
 * specific platforms. Adding a new platform is a matter of adding
 * one new adapter file and importing it for its side-effect.
 */

import type {
  TranscriptAcquisitionOutcome,
  VideoPlatform,
  VideoUrlClassification,
} from './types';

export interface PlatformTranscriptAdapter {
  readonly platform: VideoPlatform;
  /**
   * Return true when the adapter wants to handle the classification.
   * Most adapters will just compare `classification.platform`, but
   * this leaves room for a future adapter that claims multiple
   * related platforms.
   */
  supports(classification: VideoUrlClassification): boolean;
  /**
   * Attempt acquisition. MUST NOT throw — always resolve with an
   * outcome whose `status` captures the result. The service will
   * stamp `latency_ms` if the adapter leaves it at zero.
   */
  acquire(
    classification: VideoUrlClassification,
    opts: { timeoutMs: number },
  ): Promise<TranscriptAcquisitionOutcome>;
}

const registry = new Map<VideoPlatform, PlatformTranscriptAdapter>();

export function registerPlatformAdapter(adapter: PlatformTranscriptAdapter): void {
  registry.set(adapter.platform, adapter);
}

export function getPlatformAdapter(
  platform: VideoPlatform,
): PlatformTranscriptAdapter | null {
  return registry.get(platform) ?? null;
}

export function listRegisteredPlatforms(): VideoPlatform[] {
  return Array.from(registry.keys());
}
