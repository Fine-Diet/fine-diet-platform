/**
 * Staging apply-mode guards shared by deployment operators (Packet X10).
 */

export interface ApplyModeOptions {
  mode: 'dry-run' | 'apply';
  environment?: string;
  baseUrl?: string;
  confirmStagingWrite?: boolean;
  publishRevisions?: boolean;
  adminSessionCookie?: string;
}

const PRODUCTION_ENV_NAMES = new Set(['production', 'prod', 'live']);
const ALLOWED_APPLY_ENVIRONMENTS = new Set([
  'staging',
  'preview',
  'internal',
  'local',
  'development',
  'dev',
]);

const PRODUCTION_HOST_PATTERNS = [
  /^https?:\/\/(www\.)?myfinediet\.com/i,
  /^https?:\/\/(www\.)?finediet\.com/i,
  /^https?:\/\/(www\.)?fine-diet\.com/i,
];

export function isProductionEnvironment(environment?: string): boolean {
  if (!environment) return false;
  return PRODUCTION_ENV_NAMES.has(environment.trim().toLowerCase());
}

export function isProductionBaseUrl(baseUrl?: string): boolean {
  if (!baseUrl) return false;
  const normalized = baseUrl.trim();
  return PRODUCTION_HOST_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function assertApplyModeAllowed(
  options: ApplyModeOptions
): { ok: true } | { ok: false; blockers: string[] } {
  const blockers: string[] = [];

  if (options.mode !== 'apply') {
    return { ok: true };
  }

  if (!options.environment) {
    blockers.push('Apply mode requires --environment=<staging|preview|internal|local>.');
  } else if (isProductionEnvironment(options.environment)) {
    blockers.push(
      `Apply mode refused: environment "${options.environment}" is treated as production.`
    );
  } else if (
    !ALLOWED_APPLY_ENVIRONMENTS.has(options.environment.trim().toLowerCase())
  ) {
    blockers.push(
      `Apply mode refused: environment "${options.environment}" is not in the allowed staging/internal list.`
    );
  }

  if (!options.baseUrl) {
    blockers.push('Apply mode requires --base-url=<https://staging-host> for target CMS.');
  } else if (isProductionBaseUrl(options.baseUrl)) {
    blockers.push('Apply mode refused: --base-url appears to target production.');
  }

  if (!options.confirmStagingWrite) {
    blockers.push('Apply mode requires --confirm-staging-write.');
  }

  if (!options.adminSessionCookie) {
    blockers.push(
      'Apply mode requires admin session cookie env var (do not commit).'
    );
  }

  if (options.publishRevisions && !options.confirmStagingWrite) {
    blockers.push('--publish-revisions also requires --confirm-staging-write.');
  }

  return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}
