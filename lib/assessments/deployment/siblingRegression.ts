import { fetchJson, fetchText, htmlHasNoindex, normalizeBaseUrl } from '@/lib/assessments/deployment/httpUtils';
import { assessmentExpectsPublicIndex } from '@/lib/assessments/deployment/launchGateChecks';
import type {
  AssessmentDeploymentConfig,
  NamedCheck,
  SiblingRegressionTarget,
} from '@/lib/assessments/deployment/types';

async function smokeSibling(
  baseUrl: string,
  target: SiblingRegressionTarget
): Promise<NamedCheck[]> {
  const root = normalizeBaseUrl(baseUrl);
  const checks: NamedCheck[] = [];
  const push = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, status: ok ? 'pass' : 'fail', detail });
  };

  const cover = await fetchText(`${root}/assessments/${target.slug}`);
  push(
    `${target.slug} cover HTTP 200`,
    cover.status === 200,
    `status ${cover.status}`
  );

  if (target.coverMustBeIndexable) {
    push(
      `${target.slug} indexable (no noindex)`,
      !htmlHasNoindex(cover.text),
      htmlHasNoindex(cover.text) ? 'noindex found (regression)' : 'indexable'
    );
  }

  const packRes = await fetchJson(
    `${root}/api/results-packs/resolve?assessmentType=${encodeURIComponent(target.assessmentType)}&resultsVersion=${encodeURIComponent(target.resultsVersion)}&levelId=${encodeURIComponent(target.sampleLevelId)}`
  );
  push(
    `${target.slug} pack resolve HTTP 200`,
    packRes.status === 200,
    `status ${packRes.status}`
  );

  return checks;
}

export async function runSiblingRegressionChecks(
  config: AssessmentDeploymentConfig,
  baseUrl: string,
  options?: { includeTargetSitemapCheck?: boolean }
): Promise<{ status: 'pass' | 'fail'; checks: NamedCheck[] }> {
  const checks: NamedCheck[] = [];

  for (const target of config.siblingRegression) {
    checks.push(...(await smokeSibling(baseUrl, target)));
  }

  if (options?.includeTargetSitemapCheck) {
    const expectsIndex = assessmentExpectsPublicIndex(config);
    const sitemap = await fetchText(`${normalizeBaseUrl(baseUrl)}/sitemap.xml`);
    const inSitemap = sitemap.text.includes(config.slug);
    checks.push({
      name: expectsIndex
        ? `Sitemap includes ${config.slug}`
        : `Sitemap excludes ${config.slug}`,
      status: (expectsIndex ? inSitemap : !inSitemap) ? 'pass' : 'fail',
      detail: inSitemap ? 'found in sitemap' : 'absent',
    });
  }

  const status = checks.every((c) => c.status === 'pass') ? 'pass' : 'fail';
  return { status, checks };
}
