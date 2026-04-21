/**
 * scripts/validateExternalTranscriptRollout.ts
 *
 * Plans Phase 31 — Live validation runner for the external
 * transcript provider rollout.
 *
 * Purpose:
 *   Exercise `acquireVideoTranscript` against a curated list of
 *   known-blocked / title-only YouTube Shorts under the current
 *   runtime configuration and SUPADATA_API_KEY state, and print a
 *   concise pass/fail table so an operator can decide whether the
 *   rollout is earning its keep.
 *
 * Usage:
 *   # Default list (includes the Packet 27 reference Short).
 *   set -a && source .env.local && set +a && \
 *     npx tsx scripts/validateExternalTranscriptRollout.ts
 *
 *   # Supply one or more URLs on the CLI.
 *   npx tsx scripts/validateExternalTranscriptRollout.ts \
 *     https://www.youtube.com/shorts/V-eHFm7BQOY \
 *     https://www.youtube.com/shorts/<other>
 *
 *   # JSON output (for piping to jq / logs).
 *   FORMAT=json npx tsx scripts/validateExternalTranscriptRollout.ts
 *
 * Behaviour:
 *   - With SUPADATA_API_KEY missing: every URL should end on the
 *     first-party outcome (title-only / unavailable). Useful to
 *     confirm the "rollout off" degradation posture.
 *   - With SUPADATA_API_KEY present AND the preferred model enabled
 *     via /admin/ai: at least one blocked Short is expected to
 *     recover with source='external_provider'. Any that do not are
 *     reported so you can file follow-up packets or widen the list.
 *
 * Never writes to Supabase beyond the normal `ai_runs` audit path
 * that the runtime records itself. This is purely a read-and-report
 * script.
 */

import { acquireVideoTranscript } from '@/lib/plans/videoTranscript/videoTranscriptService';
import type { TranscriptAcquisitionOutcome } from '@/lib/plans/videoTranscript/types';

const DEFAULT_URLS: readonly string[] = [
  // Packet 27 reference — previously degraded to title-only.
  'https://www.youtube.com/shorts/V-eHFm7BQOY',
];

interface Row {
  url: string;
  status: TranscriptAcquisitionOutcome['status'];
  source: TranscriptAcquisitionOutcome['source'];
  transcript_chars: number;
  language: string | null;
  latency_ms: number;
  verdict: string;
}

async function main() {
  const cliUrls = process.argv.slice(2).filter((s) => s && !s.startsWith('-'));
  const urls = cliUrls.length > 0 ? cliUrls : DEFAULT_URLS;
  const format = (process.env.FORMAT ?? '').toLowerCase();
  const personId =
    process.env.PROBE_PERSON_ID ?? '00000000-0000-0000-0000-000000000000';

  const keyPresent =
    typeof process.env.SUPADATA_API_KEY === 'string' &&
    process.env.SUPADATA_API_KEY.trim().length > 0;

  if (format !== 'json') {
    console.log('Packet 31 — external transcript provider rollout validator');
    console.log(
      `SUPADATA_API_KEY: ${keyPresent ? 'present (live rollout posture)' : 'missing (rollout-off posture)'}`,
    );
    console.log(`URLs to probe: ${urls.length}`);
    console.log('');
  }

  const rows: Row[] = [];
  let externalWins = 0;
  let titleOnlyDegrades = 0;
  let firstPartyWins = 0;
  let failures = 0;

  for (const url of urls) {
    try {
      const outcome = await acquireVideoTranscript(url, {
        translationCtx: { personId },
        externalProviderCtx: { personId },
      });

      const row: Row = {
        url,
        status: outcome.status,
        source: outcome.source,
        transcript_chars: outcome.transcript_chars,
        language: outcome.language ?? null,
        latency_ms: outcome.latency_ms,
        verdict: classify(outcome, keyPresent),
      };
      rows.push(row);

      if (outcome.source === 'external_provider') externalWins += 1;
      else if (outcome.source === 'youtube_title_only') titleOnlyDegrades += 1;
      else if (outcome.status === 'acquired') firstPartyWins += 1;
      else failures += 1;
    } catch (err) {
      rows.push({
        url,
        status: 'fetch_failed',
        source: 'unknown',
        transcript_chars: 0,
        language: null,
        latency_ms: 0,
        verdict: `ERROR — ${err instanceof Error ? err.message : String(err)}`,
      });
      failures += 1;
    }
  }

  if (format === 'json') {
    console.log(
      JSON.stringify(
        {
          key_present: keyPresent,
          totals: {
            probed: rows.length,
            external_wins: externalWins,
            title_only_degrades: titleOnlyDegrades,
            first_party_wins: firstPartyWins,
            failures,
          },
          rows,
        },
        null,
        2,
      ),
    );
    return;
  }

  // Human-readable table.
  const col = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log(
    `${col('status', 13)}  ${col('source', 24)}  chars  lat(ms)  verdict`,
  );
  console.log('-'.repeat(88));
  for (const r of rows) {
    console.log(
      `${col(r.status, 13)}  ${col(r.source ?? '', 24)}  ${String(r.transcript_chars).padStart(5)}  ${String(r.latency_ms).padStart(6)}  ${r.verdict}  (${r.url})`,
    );
  }
  console.log('');
  console.log(
    `Totals: probed=${rows.length}  external_wins=${externalWins}  title_only_degrades=${titleOnlyDegrades}  first_party_wins=${firstPartyWins}  failures=${failures}`,
  );

  if (keyPresent && externalWins === 0 && titleOnlyDegrades > 0) {
    console.log(
      '\nNOTE — provider is enabled but no blocked Short recovered via external_provider. Check /admin/ai/transcript-provider for recent run detail.',
    );
  } else if (!keyPresent && titleOnlyDegrades > 0) {
    console.log(
      '\nPASS (rollout-off) — title-only / unavailable outcomes preserved cleanly with no key provisioned.',
    );
  }
}

function classify(
  outcome: TranscriptAcquisitionOutcome,
  keyPresent: boolean,
): string {
  if (outcome.source === 'external_provider') {
    return 'PASS — external provider recovered transcript';
  }
  if (outcome.source === 'youtube_title_only') {
    return keyPresent
      ? 'NOTE — provider did not recover; first-party title-only preserved'
      : 'PASS (rollout-off) — title-only preserved, provider soft-declined';
  }
  if (outcome.status === 'acquired') {
    return `NOTE — first-party ladder succeeded (${outcome.source ?? 'unknown'}); external not triggered`;
  }
  return `NOTE — status='${outcome.status}' source='${outcome.source ?? 'unknown'}'`;
}

main().catch((err) => {
  console.error('Validator failed:', err);
  process.exit(1);
});
