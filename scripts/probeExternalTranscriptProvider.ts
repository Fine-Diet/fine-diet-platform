/**
 * scripts/probeExternalTranscriptProvider.ts
 *
 * Packet 27 end-to-end probe for the external transcript provider
 * fallback. Exercises `acquireVideoTranscript` against a known
 * blocked Short (V-eHFm7BQOY) with the governed AI runtime engaged.
 *
 * Modes:
 *   - Without SUPADATA_API_KEY set, the supadata adapter soft-
 *     declines, the runtime routes to stub:deterministic, the
 *     service's deterministic fallback returns a decline wrapper,
 *     and the first-party title-only outcome is preserved. This is
 *     the "rollout off" happy path.
 *   - With SUPADATA_API_KEY set in .env.local, the adapter calls
 *     Supadata. A successful response swaps the outcome to
 *     source='external_provider'. A provider-unavailable or
 *     provider-error response also preserves the first-party
 *     outcome. Any infra error is surfaced as a non-fatal warning.
 *
 * Usage:
 *   set -a && source .env.local && set +a && \
 *     npx tsx scripts/probeExternalTranscriptProvider.ts
 */

import { acquireVideoTranscript } from '@/lib/plans/videoTranscript/videoTranscriptService';

const URL_UNDER_TEST = 'https://www.youtube.com/shorts/V-eHFm7BQOY';
const PROBE_PERSON_ID = process.env.PROBE_PERSON_ID ?? '00000000-0000-0000-0000-000000000000';

async function main() {
  const keyPresent =
    typeof process.env.SUPADATA_API_KEY === 'string' &&
    process.env.SUPADATA_API_KEY.trim().length > 0;

  console.log('Packet 27 — external transcript provider probe');
  console.log(`URL: ${URL_UNDER_TEST}`);
  console.log(
    `SUPADATA_API_KEY present: ${keyPresent ? 'yes' : 'no (rollout-off posture)'}`,
  );
  console.log('');

  const outcome = await acquireVideoTranscript(URL_UNDER_TEST, {
    translationCtx: { personId: PROBE_PERSON_ID },
    externalProviderCtx: { personId: PROBE_PERSON_ID },
  });

  console.log('Acquisition outcome:');
  console.log(`  status:         ${outcome.status}`);
  console.log(`  platform:       ${outcome.platform}`);
  console.log(`  video_id:       ${outcome.video_id}`);
  console.log(`  source:         ${outcome.source}`);
  console.log(`  transcript_chars: ${outcome.transcript_chars}`);
  console.log(`  language:       ${outcome.language ?? '(null)'}`);
  console.log(
    `  translated_from: ${outcome.translated_from_language ?? '(null)'}`,
  );
  console.log(`  latency_ms:     ${outcome.latency_ms}`);
  console.log(`  error_text:     ${outcome.error_text ?? '(null)'}`);
  console.log('');

  if (outcome.transcript) {
    const preview = outcome.transcript.slice(0, 300);
    console.log('Transcript preview (first 300 chars):');
    console.log('  ' + preview.replace(/\n/g, ' '));
    console.log('');
  }

  const verdict = (() => {
    if (outcome.source === 'external_provider') {
      return 'PASS — external provider recovered transcript text';
    }
    if (outcome.source === 'youtube_title_only') {
      return keyPresent
        ? 'NOTE — provider did not return usable text; first-party title-only outcome preserved'
        : 'PASS (rollout-off) — first-party title-only outcome preserved, adapter soft-declined';
    }
    if (outcome.status === 'acquired') {
      return `NOTE — first-party ladder succeeded with source='${outcome.source}', external provider was not triggered`;
    }
    return `NOTE — outcome status='${outcome.status}', source='${outcome.source}'`;
  })();

  console.log(`Verdict: ${verdict}`);
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
