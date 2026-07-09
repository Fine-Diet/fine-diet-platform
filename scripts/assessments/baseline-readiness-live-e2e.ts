#!/usr/bin/env tsx
/**
 * Baseline Readiness live results E2E verifier (Packet X5d)
 *
 * Verifies the public results path for each outcome by chaining the same data
 * sources ResultsScreen uses (submission API → pack resolve → pure content
 * resolver) plus HTTP/noindex checks on the public route.
 *
 * Usage:
 *   npm run assessments:baseline-readiness:live-e2e
 *   npm run assessments:baseline-readiness:live-e2e -- --base-url=https://myfinediet.com
 */

import * as fs from 'fs';
import * as path from 'path';

import { BASELINE_READINESS_RESULTS_CONTENT_VERSION } from '@/lib/assessments/baselineReadiness/constants';
import { getAssessmentEntry } from '@/lib/assessments/assessmentRegistry';
import { isOutputArtifactEnabled } from '@/lib/assessments/operationsContract';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';
import {
  detectResultsFlow,
  resolveResultsScreenContent,
} from '@/lib/assessments/results/resolveResultsScreenContent';

const DEFAULT_BASE_URL = 'https://myfinediet.com';

const OUTCOME_CASES = [
  {
    levelId: 'readiness-low',
    expectedLabel: 'Foundation Builder',
    expectedMethodCtaLabel: 'Start with the Fine Diet Method',
    defaultSubmissionId: 'd918fcf0-ded6-4792-b89e-f0dd38373f27',
  },
  {
    levelId: 'readiness-building',
    expectedLabel: 'Rhythm Builder',
    expectedMethodCtaLabel: 'Build your rhythm with the Fine Diet Method',
    defaultSubmissionId: '51bf16c8-c9c2-4f7f-a7ed-90634fef14aa',
  },
  {
    levelId: 'readiness-ready',
    expectedLabel: 'Ready for Guided Observation',
    expectedMethodCtaLabel: 'Begin the Fine Diet Method',
    defaultSubmissionId: '1c92ade1-608f-490c-a429-88c25ff64623',
  },
] as const;

type CheckStatus = 'pass' | 'fail';

interface OutcomeCheck {
  levelId: string;
  submissionId: string;
  status: CheckStatus;
  checks: { name: string; status: CheckStatus; detail: string }[];
}

function parseArgs(argv: string[]): { baseUrl: string; reportOut?: string } {
  let baseUrl = DEFAULT_BASE_URL;
  let reportOut: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--base-url' && argv[i + 1]) {
      baseUrl = argv[++i];
    } else if (arg.startsWith('--report-out=')) {
      reportOut = arg.slice('--report-out='.length);
    } else if (arg === '--report-out' && argv[i + 1]) {
      reportOut = argv[++i];
    }
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), reportOut };
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep text
  }
  return { status: res.status, body };
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url);
  return { status: res.status, text: await res.text() };
}

function getPath(obj: unknown, keys: string[]): unknown {
  let cur: unknown = obj;
  for (const key of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

async function verifyOutcome(
  baseUrl: string,
  testCase: (typeof OUTCOME_CASES)[number]
): Promise<OutcomeCheck> {
  const checks: OutcomeCheck['checks'] = [];
  const submissionId = testCase.defaultSubmissionId;
  const resultsUrl = `${baseUrl}/assessments/baseline-readiness?submission_id=${submissionId}`;

  const push = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, status: ok ? 'pass' : 'fail', detail });
  };

  // 1. Submission API
  const submissionRes = await fetchJson(
    `${baseUrl}/api/assessments/submission?submission_id=${submissionId}`
  );
  const submission = getPath(submissionRes.body, ['data']);
  push(
    'Submission API HTTP 200',
    submissionRes.status === 200,
    `status ${submissionRes.status}`
  );
  const primaryAvatar = getPath(submission, ['primary_avatar']);
  push(
    'Submission primary_avatar matches level',
    primaryAvatar === testCase.levelId,
    `expected ${testCase.levelId}, got ${String(primaryAvatar)}`
  );
  push(
    'Submission assessment_type baseline-readiness',
    getPath(submission, ['assessment_type']) === 'baseline-readiness',
    String(getPath(submission, ['assessment_type']))
  );

  // 2. Results pack resolve API (published path — same as ResultsScreen)
  const resolveUrl =
    `${baseUrl}/api/results-packs/resolve?assessmentType=baseline-readiness` +
    `&resultsVersion=${encodeURIComponent(BASELINE_READINESS_RESULTS_CONTENT_VERSION)}` +
    `&levelId=${encodeURIComponent(testCase.levelId)}`;
  const packRes = await fetchJson(resolveUrl);
  const pack = getPath(packRes.body, ['pack']);
  push('Pack resolve API HTTP 200', packRes.status === 200, `status ${packRes.status}`);
  const packLabel = getPath(pack, ['label']);
  push(
    'Pack label',
    packLabel === testCase.expectedLabel,
    `expected "${testCase.expectedLabel}", got "${String(packLabel)}"`
  );

  const methodCtaUrl = getPath(pack, ['flow', 'page3', 'methodCtaUrl']);
  const methodCtaLabel = getPath(pack, ['flow', 'page3', 'methodCtaLabel']);
  push(
    'Method CTA URL',
    methodCtaUrl === '/the-fine-diet-method',
    String(methodCtaUrl)
  );
  push(
    'Method CTA label',
    methodCtaLabel === testCase.expectedMethodCtaLabel,
    `expected "${testCase.expectedMethodCtaLabel}", got "${String(methodCtaLabel)}"`
  );

  const videoAssetUrl = getPath(pack, ['flow', 'page2', 'videoAssetUrl']);
  push(
    'No videoAssetUrl in pack',
    videoAssetUrl == null || videoAssetUrl === '',
    String(videoAssetUrl ?? 'null')
  );

  // 3. Pure ResultsScreen resolver (mirrors component render inputs)
  if (pack && typeof pack === 'object') {
    const typedPack = pack as ResultsPack;
    const flowDetection = detectResultsFlow(typedPack);
    push(
      'Flow v2 detected',
      flowDetection.hasFlowV2 && flowDetection.renderMultiPage,
      `hasFlowV2=${flowDetection.hasFlowV2}`
    );

    const resolved = resolveResultsScreenContent(typedPack, testCase.levelId);
    push('Resolved videoUrl is null', resolved.videoUrl == null, String(resolved.videoUrl));
    push(
      'Resolved page3 Method CTA URL',
      resolved.page3.methodCtaUrl === '/the-fine-diet-method',
      String(resolved.page3.methodCtaUrl)
    );
    push(
      'Resolved page3 Method CTA label',
      resolved.page3.methodCtaLabel === testCase.expectedMethodCtaLabel,
      String(resolved.page3.methodCtaLabel)
    );
    push(
      'Resolved page1 headline present',
      typeof resolved.page1.headline === 'string' && resolved.page1.headline.length > 0,
      String(resolved.page1.headline ?? '')
    );
  } else {
    push('Flow v2 detected', false, 'pack missing — skipped resolver checks');
  }

  // 4. Artifact gates (operations contract — same as ResultsScreen)
  const artifactKeys = ['email', 'pdf', 'claim', 'account-save'] as const;
  for (const key of artifactKeys) {
    const enabled = isOutputArtifactEnabled('baseline-readiness', key);
    push(`Artifact ${key} disabled`, !enabled, enabled ? 'enabled (unexpected)' : 'disabled');
  }

  // 5. Public results route + SEO
  const routeRes = await fetchText(resultsUrl);
  push('Public results route HTTP 200', routeRes.status === 200, `status ${routeRes.status}`);
  const catalogLaunched = getAssessmentEntry('baseline-readiness')?.catalogVisible === true;
  const hasNoindex = /noindex/i.test(routeRes.text);
  push(
    catalogLaunched ? 'Public route indexable (no noindex)' : 'Public route robots noindex',
    catalogLaunched ? !hasNoindex : hasNoindex,
    catalogLaunched
      ? hasNoindex
        ? 'noindex found (expected indexable after X7)'
        : 'indexable'
      : hasNoindex
        ? 'noindex present'
        : 'noindex missing'
  );
  const hasPlaceholderVideo =
    /ig61sqn2lyM/i.test(routeRes.text) || /\/method(?!-)/i.test(routeRes.text);
  push(
    'SSR HTML has no placeholder video/method refs',
    !hasPlaceholderVideo,
    hasPlaceholderVideo ? 'found placeholder refs in HTML' : 'clean'
  );

  // 6. Method destination resolves
  const methodDest = await fetchText(`${baseUrl}/the-fine-diet-method`);
  push(
    'Method destination /the-fine-diet-method HTTP 200',
    methodDest.status === 200,
    `status ${methodDest.status}`
  );

  const status: CheckStatus = checks.every((c) => c.status === 'pass') ? 'pass' : 'fail';

  return { levelId: testCase.levelId, submissionId, status, checks };
}

async function smokeGutCheck(baseUrl: string): Promise<{
  status: CheckStatus;
  checks: { name: string; status: CheckStatus; detail: string }[];
}> {
  const checks: { name: string; status: CheckStatus; detail: string }[] = [];
  const push = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, status: ok ? 'pass' : 'fail', detail });
  };

  const cover = await fetchText(`${baseUrl}/assessments/gut-check`);
  push('Gut Check cover HTTP 200', cover.status === 200, `status ${cover.status}`);
  push(
    'Gut Check indexable (no noindex)',
    !/noindex/i.test(cover.text),
    /noindex/i.test(cover.text) ? 'noindex found (regression)' : 'indexable'
  );

  const packRes = await fetchJson(
    `${baseUrl}/api/results-packs/resolve?assessmentType=gut-check&resultsVersion=v2&levelId=level1`
  );
  push('Gut Check pack resolve HTTP 200', packRes.status === 200, `status ${packRes.status}`);

  const catalogLaunched = getAssessmentEntry('baseline-readiness')?.catalogVisible === true;
  const sitemap = await fetchText(`${baseUrl}/sitemap.xml`);
  const baselineInSitemap = sitemap.text.includes('baseline-readiness');
  push(
    catalogLaunched ? 'Sitemap includes baseline-readiness' : 'Sitemap excludes baseline-readiness',
    catalogLaunched ? baselineInSitemap : !baselineInSitemap,
    baselineInSitemap ? 'found in sitemap' : 'absent'
  );

  const status: CheckStatus = checks.every((c) => c.status === 'pass') ? 'pass' : 'fail';
  return { status, checks };
}

function renderMarkdownReport(input: {
  generatedAt: string;
  baseUrl: string;
  outcomes: OutcomeCheck[];
  gutCheck: Awaited<ReturnType<typeof smokeGutCheck>>;
  recommendation: string;
}): string {
  const lines: string[] = [
    '# Baseline Readiness Live Results E2E Report (X5d)',
    '',
    `**Generated:** ${input.generatedAt}`,
    `**Base URL:** ${input.baseUrl}`,
    `**Packet:** f6b55849-cf1e-4100-9450-a087134a01c1`,
    `**Recommendation:** ${input.recommendation}`,
    '',
    '## Method',
    '',
    'Each outcome chains: submission API → published pack resolve → `resolveResultsScreenContent` (same pure resolver as `ResultsScreen`) → public route HTTP/noindex → Method destination HTTP.',
    '',
    'ResultsScreen is client-rendered; pack + resolver checks are the authoritative user-facing content verification.',
    '',
    '## Outcome results',
    '',
  ];

  for (const outcome of input.outcomes) {
    lines.push(`### ${outcome.levelId}`);
    lines.push('');
    lines.push(`- **Status:** ${outcome.status.toUpperCase()}`);
    lines.push(`- **Submission ID:** \`${outcome.submissionId}\``);
    lines.push(
      `- **Public URL:** ${input.baseUrl}/assessments/baseline-readiness?submission_id=${outcome.submissionId}`
    );
    lines.push('');
    for (const check of outcome.checks) {
      lines.push(`- **${check.name}:** ${check.status.toUpperCase()} — ${check.detail}`);
    }
    lines.push('');
  }

  lines.push('## Gut Check regression smoke');
  lines.push('');
  lines.push(`- **Status:** ${input.gutCheck.status.toUpperCase()}`);
  for (const check of input.gutCheck.checks) {
    lines.push(`- **${check.name}:** ${check.status.toUpperCase()} — ${check.detail}`);
  }
  lines.push('');
  lines.push('## Guardrails');
  lines.push('');
  const catalogLaunched = getAssessmentEntry('baseline-readiness')?.catalogVisible === true;
  lines.push(
    `- Public marketing launch: **${catalogLaunched ? 'GO (X7 catalog/index/sitemap flip in code)' : 'NO-GO (guarded)'}**`
  );
  lines.push(
    `- Index posture: **${catalogLaunched ? 'indexable (no noindex override)' : 'noindex'}**`
  );
  lines.push(
    `- Sitemap: baseline **${catalogLaunched ? 'included' : 'excluded'}** (when deployed)`
  );
  lines.push('- Artifacts: disabled');
  lines.push('- Scoring / Gut Check / question set: unchanged');
  lines.push('');

  return lines.join('\n');
}

async function main(): Promise<void> {
  const { baseUrl, reportOut } = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();

  const outcomes: OutcomeCheck[] = [];
  for (const testCase of OUTCOME_CASES) {
    outcomes.push(await verifyOutcome(baseUrl, testCase));
  }

  const gutCheck = await smokeGutCheck(baseUrl);

  const catalogLaunched = getAssessmentEntry('baseline-readiness')?.catalogVisible === true;
  const allPass =
    outcomes.every((o) => o.status === 'pass') && gutCheck.status === 'pass';
  const recommendation = allPass
    ? catalogLaunched
      ? 'GO — live results E2E complete; public marketing launch flip active in code (deploy to verify production HTTP)'
      : 'GO — live results E2E evidence complete for guarded/direct-link'
    : 'NO-GO — see failing checks';

  const markdown = renderMarkdownReport({
    generatedAt,
    baseUrl,
    outcomes,
    gutCheck,
    recommendation,
  });

  const defaultReportPath = path.join(
    process.cwd(),
    '.reports/assessments',
    `baseline-readiness-live-e2e-${generatedAt.replace(/[:.]/g, '-')}.md`
  );
  const outPath = reportOut ?? defaultReportPath;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf8');

  console.log(markdown);
  console.log(`\nReport written: ${outPath}`);

  if (!allPass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
