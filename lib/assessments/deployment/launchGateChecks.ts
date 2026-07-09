import {
  getAssessmentEntry,
  isSupportedAssessmentSlug,
} from '@/lib/assessments/assessmentRegistry';
import { isOutputArtifactEnabled } from '@/lib/assessments/operationsContract';
import { fetchText, htmlHasNoindex, normalizeBaseUrl } from '@/lib/assessments/deployment/httpUtils';
import type { AssessmentDeploymentConfig, NamedCheck } from '@/lib/assessments/deployment/types';

export function assessmentExpectsPublicIndex(config: AssessmentDeploymentConfig): boolean {
  return getAssessmentEntry(config.slug)?.catalogVisible === true;
}

/** In-repo launch gate checks (registry + operations contract). */
export function buildInRepoLaunchGateChecks(
  config: AssessmentDeploymentConfig
): NamedCheck[] {
  const entry = getAssessmentEntry(config.slug);
  const checks: NamedCheck[] = [];

  checks.push({
    name: 'Launch gate: runtime (registry active)',
    status: entry?.status === 'active' ? 'pass' : 'fail',
    detail: entry
      ? `Registry status "${entry.status}"`
      : 'Registry entry missing',
  });

  checks.push({
    name: 'Launch gate: runtime (slug routable)',
    status: isSupportedAssessmentSlug(config.slug) ? 'pass' : 'fail',
    detail: isSupportedAssessmentSlug(config.slug)
      ? 'Slug active in registry'
      : 'Slug not active',
  });

  const catalogVisible = entry?.catalogVisible === true;
  checks.push({
    name: 'Launch gate: catalog (catalogVisible)',
    status: entry ? 'pass' : 'fail',
    detail: catalogVisible
      ? 'catalogVisible true — listed on /assessments'
      : 'catalogVisible false — hidden from public catalog',
  });

  const enabledArtifacts = config.launchGates.artifactKeys.filter((key) =>
    isOutputArtifactEnabled(config.assessmentType, key)
  );
  checks.push({
    name: 'Launch gate: artifacts (disabled in-repo)',
    status: enabledArtifacts.length === 0 ? 'pass' : 'fail',
    detail:
      enabledArtifacts.length === 0
        ? `${config.launchGates.artifactKeys.join(', ')} disabled via operations contract`
        : `Unexpected enabled: ${enabledArtifacts.join(', ')}`,
  });

  return checks;
}

/** HTTP launch gate checks for SEO + sitemap (requires base URL). */
export async function buildHttpLaunchGateChecks(
  config: AssessmentDeploymentConfig,
  baseUrl: string
): Promise<NamedCheck[]> {
  const root = normalizeBaseUrl(baseUrl);
  const checks: NamedCheck[] = [];
  const expectsIndex = assessmentExpectsPublicIndex(config);

  const cover = await fetchText(`${root}/assessments/${config.slug}`);
  checks.push({
    name: 'Launch gate: SEO (cover route HTTP 200)',
    status: cover.status === 200 ? 'pass' : 'fail',
    detail: `status ${cover.status}`,
  });

  const coverHasNoindex = htmlHasNoindex(cover.text);
  checks.push({
    name: expectsIndex
      ? 'Launch gate: SEO (cover indexable)'
      : 'Launch gate: SEO (cover noindex when guarded)',
    status: expectsIndex ? !coverHasNoindex : coverHasNoindex,
    detail: expectsIndex
      ? coverHasNoindex
        ? 'noindex found (expected index,follow)'
        : 'indexable'
      : coverHasNoindex
        ? 'noindex present'
        : 'noindex missing (guarded phase)',
  });

  const sitemap = await fetchText(`${root}/sitemap.xml`);
  const hasCatalog = sitemap.text.includes('/assessments</loc>');
  const hasAssessment = sitemap.text.includes(`/assessments/${config.slug}</loc>`);
  checks.push({
    name: expectsIndex
      ? 'Launch gate: sitemap (/assessments)'
      : 'Launch gate: sitemap (catalog route absent when guarded)',
    status: expectsIndex ? hasCatalog : !hasCatalog,
    detail: hasCatalog ? 'found /assessments' : 'absent',
  });
  checks.push({
    name: expectsIndex
      ? `Launch gate: sitemap (/assessments/${config.slug})`
      : `Launch gate: sitemap (${config.slug} absent when guarded)`,
    status: expectsIndex ? hasAssessment : !hasAssessment,
    detail: hasAssessment ? 'found in sitemap' : 'absent',
  });

  const catalog = await fetchText(`${root}/assessments`);
  const listedInCatalog = catalog.text.includes(`"slug":"${config.slug}"`);
  checks.push({
    name: expectsIndex
      ? 'Launch gate: catalog (listed on /assessments)'
      : 'Launch gate: catalog (hidden from /assessments)',
    status: expectsIndex ? listedInCatalog : !listedInCatalog,
    detail: listedInCatalog ? 'listed' : 'not listed',
  });

  return checks;
}

export function buildSeoIndexCheckForRoute(
  html: string,
  config: AssessmentDeploymentConfig,
  routeLabel: string
): NamedCheck {
  const expectsIndex = assessmentExpectsPublicIndex(config);
  const hasNoindex = htmlHasNoindex(html);
  const ok = expectsIndex ? !hasNoindex : hasNoindex;
  return {
    name: expectsIndex
      ? `Public route indexable (${routeLabel})`
      : `Public route noindex (${routeLabel})`,
    status: ok ? 'pass' : 'fail',
    detail: expectsIndex
      ? hasNoindex
        ? 'noindex found (expected indexable after launch flip)'
        : 'indexable'
      : hasNoindex
        ? 'noindex present'
        : 'noindex missing',
  };
}
