/**
 * Probe harness — drives the YouTube transcript adapter against a
 * real URL and prints the raw outcome + per-layer probe results so
 * we can see exactly which acquisition layer is returning what for
 * a given Short/video. Not part of the app; invoked manually with:
 *
 *   npx tsx scripts/probeYouTubeAcquisition.ts <url>
 *
 * Prints four sections:
 *   1. URL classification
 *   2. Full adapter outcome (status, source, language, chars, text preview)
 *   3. Per-layer raw probes (timedtext en/en-US/asr, list, watch HTML)
 *   4. Suggested next layer to harden if outcome is empty
 */

import {
  acquireVideoTranscript,
  classifyVideoUrl,
} from '@/lib/plans/videoTranscript/videoTranscriptService';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

async function safeFetch(url: string, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await resp.text();
    return {
      ok: resp.ok,
      status: resp.status,
      length: body.length,
      body,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      length: 0,
      body: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function preview(s: string | null | undefined, n = 400): string {
  if (!s) return '(empty)';
  const cleaned = s.replace(/\s+/g, ' ').trim();
  return cleaned.length <= n ? cleaned : `${cleaned.slice(0, n)}…`;
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: tsx scripts/probeYouTubeAcquisition.ts <url>');
    process.exit(2);
  }

  console.log('='.repeat(80));
  console.log(`URL: ${url}`);
  console.log('='.repeat(80));

  const cls = classifyVideoUrl(url);
  console.log('\n[1] classification');
  console.log(JSON.stringify(cls, null, 2));

  if (!cls.video_id) {
    console.log('\nNo video_id; aborting.');
    return;
  }

  console.log('\n[2] running acquireVideoTranscript()...');
  const outcome = await acquireVideoTranscript(url, {
    // No translationCtx — this script just probes acquisition so we
    // can iterate on the adapter before involving the AI runtime.
  });
  console.log(
    JSON.stringify(
      {
        ...outcome,
        transcript: outcome.transcript
          ? preview(outcome.transcript, 300)
          : null,
      },
      null,
      2,
    ),
  );

  console.log('\n[3] per-layer raw probes (bypassing the adapter)');
  const probes: Array<{ label: string; url: string }> = [
    {
      label: 'timedtext lang=en',
      url: `https://www.youtube.com/api/timedtext?v=${cls.video_id}&lang=en`,
    },
    {
      label: 'timedtext lang=en-US',
      url: `https://www.youtube.com/api/timedtext?v=${cls.video_id}&lang=en-US`,
    },
    {
      label: 'timedtext lang=en kind=asr',
      url: `https://www.youtube.com/api/timedtext?v=${cls.video_id}&lang=en&kind=asr`,
    },
    {
      label: 'video.google timedtext lang=en',
      url: `https://video.google.com/timedtext?v=${cls.video_id}&lang=en`,
    },
    {
      label: 'video.google timedtext type=list',
      url: `https://video.google.com/timedtext?type=list&v=${cls.video_id}`,
    },
    {
      label: 'youtube shorts HTML',
      url: `https://www.youtube.com/shorts/${cls.video_id}`,
    },
    {
      label: 'youtube watch HTML',
      url: `https://www.youtube.com/watch?v=${cls.video_id}`,
    },
  ];

  for (const p of probes) {
    const r = await safeFetch(p.url);
    const bodyPreview = r.body ? preview(r.body, 200) : '(no body)';
    console.log(
      `\n  ${p.label}`,
      `\n    url:     ${p.url}`,
      `\n    ok:      ${r.ok} (HTTP ${r.status})`,
      `\n    length:  ${r.length}`,
      r.error ? `\n    error:   ${r.error}` : '',
      `\n    preview: ${bodyPreview}`,
    );
  }

  console.log('\n[4] done.');
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
