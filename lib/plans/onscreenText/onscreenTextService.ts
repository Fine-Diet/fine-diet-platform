/**
 * Plans Phase 22 — On-screen instruction extraction assist service.
 *
 * Secondary acquisition layer for video recipe imports. Runs after
 * Packet 19/20 transcript acquisition and supplements (not replaces)
 * any already-acquired text. Never authoritative.
 *
 * Sources, in priority order:
 *   1. user_supplied  — user pasted visible on-screen text into the
 *      import form (primary V1 production source).
 *   2. extractor      — future OCR / vision extractor. None ship
 *      live in V1; a `noop` extractor is registered by default so
 *      the dispatch path always exists.
 *
 * Filtering:
 *   - Trim, collapse whitespace, cap length.
 *   - Drop when fewer than MIN_CHARS usable characters remain so
 *     noisy / near-empty extractions don't pollute normalization.
 *
 * Guarantees:
 *   - Never throws; every outcome is a typed `OnscreenTextOutcome`.
 *   - Safe to call even when no URL or no user input is present —
 *     falls back to `unavailable`.
 */

import { listOnscreenExtractors } from './extractorRegistry';
// Side-effect imports: register extractors at module load.
// Order matters — earlier registrations are tried first. The
// Packet 23 openai vision extractor registers ahead of the
// Packet 22 noop so a successful automated read wins, but declines
// cleanly to the noop (→ `unavailable`) when the provider is
// disabled, unconfigured, or the platform is unsupported.
import './extractors/openaiVisionExtractor';
import './extractors/noopExtractor';
import type { OnscreenTextOutcome } from './types';
import { classifyVideoUrl } from '@/lib/plans/videoTranscript/videoTranscriptService';

const MAX_ONSCREEN_CHARS = 20_000;
const MIN_ONSCREEN_CHARS = 10;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface AcquireOnscreenTextArgs {
  rawUrl: string | null;
  /** Trimmed, validated text supplied by the user (Packet 22 §3a). */
  userSupplied?: string | null;
  timeoutMs?: number;
}

/**
 * Acquire on-screen visible text from either the user-supplied field
 * or a registered extractor. Always resolves; status describes the
 * outcome. Priority: user_supplied > extractors > unavailable.
 */
export async function acquireOnscreenText(
  args: AcquireOnscreenTextArgs,
): Promise<OnscreenTextOutcome> {
  const startedAt = Date.now();
  const supplied = (args.userSupplied ?? '').trim();

  if (supplied.length > 0) {
    return normalizeUserSupplied(supplied, startedAt);
  }

  const rawUrl = (args.rawUrl ?? '').trim();
  if (rawUrl.length === 0) {
    return unavailable('none', null, startedAt);
  }

  const classification = classifyVideoUrl(rawUrl);
  if (classification.platform === 'unknown') {
    return {
      status: 'unsupported_platform',
      text: null,
      chars: 0,
      source: 'none',
      extractor_key: null,
      latency_ms: Date.now() - startedAt,
      error_text: 'URL did not match a known video platform.',
    };
  }

  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const extractors = listOnscreenExtractors();
  for (const extractor of extractors) {
    if (!extractor.supports(classification)) continue;
    try {
      const outcome = await extractor.extract({
        classification,
        rawUrl,
        timeoutMs,
      });
      if (
        outcome.status === 'acquired' &&
        typeof outcome.text === 'string' &&
        outcome.text.trim().length >= MIN_ONSCREEN_CHARS
      ) {
        const capped = clampText(outcome.text);
        return {
          ...outcome,
          text: capped,
          chars: capped.length,
          latency_ms: outcome.latency_ms || Date.now() - startedAt,
        };
      }
    } catch (err) {
      // Defensive: extractors shouldn't throw, but if one does we
      // don't want to break the import flow. Record and move on.
      console.warn(
        `[onscreenTextService] extractor '${extractor.key}' threw; continuing.`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
  }

  return unavailable('none', null, startedAt);
}

// ---------------------------------------------------------------------------
// Filtering / helpers
// ---------------------------------------------------------------------------

function normalizeUserSupplied(
  raw: string,
  startedAt: number,
): OnscreenTextOutcome {
  const cleaned = clampText(raw);
  if (cleaned.length < MIN_ONSCREEN_CHARS) {
    return {
      status: 'insufficient',
      text: null,
      chars: cleaned.length,
      source: 'user_supplied',
      extractor_key: null,
      latency_ms: Date.now() - startedAt,
      error_text: `On-screen text too short (< ${MIN_ONSCREEN_CHARS} chars after cleaning).`,
    };
  }
  return {
    status: 'acquired',
    text: cleaned,
    chars: cleaned.length,
    source: 'user_supplied',
    extractor_key: null,
    latency_ms: Date.now() - startedAt,
    error_text: null,
  };
}

function clampText(raw: string): string {
  const collapsed = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n');
  // Deduplicate consecutive identical lines (common artefact of
  // re-showing the same overlay frame-after-frame).
  const lines = collapsed.split('\n').map((l) => l.trim());
  const deduped: string[] = [];
  let prev: string | null = null;
  for (const l of lines) {
    if (l.length === 0) {
      if (prev !== '') deduped.push('');
      prev = '';
      continue;
    }
    if (l === prev) continue;
    deduped.push(l);
    prev = l;
  }
  const joined = deduped.join('\n').trim();
  return joined.slice(0, MAX_ONSCREEN_CHARS);
}

function unavailable(
  source: OnscreenTextOutcome['source'],
  extractorKey: string | null,
  startedAt: number,
): OnscreenTextOutcome {
  return {
    status: 'unavailable',
    text: null,
    chars: 0,
    source,
    extractor_key: extractorKey,
    latency_ms: Date.now() - startedAt,
    error_text: null,
  };
}

/**
 * Packet 22 — Merge on-screen text with an existing base text
 * (typically a transcript + normalization input). When the base is
 * empty, on-screen text becomes the base; otherwise it is appended
 * under a clearly-labeled section header so downstream normalization
 * can still consume a single text blob, and so the audit trail of
 * the draft (via `raw_input_text`) shows which content came from
 * which layer.
 */
export function mergeOnscreenIntoBase(args: {
  base: string | null;
  onscreen: string | null;
}): string | null {
  const baseTrim = (args.base ?? '').trim();
  const osTrim = (args.onscreen ?? '').trim();
  if (osTrim.length === 0) return baseTrim.length > 0 ? baseTrim : null;
  if (baseTrim.length === 0) return osTrim;
  return `${baseTrim}\n\n=== On-screen text ===\n${osTrim}`;
}
