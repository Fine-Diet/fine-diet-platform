import { isOutputArtifactEnabled } from '@/lib/assessments/operationsContract';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';
import {
  detectResultsFlow,
  resolveResultsScreenContent,
} from '@/lib/assessments/results/resolveResultsScreenContent';
import {
  buildInRepoLaunchGateChecks,
  buildSeoIndexCheckForRoute,
  assessmentExpectsPublicIndex,
} from '@/lib/assessments/deployment/launchGateChecks';
import { fetchJson, fetchText, getPath, normalizeBaseUrl } from '@/lib/assessments/deployment/httpUtils';
import { buildPlaceholderCheck } from '@/lib/assessments/deployment/placeholderScan';
import { runSiblingRegressionChecks } from '@/lib/assessments/deployment/siblingRegression';
import type {
  AssessmentDeploymentConfig,
  LiveE2eOutcomeCase,
  LiveE2eOutcomeResult,
  LiveE2eReport,
  NamedCheck,
} from '@/lib/assessments/deployment/types';

async function verifyOutcome(
  config: AssessmentDeploymentConfig,
  baseUrl: string,
  testCase: LiveE2eOutcomeCase
): Promise<LiveE2eOutcomeResult> {
  const checks: NamedCheck[] = [];
  const submissionId = testCase.defaultSubmissionId;
  const resultsUrl = `${baseUrl}/assessments/${config.slug}?submission_id=${submissionId}`;

  const push = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, status: ok ? 'pass' : 'fail', detail });
  };

  const submissionRes = await fetchJson(
    `${baseUrl}/api/assessments/submission?submission_id=${submissionId}`
  );
  const submission = getPath(submissionRes.body, ['data']);
  push('Submission API HTTP 200', submissionRes.status === 200, `status ${submissionRes.status}`);
  push(
    'Submission primary_avatar matches level',
    getPath(submission, ['primary_avatar']) === testCase.levelId,
    `expected ${testCase.levelId}, got ${String(getPath(submission, ['primary_avatar']))}`
  );
  push(
    `Submission assessment_type ${config.assessmentType}`,
    getPath(submission, ['assessment_type']) === config.assessmentType,
    String(getPath(submission, ['assessment_type']))
  );

  const resolveUrl =
    `${baseUrl}/api/results-packs/resolve?assessmentType=${encodeURIComponent(config.assessmentType)}` +
    `&resultsVersion=${encodeURIComponent(config.results.resultsVersion)}` +
    `&levelId=${encodeURIComponent(testCase.levelId)}`;
  const packRes = await fetchJson(resolveUrl);
  const pack = getPath(packRes.body, ['pack']);
  push('Pack resolve API HTTP 200', packRes.status === 200, `status ${packRes.status}`);
  push(
    'Pack label',
    getPath(pack, ['label']) === testCase.expectedLabel,
    `expected "${testCase.expectedLabel}", got "${String(getPath(pack, ['label']))}"`
  );

  const methodCtaUrl = getPath(pack, ['flow', 'page3', 'methodCtaUrl']);
  const methodCtaLabel = getPath(pack, ['flow', 'page3', 'methodCtaLabel']);
  push('Method CTA URL', methodCtaUrl === testCase.expectedMethodCtaUrl, String(methodCtaUrl));
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
      resolved.page3.methodCtaUrl === testCase.expectedMethodCtaUrl,
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

  for (const key of config.launchGates.artifactKeys) {
    const enabled = isOutputArtifactEnabled(config.assessmentType, key);
    push(`Artifact ${key} disabled`, !enabled, enabled ? 'enabled (unexpected)' : 'disabled');
  }

  const routeRes = await fetchText(resultsUrl);
  push('Public results route HTTP 200', routeRes.status === 200, `status ${routeRes.status}`);
  checks.push(buildSeoIndexCheckForRoute(routeRes.text, config, 'results'));
  checks.push(buildPlaceholderCheck(routeRes.text, config));

  const methodDest = await fetchText(`${baseUrl}${config.liveE2e.methodDestinationPath}`);
  push(
    `Method destination ${config.liveE2e.methodDestinationPath} HTTP 200`,
    methodDest.status === 200,
    `status ${methodDest.status}`
  );

  const status = checks.every((c) => c.status === 'pass') ? 'pass' : 'fail';
  return { levelId: testCase.levelId, submissionId, status, checks };
}

export function renderLiveE2eMarkdown(report: LiveE2eReport): string {
  const lines: string[] = [
    `# ${report.config.displayTitle} Live Results E2E Report`,
    '',
    `**Generated:** ${report.generatedAt}`,
    `**Base URL:** ${report.baseUrl}`,
    report.config.packetId ? `**Packet:** ${report.config.packetId}` : '',
    `**Assessment slug:** ${report.config.slug}`,
    `**Recommendation:** ${report.recommendation}`,
    '',
    '## Method',
    '',
    'Each outcome chains: submission API → published pack resolve → `resolveResultsScreenContent` → public route HTTP/SEO → Method destination HTTP.',
    '',
    '## Outcome results',
    '',
  ].filter(Boolean);

  for (const outcome of report.outcomes) {
    lines.push(`### ${outcome.levelId}`);
    lines.push('');
    lines.push(`- **Status:** ${outcome.status.toUpperCase()}`);
    lines.push(`- **Submission ID:** \`${outcome.submissionId}\``);
    lines.push(
      `- **Public URL:** ${report.baseUrl}/assessments/${report.config.slug}?submission_id=${outcome.submissionId}`
    );
    lines.push('');
    for (const check of outcome.checks) {
      lines.push(`- **${check.name}:** ${check.status.toUpperCase()} — ${check.detail}`);
    }
    lines.push('');
  }

  lines.push('## Sibling regression smoke');
  lines.push('');
  lines.push(`- **Status:** ${report.siblingRegression.status.toUpperCase()}`);
  for (const check of report.siblingRegression.checks) {
    lines.push(`- **${check.name}:** ${check.status.toUpperCase()} — ${check.detail}`);
  }
  lines.push('');
  lines.push('## Launch gate summary (in-repo)');
  lines.push('');
  for (const check of report.launchGateSummary) {
    lines.push(`- **${check.name}:** ${check.status.toUpperCase()} — ${check.detail}`);
  }
  lines.push('');

  return lines.join('\n');
}

export async function runLiveE2e(
  config: AssessmentDeploymentConfig,
  baseUrl: string
): Promise<LiveE2eReport> {
  const root = normalizeBaseUrl(baseUrl);
  const generatedAt = new Date().toISOString();

  const outcomes: LiveE2eOutcomeResult[] = [];
  for (const testCase of config.liveE2e.outcomes) {
    outcomes.push(await verifyOutcome(config, root, testCase));
  }

  const siblingRegression = await runSiblingRegressionChecks(config, root, {
    includeTargetSitemapCheck: true,
  });

  const launchGateSummary = buildInRepoLaunchGateChecks(config);

  const allPass =
    outcomes.every((o) => o.status === 'pass') && siblingRegression.status === 'pass';

  const catalogLaunched = assessmentExpectsPublicIndex(config);

  const recommendation = allPass
    ? catalogLaunched
      ? 'GO — live results E2E complete; public marketing launch posture active (verify production deploy)'
      : 'GO — live results E2E evidence complete for guarded/direct-link'
    : 'NO-GO — see failing checks';

  return {
    generatedAt,
    baseUrl: root,
    config: {
      slug: config.slug,
      displayTitle: config.displayTitle,
      assessmentType: config.assessmentType,
      packetId: config.packetId,
    },
    outcomes,
    siblingRegression,
    launchGateSummary,
    recommendation,
  };
}

export function defaultLiveE2eReportPath(slug: string, generatedAt: string): string {
  return `${slug}-live-e2e-${generatedAt.replace(/[:.]/g, '-')}.md`;
}
