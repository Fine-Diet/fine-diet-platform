/**
 * Baseline Readiness staging/internal QA operator (Packet U, updated X4c)
 *
 * Guarded, repeatable validation + optional staging writes + forced-preview checks.
 * Default mode is dry-run (read-only). Does not change registry status, SEO posture,
 * or public marketing launch approval.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  formatAdminApiFailure,
  runAdminApiDiagnostics,
  buildStagingQaRequestHeaders,
  isVercelProtectionHtml,
  matchesCreatePackSuccessShape,
  matchesSaveJsonSuccessShape,
  renderAdminApiDiagnosticsMarkdown,
  type AdminApiBodyKind,
  type AdminApiFailureCause,
  type AdminApiResponseProbe,
} from '@/lib/assessments/deployment/adminApiDiagnostics';
import {
  assertApplyModeAllowed as assertApplyModeAllowedCore,
  isProductionBaseUrl,
  isProductionEnvironment,
} from '@/lib/assessments/deployment/applyModeGuard';
import { buildStagingQaOptions } from '@/lib/assessments/deployment/stagingQaCliOptions';
import { validateAssessmentSource } from '@/lib/assessments/deployment/sourceValidation';
import { BASELINE_READINESS_DEPLOYMENT_CONFIG } from '@/lib/assessments/deployment/configs/baselineReadinessDeploymentConfig';
import questionSetSource from '@/content/assessments/baseline-readiness/questions_v1.json';
import resultsSource from '@/content/assessments/baseline-readiness/results_v1-internal.json';
import {
  BASELINE_READINESS_RESULT_LEVELS,
  BASELINE_READINESS_RESULTS_CONTENT_VERSION,
} from '@/lib/assessments/baselineReadiness/constants';
import {
  getAssessmentEntry,
  isSupportedAssessmentSlug,
} from '@/lib/assessments/assessmentRegistry';
import { isOutputArtifactEnabled } from '@/lib/assessments/operationsContract';

export const BASELINE_READINESS_ASSESSMENT_TYPE = 'baseline-readiness' as const;
export const BASELINE_READINESS_QUESTION_SET_VERSION = '1';
export const EXPECTED_QUESTION_IDS = [
  'br-q1',
  'br-q2',
  'br-q3',
  'br-q4',
  'br-q5',
] as const;
export const EXPECTED_AVATARS = [...BASELINE_READINESS_RESULT_LEVELS];
export const FORCED_PREVIEW_OUTCOMES = [...BASELINE_READINESS_RESULT_LEVELS];

export type QaOperatorMode = 'dry-run' | 'apply';

export type { AdminApiBodyKind, AdminApiFailureCause, AdminApiResponseProbe };
export {
  classifyAdminApiResponse,
  detectAdminApiBodyKind,
  renderAdminApiDiagnosticsMarkdown,
  sanitizeBodyPreview,
} from '@/lib/assessments/deployment/adminApiDiagnostics';

export { isProductionEnvironment, isProductionBaseUrl };

export interface QaOperatorOptions {
  mode: QaOperatorMode;
  environment?: string;
  baseUrl?: string;
  confirmStagingWrite?: boolean;
  publishRevisions?: boolean;
  reportOut?: string;
  /** Admin session cookie value — never log or persist. */
  adminSessionCookie?: string;
  /** Vercel Deployment Protection bypass secret — never log or persist. */
  vercelProtectionBypass?: string;
  skipForcedPreview?: boolean;
  skipPublicSafety?: boolean;
  /** Probe admin API responses without writes (Packet U2 diagnostics). */
  diagnoseApi?: boolean;
}

export interface SourceValidationResult {
  ok: boolean;
  questionSet: {
    ok: boolean;
    errors: string[];
    warnings: string[];
    assessmentType: string;
    schemaVersion: string;
    assessmentVersion: string;
    questionIds: string[];
    avatars: string[];
  };
  resultPacks: {
    ok: boolean;
    resultsVersion: string;
    levelIds: string[];
    packs: Record<
      string,
      { ok: boolean; errors: string[]; warnings: string[]; label?: string }
    >;
  };
  errors: string[];
}

export interface PlannedCmsOperation {
  kind:
    | 'save-question-set-draft'
    | 'create-result-pack-identity'
    | 'save-result-pack-revision'
    | 'set-question-set-preview'
    | 'publish-question-set-revision'
    | 'set-result-pack-preview'
    | 'publish-result-pack-revision';
  description: string;
  apiPath: string;
  identity: Record<string, string>;
}

export interface ForcedPreviewCheck {
  forceOutcome: string;
  status: 'skipped' | 'pass' | 'fail' | 'blocked';
  previewRoute?: {
    httpStatus: number;
    ok: boolean;
    notes: string[];
  };
  resolveApi?: {
    httpStatus: number;
    ok: boolean;
    packLabel?: string;
    flowV2Present: boolean;
    notes: string[];
  };
  notes: string[];
}

export interface PublicSafetyCheck {
  name: string;
  status: 'pass' | 'fail' | 'skipped';
  detail: string;
}

export interface ApplyOperationResult {
  operation: PlannedCmsOperation;
  status: 'skipped' | 'success' | 'error';
  detail: string;
}

export interface QaReport {
  timestamp: string;
  mode: QaOperatorMode;
  environment: string;
  baseUrl: string | null;
  sourceValidation: SourceValidationResult;
  plannedCmsOperations: PlannedCmsOperation[];
  applyResults: ApplyOperationResult[];
  apiDiagnostics: AdminApiResponseProbe[];
  forcedPreviewChecks: ForcedPreviewCheck[];
  publicSafetyChecks: PublicSafetyCheck[];
  sideEffectChecks: { name: string; status: 'pass'; detail: string }[];
  blockers: string[];
  goNoGo: 'GO' | 'NO-GO' | 'DRY-RUN-ONLY';
  manualReviewRemaining: string[];
}

export function parseCliArgs(argv: string[]): QaOperatorOptions {
  return buildStagingQaOptions(BASELINE_READINESS_DEPLOYMENT_CONFIG, argv.slice(2));
}

export function assertApplyModeAllowed(
  options: QaOperatorOptions
): { ok: true } | { ok: false; blockers: string[] } {
  const result = assertApplyModeAllowedCore(options);
  if (result.ok) {
    return result;
  }

  const adminCookieEnvVar =
    BASELINE_READINESS_DEPLOYMENT_CONFIG.stagingQa.adminCookieEnvVar;
  return {
    ok: false,
    blockers: result.blockers.map((blocker) =>
      blocker.includes('admin session cookie env var')
        ? `Apply mode requires ${adminCookieEnvVar} env var (admin session cookie — do not commit).`
        : blocker
    ),
  };
}

const BASELINE_ADMIN_API_ENV = {
  adminCookieEnvVar: BASELINE_READINESS_DEPLOYMENT_CONFIG.stagingQa.adminCookieEnvVar,
  vercelBypassEnvVar: BASELINE_READINESS_DEPLOYMENT_CONFIG.stagingQa.vercelBypassEnvVar,
};

export function validateBaselineReadinessSource(): SourceValidationResult {
  return validateAssessmentSource(BASELINE_READINESS_DEPLOYMENT_CONFIG);
}

export function buildPlannedCmsOperations(
  options: QaOperatorOptions
): PlannedCmsOperation[] {
  const ops: PlannedCmsOperation[] = [];

  ops.push({
    kind: 'save-question-set-draft',
    description: `Save question set draft for ${BASELINE_READINESS_ASSESSMENT_TYPE} v${BASELINE_READINESS_QUESTION_SET_VERSION} from source JSON`,
    apiPath: '/api/admin/question-sets/save-json',
    identity: {
      assessment_type: BASELINE_READINESS_ASSESSMENT_TYPE,
      assessment_version: BASELINE_READINESS_QUESTION_SET_VERSION,
      locale: 'default',
    },
  });

  if (options.mode === 'apply') {
    ops.push({
      kind: 'set-question-set-preview',
      description: 'Set preview pointer on saved question-set revision (staging only)',
      apiPath: '/api/admin/question-sets/save-json (setPreview: true)',
      identity: {
        assessment_type: BASELINE_READINESS_ASSESSMENT_TYPE,
        assessment_version: BASELINE_READINESS_QUESTION_SET_VERSION,
      },
    });
  }

  if (options.publishRevisions) {
    ops.push({
      kind: 'publish-question-set-revision',
      description:
        'Publish question-set revision (admin only — requires --publish-revisions)',
      apiPath: '/api/admin/question-set-pointers/publish',
      identity: {
        assessment_type: BASELINE_READINESS_ASSESSMENT_TYPE,
        assessment_version: BASELINE_READINESS_QUESTION_SET_VERSION,
      },
    });
  }

  for (const levelId of BASELINE_READINESS_RESULT_LEVELS) {
    ops.push({
      kind: 'create-result-pack-identity',
      description: `Create/upsert result pack identity for ${levelId}`,
      apiPath: '/api/admin/results-packs/create',
      identity: {
        assessment_type: BASELINE_READINESS_ASSESSMENT_TYPE,
        results_version: BASELINE_READINESS_RESULTS_CONTENT_VERSION,
        level_id: levelId,
        slug: `${BASELINE_READINESS_ASSESSMENT_TYPE}:${BASELINE_READINESS_RESULTS_CONTENT_VERSION}:${levelId}`,
      },
    });

    ops.push({
      kind: 'save-result-pack-revision',
      description: `Save draft revision from packs.${levelId} in results_v1-internal.json`,
      apiPath: '/api/admin/results-packs/{packId}/revisions/create',
      identity: {
        assessment_type: BASELINE_READINESS_ASSESSMENT_TYPE,
        results_version: BASELINE_READINESS_RESULTS_CONTENT_VERSION,
        level_id: levelId,
      },
    });

    if (options.mode === 'apply') {
      ops.push({
        kind: 'set-result-pack-preview',
        description: `Set preview pointer for ${levelId} pack (staging only)`,
        apiPath: '/api/admin/results-packs/{packId}/preview',
        identity: { level_id: levelId },
      });
    }

    if (options.publishRevisions) {
      ops.push({
        kind: 'publish-result-pack-revision',
        description: `Publish ${levelId} pack revision (admin only)`,
        apiPath: '/api/admin/results-packs/{packId}/publish',
        identity: { level_id: levelId },
      });
    }
  }

  return ops;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function fetchText(
  url: string,
  options?: { adminSessionCookie?: string; vercelProtectionBypass?: string }
): Promise<{ status: number; body: string }> {
  const headers = buildStagingQaRequestHeaders({
    adminSessionCookie: options?.adminSessionCookie,
    vercelProtectionBypass: options?.vercelProtectionBypass,
    accept: 'text/html,application/json',
  });

  const response = await fetch(url, { headers, redirect: 'follow' });
  const body = await response.text();
  return { status: response.status, body };
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit & {
    adminSessionCookie?: string;
    vercelProtectionBypass?: string;
  }
): Promise<{
  status: number;
  json: T | null;
  raw: string;
  contentType: string | null;
}> {
  const headers = buildStagingQaRequestHeaders({
    adminSessionCookie: init?.adminSessionCookie,
    vercelProtectionBypass: init?.vercelProtectionBypass,
    accept: 'application/json',
    contentType: 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  });

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: 'follow',
  });
  const contentType = response.headers.get('content-type');
  const raw = await response.text();
  try {
    return { status: response.status, json: JSON.parse(raw) as T, raw, contentType };
  } catch {
    return { status: response.status, json: null, raw, contentType };
  }
}

function hasFlowV2Structure(pack: unknown): boolean {
  if (!pack || typeof pack !== 'object') return false;
  const flow = (pack as { flow?: Record<string, unknown> }).flow;
  if (!flow) return false;
  const page1 = flow.page1 as { snapshotBullets?: unknown[]; headline?: string } | undefined;
  const page2 = flow.page2 as { stepBullets?: unknown[] } | undefined;
  const page3 = flow.page3 as { tryBullets?: unknown[]; mechanismPills?: unknown[] } | undefined;
  return (
    Boolean(page1?.headline) &&
    Array.isArray(page1?.snapshotBullets) &&
    page1!.snapshotBullets!.length === 3 &&
    Array.isArray(page2?.stepBullets) &&
    page2!.stepBullets!.length === 3 &&
    Array.isArray(page3?.tryBullets) &&
    page3!.tryBullets!.length === 3 &&
    Array.isArray(page3?.mechanismPills) &&
    page3!.mechanismPills!.length === 4
  );
}

export async function runForcedPreviewCheck(
  baseUrl: string,
  forceOutcome: string,
  expectedLabel: string | undefined,
  requestAuth?: { adminSessionCookie?: string; vercelProtectionBypass?: string }
): Promise<ForcedPreviewCheck> {
  const root = normalizeBaseUrl(baseUrl);
  const notes: string[] = [];
  const previewUrl = `${root}/admin/assessments/baseline-readiness/preview?forceOutcome=${encodeURIComponent(forceOutcome)}`;
  // preview=1 resolves preview_revision_id when set; published packs also resolve
  // without preview=1. canPreview() gates preview=1 to editor/admin, and the
  // admin cookie is sent via requestAuth so the resolve API auths the user.
  const resolveUrl = `${root}/api/results-packs/resolve?assessmentType=${encodeURIComponent(BASELINE_READINESS_ASSESSMENT_TYPE)}&resultsVersion=${encodeURIComponent(BASELINE_READINESS_RESULTS_CONTENT_VERSION)}&levelId=${encodeURIComponent(forceOutcome)}&preview=1`;

  const check: ForcedPreviewCheck = {
    forceOutcome,
    status: 'fail',
    notes,
  };

  try {
    const preview = await fetchText(previewUrl, requestAuth);
    const previewNotes: string[] = [];
    let previewOk = preview.status >= 200 && preview.status < 400;

    if (preview.status === 404) {
      previewOk = false;
      previewNotes.push('Preview route returned 404.');
    }
    if (isVercelProtectionHtml(preview.body)) {
      previewOk = false;
      previewNotes.push(
        'Vercel Deployment Protection HTML detected — set BASELINE_READINESS_QA_VERCEL_BYPASS or use an unprotected preview host.'
      );
    }
    if (/don't have permission|do not have permission/i.test(preview.body)) {
      previewOk = false;
      previewNotes.push(
        'App admin auth required — set BASELINE_READINESS_QA_ADMIN_COOKIE for preview route checks.'
      );
    }
    if (/Could not load results pack|Failed to load results pack/i.test(preview.body)) {
      previewNotes.push(
        'SSR/HTML may show missing-pack state before client hydration — verify resolve API below.'
      );
    }
    if (/Forced QA preview|forced QA preview/i.test(preview.body)) {
      previewNotes.push('Forced QA preview marker present in HTML.');
    }
    if (preview.body.includes(forceOutcome)) {
      previewNotes.push(`forceOutcome "${forceOutcome}" appears in HTML.`);
    }

    check.previewRoute = {
      httpStatus: preview.status,
      ok: previewOk,
      notes: previewNotes,
    };

    const resolve = await fetchJson<{
      success?: boolean;
      pack?: { label?: string; flow?: unknown };
      error?: string;
    }>(resolveUrl, requestAuth);

    const resolveNotes: string[] = [];
    let resolveOk = resolve.status >= 200 && resolve.status < 400;
    const pack = resolve.json?.pack;
    const flowV2Present = hasFlowV2Structure(pack);

    if (!resolve.json?.success || !pack) {
      resolveOk = false;
      resolveNotes.push(
        resolve.json?.error ||
          'Resolve API did not return a pack — confirm CMS packs are published or preview-staged.'
      );
    } else {
      resolveNotes.push(`Resolve API returned pack label "${pack.label ?? 'unknown'}".`);
      if (expectedLabel && pack.label !== expectedLabel) {
        resolveOk = false;
        resolveNotes.push(
          `Expected label "${expectedLabel}", got "${pack.label ?? 'missing'}".`
        );
      }
      if (flowV2Present) {
        resolveNotes.push('Flow v2 structure present (page1/2/3 bullet counts).');
      } else {
        resolveOk = false;
        resolveNotes.push('Flow v2 structure incomplete in resolved pack.');
      }
    }

    check.resolveApi = {
      httpStatus: resolve.status,
      ok: resolveOk,
      packLabel: pack?.label,
      flowV2Present,
      notes: resolveNotes,
    };

    const pass = previewOk && resolveOk;
    check.status = pass ? 'pass' : 'fail';
    if (!requestAuth?.adminSessionCookie) {
      notes.push(
        'No admin cookie — preview route auth check may be blocked; resolve API may require preview=1 auth.'
      );
    }
    notes.push(...previewNotes, ...resolveNotes);
  } catch (err) {
    check.status = 'fail';
    notes.push(err instanceof Error ? err.message : String(err));
  }

  return check;
}

export function buildInRepoPublicSafetyChecks(): PublicSafetyCheck[] {
  const entry = getAssessmentEntry(BASELINE_READINESS_ASSESSMENT_TYPE);
  const checks: PublicSafetyCheck[] = [];

  checks.push({
    name: 'Registry status is active (guarded activation)',
    status: entry?.status === 'active' ? 'pass' : 'fail',
    detail: entry
      ? `Registry status is "${entry.status}" (expected active after guarded activation).`
      : 'baseline-readiness registry entry missing.',
  });

  checks.push({
    name: 'Slug publicly routable (guarded activation)',
    status: isSupportedAssessmentSlug(BASELINE_READINESS_ASSESSMENT_TYPE) ? 'pass' : 'fail',
    detail: isSupportedAssessmentSlug(BASELINE_READINESS_ASSESSMENT_TYPE)
      ? 'Public slug is active in registry (expected for guarded activation).'
      : 'Public slug is inactive — guarded activation may be rolled back.',
  });

  checks.push({
    name: 'Catalog listing (catalogVisible)',
    status: entry ? 'pass' : 'fail',
    detail: entry?.catalogVisible
      ? 'catalogVisible true — listed on /assessments (Packet X7).'
      : 'catalogVisible false — hidden from public catalog (guarded phase).',
  });

  const disabledArtifacts = ['email', 'pdf', 'claim', 'account-save'] as const;
  const enabledArtifacts = disabledArtifacts.filter((key) =>
    isOutputArtifactEnabled(BASELINE_READINESS_ASSESSMENT_TYPE, key)
  );
  checks.push({
    name: 'Downstream artifacts disabled in-repo',
    status: enabledArtifacts.length === 0 ? 'pass' : 'fail',
    detail:
      enabledArtifacts.length === 0
        ? 'email, pdf, claim, and account-save remain disabled via operations contract.'
        : `Unexpected enabled artifacts: ${enabledArtifacts.join(', ')}.`,
  });

  return checks;
}

function baselineExpectsPublicIndex(): boolean {
  return getAssessmentEntry(BASELINE_READINESS_ASSESSMENT_TYPE)?.catalogVisible === true;
}

function buildBaselineSeoIndexCheck(html: string): PublicSafetyCheck {
  const hasNoindex = htmlHasNoindexFollow(html);
  const expectsIndex = baselineExpectsPublicIndex();
  const ok = expectsIndex ? !hasNoindex : hasNoindex;
  return {
    name: expectsIndex
      ? 'SEO index posture on public route'
      : 'SEO noindex posture on public route',
    status: ok ? 'pass' : 'fail',
    detail: expectsIndex
      ? ok
        ? 'Public route is indexable (catalogVisible true — Packet X7).'
        : 'Public route still has noindex — marketing launch SEO flip may be missing.'
      : ok
        ? 'Robots meta includes noindex (marketing launch remains blocked from indexing).'
        : 'Public route HTML lacks noindex — marketing launch SEO guard may be missing.',
  };
}

function htmlHasNoindexFollow(body: string): boolean {
  const robotsMatch = body.match(
    /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i
  );
  if (!robotsMatch) {
    const contentFirst = body.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i
    );
    if (!contentFirst) return false;
    return contentFirst[1].toLowerCase().includes('noindex');
  }
  return robotsMatch[1].toLowerCase().includes('noindex');
}

export async function runPublicSafetyChecks(
  baseUrl: string,
  requestAuth?: { adminSessionCookie?: string; vercelProtectionBypass?: string }
): Promise<PublicSafetyCheck[]> {
  const root = normalizeBaseUrl(baseUrl);
  const checks = buildInRepoPublicSafetyChecks();

  try {
    const publicRoute = await fetchText(
      `${root}/assessments/baseline-readiness`,
      requestAuth
    );
    const isVercelShell =
      publicRoute.status === 200 && isVercelProtectionHtml(publicRoute.body);

    if (isVercelShell && !requestAuth?.vercelProtectionBypass) {
      checks.push({
        name: 'Public route /assessments/baseline-readiness reachable',
        status: 'skipped',
        detail:
          'Vercel Deployment Protection returned a login shell (HTTP 200 HTML). Set BASELINE_READINESS_QA_VERCEL_BYPASS to confirm the app-level route behind protection.',
      });
      checks.push({
        name: 'SEO index posture on public route',
        status: 'skipped',
        detail:
          'Cannot confirm index posture behind Vercel Deployment Protection without bypass.',
      });
    } else if (isVercelShell && requestAuth?.vercelProtectionBypass) {
      const behind = await fetchText(
        `${root}/assessments/baseline-readiness`,
        requestAuth
      );
      const stillShell = isVercelProtectionHtml(behind.body);
      const reachable = behind.status >= 200 && behind.status < 400 && !stillShell;
      const blocked =
        behind.status === 404 || /not found|404/i.test(behind.body.slice(0, 500));
      checks.push({
        name: 'Public route /assessments/baseline-readiness reachable',
        status: reachable && !blocked ? 'pass' : stillShell ? 'skipped' : 'fail',
        detail: reachable && !blocked
          ? `Behind Vercel protection, public route returned ${behind.status} (expected live after guarded activation).`
          : stillShell
            ? 'Bypass did not reach the app — still a Vercel login shell.'
            : blocked
              ? `Behind Vercel protection, public route returned ${behind.status} — guarded activation may be rolled back.`
              : `Behind Vercel protection, public route responded ${behind.status} — investigate.`,
      });
      if (reachable && !blocked) {
        checks.push(buildBaselineSeoIndexCheck(behind.body));
      } else {
        checks.push({
          name: 'SEO noindex posture on public route',
          status: 'skipped',
          detail: 'Skipped — public route not confirmed reachable behind protection.',
        });
      }
    } else {
      const blocked =
        publicRoute.status === 404 ||
        /not found|404/i.test(publicRoute.body.slice(0, 500));
      const reachable = publicRoute.status >= 200 && publicRoute.status < 400 && !blocked;
      checks.push({
        name: 'Public route /assessments/baseline-readiness reachable',
        status: reachable ? 'pass' : 'fail',
        detail: reachable
          ? `Public route returned ${publicRoute.status} (expected live after guarded activation).`
          : blocked
            ? `Public route returned ${publicRoute.status} — guarded activation may be rolled back.`
            : `Public route responded ${publicRoute.status} — investigate.`,
      });
      if (reachable) {
        checks.push(buildBaselineSeoIndexCheck(publicRoute.body));
      } else {
        checks.push({
          name: 'SEO noindex posture on public route',
          status: 'skipped',
          detail: 'Skipped — public route not reachable.',
        });
      }
    }
  } catch (err) {
    checks.push({
      name: 'Public route /assessments/baseline-readiness reachable',
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
    });
    checks.push({
      name: 'SEO noindex posture on public route',
      status: 'skipped',
      detail: 'Skipped — public route fetch failed.',
    });
  }

  return checks;
}

async function applyCmsOperations(
  options: QaOperatorOptions,
  planned: PlannedCmsOperation[]
): Promise<ApplyOperationResult[]> {
  const results: ApplyOperationResult[] = [];
  if (options.mode !== 'apply') {
    return planned.map((operation) => ({
      operation,
      status: 'skipped',
      detail: 'Dry-run — no write performed.',
    }));
  }

  const gate = assertApplyModeAllowed(options);
  if (!gate.ok) {
    return planned.map((operation) => ({
      operation,
      status: 'skipped',
      detail: `Apply blocked: ${gate.blockers[0]}`,
    }));
  }

  const root = normalizeBaseUrl(options.baseUrl!);
  const cookie = options.adminSessionCookie!;
  const vercelBypass = options.vercelProtectionBypass;
  const fetchAuth = {
    adminSessionCookie: cookie,
    vercelProtectionBypass: vercelBypass,
  };

  let questionSetId: string | null = null;
  let questionSetRevisionId: string | null = null;
  const packIds: Record<string, string> = {};
  const packRevisionIds: Record<string, string> = {};

  for (const operation of planned) {
    try {
      if (operation.kind === 'save-question-set-draft') {
        const response = await fetchJson<{
          ok?: boolean;
          kind?: string;
          questionSetId?: string;
          revisionId?: string;
          errors?: string[];
          error?: string;
        }>(`${root}/api/admin/question-sets/save-json`, {
          method: 'POST',
          ...fetchAuth,
          body: JSON.stringify({
            questionSet: questionSetSource,
            assessmentType: BASELINE_READINESS_ASSESSMENT_TYPE,
            assessmentVersion: BASELINE_READINESS_QUESTION_SET_VERSION,
            locale: null,
            notes: 'Baseline Readiness v1 internal publish (Packet U QA operator)',
            setPreview: true,
          }),
        });

        if (matchesSaveJsonSuccessShape(response.json)) {
          const body = response.json as {
            questionSetId: string;
            revisionId: string;
          };
          questionSetId = body.questionSetId;
          questionSetRevisionId = body.revisionId;
          results.push({
            operation,
            status: 'success',
            detail: `Saved draft revision ${body.revisionId} (questionSetId ${body.questionSetId}).`,
          });
        } else {
          results.push({
            operation,
            status: 'error',
            detail:
              (response.json as { errors?: string[] } | null)?.errors?.join('; ') ||
              formatAdminApiFailure(response, 'save-json-success', BASELINE_ADMIN_API_ENV),
          });
        }
        continue;
      }

      if (operation.kind === 'set-question-set-preview') {
        results.push({
          operation,
          status: questionSetRevisionId ? 'success' : 'skipped',
          detail: questionSetRevisionId
            ? 'Preview pointer set via save-json (setPreview: true).'
            : 'Skipped — question set draft save did not succeed.',
        });
        continue;
      }

      if (operation.kind === 'publish-question-set-revision') {
        if (!questionSetId || !questionSetRevisionId) {
          results.push({
            operation,
            status: 'error',
            detail: 'Missing questionSetId/revisionId — save draft first.',
          });
          continue;
        }
        const response = await fetchJson<{ error?: string }>(
          `${root}/api/admin/question-set-pointers/publish`,
          {
            method: 'POST',
            ...fetchAuth,
            body: JSON.stringify({
              questionSetId,
              revisionId: questionSetRevisionId,
            }),
          }
        );
        results.push({
          operation,
          status:
            response.status >= 200 &&
            response.status < 300 &&
            !(response.json as { error?: string } | null)?.error
              ? 'success'
              : 'error',
          detail:
            (response.json as { error?: string } | null)?.error ||
            formatAdminApiFailure(response, 'save-json-success', BASELINE_ADMIN_API_ENV),
        });
        continue;
      }

      if (operation.kind === 'create-result-pack-identity') {
        const levelId = operation.identity.level_id;
        const response = await fetchJson<{ pack?: { id: string }; error?: string }>(
          `${root}/api/admin/results-packs/create`,
          {
            method: 'POST',
            ...fetchAuth,
            body: JSON.stringify({
              assessment_type: BASELINE_READINESS_ASSESSMENT_TYPE,
              results_version: BASELINE_READINESS_RESULTS_CONTENT_VERSION,
              level_id: levelId,
            }),
          }
        );
        if (matchesCreatePackSuccessShape(response.json)) {
          const packId = (response.json as { pack: { id: string } }).pack.id;
          packIds[levelId] = packId;
          results.push({
            operation,
            status: 'success',
            detail: `Pack identity ${packId} for ${levelId}.`,
          });
        } else {
          results.push({
            operation,
            status: 'error',
            detail: formatAdminApiFailure(response, 'create-pack-success', BASELINE_ADMIN_API_ENV),
          });
        }
        continue;
      }

      if (operation.kind === 'save-result-pack-revision') {
        const levelId = operation.identity.level_id;
        const packId = packIds[levelId];
        if (!packId) {
          results.push({
            operation,
            status: 'error',
            detail: `No packId for ${levelId} — create identity first.`,
          });
          continue;
        }
        const packContent = resultsSource.packs[levelId as keyof typeof resultsSource.packs];
        const response = await fetchJson<{
          revision?: { id: string };
          validation?: { ok: boolean; errors: string[] };
          error?: string;
        }>(`${root}/api/admin/results-packs/${packId}/revisions/create`, {
          method: 'POST',
          ...fetchAuth,
          body: JSON.stringify({
            content_json: packContent,
            change_summary: `Baseline Readiness ${levelId} v1-internal (Packet U QA operator)`,
          }),
        });
        if (response.json?.revision?.id) {
          packRevisionIds[levelId] = response.json.revision.id;
          const valid = response.json.validation?.ok !== false;
          results.push({
            operation,
            status: valid ? 'success' : 'error',
            detail: valid
              ? `Revision ${response.json.revision.id} for ${levelId}.`
              : response.json.validation?.errors?.join('; ') || 'Validation failed.',
          });
        } else {
          results.push({
            operation,
            status: 'error',
            detail: response.json?.error || formatAdminApiFailure(response, 'create-pack-success', BASELINE_ADMIN_API_ENV),
          });
        }
        continue;
      }

      if (operation.kind === 'set-result-pack-preview') {
        const levelId = operation.identity.level_id;
        const packId = packIds[levelId];
        const revisionId = packRevisionIds[levelId];
        if (!packId || !revisionId) {
          results.push({
            operation,
            status: 'error',
            detail: `Missing packId/revisionId for ${levelId}.`,
          });
          continue;
        }
        const response = await fetchJson<{ error?: string }>(
          `${root}/api/admin/results-packs/${packId}/preview`,
          {
            method: 'POST',
            ...fetchAuth,
            body: JSON.stringify({ revision_id: revisionId }),
          }
        );
        results.push({
          operation,
          status:
            response.status >= 200 && response.status < 300 && !response.json?.error
              ? 'success'
              : 'error',
          detail:
            response.json?.error || formatAdminApiFailure(response, 'create-pack-success', BASELINE_ADMIN_API_ENV),
        });
        continue;
      }

      if (operation.kind === 'publish-result-pack-revision') {
        const levelId = operation.identity.level_id;
        const packId = packIds[levelId];
        const revisionId = packRevisionIds[levelId];
        if (!packId || !revisionId) {
          results.push({
            operation,
            status: 'error',
            detail: `Missing packId/revisionId for ${levelId}.`,
          });
          continue;
        }
        const response = await fetchJson<{ error?: string }>(
          `${root}/api/admin/results-packs/${packId}/publish`,
          {
            method: 'POST',
            ...fetchAuth,
            body: JSON.stringify({ revision_id: revisionId }),
          }
        );
        results.push({
          operation,
          status:
            response.status >= 200 && response.status < 300 && !response.json?.error
              ? 'success'
              : 'error',
          detail:
            response.json?.error || formatAdminApiFailure(response, 'create-pack-success', BASELINE_ADMIN_API_ENV),
        });
        continue;
      }

      results.push({
        operation,
        status: 'skipped',
        detail: 'Unhandled operation kind.',
      });
    } catch (err) {
      results.push({
        operation,
        status: 'error',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export function buildSideEffectChecks(): QaReport['sideEffectChecks'] {
  return [
    {
      name: 'No submission created by operator',
      status: 'pass',
      detail: 'Operator does not call assessment submission or scoring endpoints.',
    },
    {
      name: 'No email/PDF/webhook/claim endpoints invoked',
      status: 'pass',
      detail: 'Apply mode only targets question-set and results-pack admin APIs.',
    },
    {
      name: 'Operator does not change registry status',
      status: 'pass',
      detail: 'Operator never modifies assessment registry status or SEO posture.',
    },
    {
      name: 'Result pack channels.email/pdf disabled in source',
      status: 'pass',
      detail: 'Source JSON validates channels.email.enabled=false and channels.pdf.enabled=false.',
    },
  ];
}

export function computeGoNoGo(report: QaReport): QaReport['goNoGo'] {
  if (report.mode === 'dry-run') {
    return report.sourceValidation.ok && report.blockers.length === 0
      ? 'DRY-RUN-ONLY'
      : 'NO-GO';
  }

  const applyErrors = report.applyResults.some((r) => r.status === 'error');
  const previewFails = report.forcedPreviewChecks.some((c) => c.status === 'fail');
  const publicFails = report.publicSafetyChecks.some((c) => c.status === 'fail');

  if (
    !report.sourceValidation.ok ||
    report.blockers.length > 0 ||
    applyErrors ||
    previewFails ||
    publicFails
  ) {
    return 'NO-GO';
  }

  return 'GO';
}

export function renderQaReportMarkdown(report: QaReport): string {
  const lines: string[] = [
    '# Baseline Readiness Staging QA Report',
    '',
    `**Generated:** ${report.timestamp}`,
    `**Mode:** ${report.mode}`,
    `**Environment:** ${report.environment || '(not set)'}`,
    `**Base URL:** ${report.baseUrl || '(not set)'}`,
    `**Recommendation:** ${report.goNoGo}`,
    '',
    '## Source JSON validation',
    '',
    report.sourceValidation.ok ? '- **PASS**' : '- **FAIL**',
  ];

  if (report.sourceValidation.errors.length > 0) {
    lines.push('', 'Errors:');
    for (const err of report.sourceValidation.errors) {
      lines.push(`- ${err}`);
    }
  }

  lines.push(
    '',
    '### Question set',
    `- assessmentType: \`${report.sourceValidation.questionSet.assessmentType}\``,
    `- schema version: \`${report.sourceValidation.questionSet.schemaVersion}\``,
    `- CMS assessment_version: \`${report.sourceValidation.questionSet.assessmentVersion}\``,
    `- question IDs: ${report.sourceValidation.questionSet.questionIds.join(', ')}`,
    `- avatars: ${report.sourceValidation.questionSet.avatars.join(', ')}`,
    '',
    '### Result packs',
    `- results version: \`${report.sourceValidation.resultPacks.resultsVersion}\``,
    `- level IDs: ${report.sourceValidation.resultPacks.levelIds.join(', ')}`,
    ''
  );

  for (const [levelId, pack] of Object.entries(
    report.sourceValidation.resultPacks.packs
  )) {
    lines.push(
      `- **${levelId}**: ${pack.ok ? 'PASS' : 'FAIL'}${pack.label ? ` (${pack.label})` : ''}`
    );
  }

  lines.push('', '## Planned CMS identities / operations', '');
  for (const op of report.plannedCmsOperations) {
    lines.push(`- **${op.kind}**: ${op.description}`);
    lines.push(`  - API: \`${op.apiPath}\``);
    lines.push(
      `  - Identity: ${Object.entries(op.identity)
        .map(([k, v]) => `${k}=\`${v}\``)
        .join(', ')}`
    );
  }

  if (report.applyResults.length > 0) {
    lines.push('', '## Apply / stage status', '');
    for (const result of report.applyResults) {
      lines.push(`- **${result.operation.kind}**: ${result.status} — ${result.detail}`);
    }
  }

  if (report.apiDiagnostics.length > 0) {
    lines.push('', renderAdminApiDiagnosticsMarkdown(report.apiDiagnostics));
  }

  lines.push('', '## Forced-preview checks', '');
  if (report.forcedPreviewChecks.length === 0) {
    lines.push(
      '- Skipped — provide `--base-url` to run forced-preview and resolve API checks.'
    );
  } else {
    for (const check of report.forcedPreviewChecks) {
      lines.push(`### ${check.forceOutcome}`, `- Status: **${check.status}**`);
      if (check.previewRoute) {
        lines.push(
          `- Preview route: HTTP ${check.previewRoute.httpStatus} — ${check.previewRoute.ok ? 'OK' : 'FAIL'}`
        );
        for (const note of check.previewRoute.notes) {
          lines.push(`  - ${note}`);
        }
      }
      if (check.resolveApi) {
        lines.push(
          `- Resolve API: HTTP ${check.resolveApi.httpStatus} — ${check.resolveApi.ok ? 'OK' : 'FAIL'}${check.resolveApi.packLabel ? ` (label: ${check.resolveApi.packLabel})` : ''}`
        );
        lines.push(
          `  - Flow v2 structure: ${check.resolveApi.flowV2Present ? 'present' : 'missing'}`
        );
        for (const note of check.resolveApi.notes) {
          lines.push(`  - ${note}`);
        }
      }
      for (const note of check.notes) {
        lines.push(`- ${note}`);
      }
      lines.push('');
    }
  }

  lines.push('## Public safety checks', '');
  for (const check of report.publicSafetyChecks) {
    lines.push(`- **${check.name}**: ${check.status.toUpperCase()} — ${check.detail}`);
  }

  lines.push('', '## Side-effect checks', '');
  for (const check of report.sideEffectChecks) {
    lines.push(`- **${check.name}**: ${check.detail}`);
  }

  if (report.blockers.length > 0) {
    lines.push('', '## Blockers', '');
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  lines.push('', '## Manual review still required', '');
  for (const item of report.manualReviewRemaining) {
    lines.push(`- ${item}`);
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- This operator does **not** change registry status, SEO/noindex posture, or public marketing launch approval.',
    '- Guarded activation (registry `active`, route live, noindex/follow) is expected in production — marketing launch remains a separate sign-off.',
    '- Gut Check behavior is untouched.',
    '- Forced-preview visual QA (screenshots, CTA/video placeholder acceptance) still requires human review per the runbook §1.4 and §5.'
  );

  return lines.join('\n');
}

export function defaultReportPath(reportFilenamePrefix?: string): string {
  const prefix =
    reportFilenamePrefix ??
    BASELINE_READINESS_DEPLOYMENT_CONFIG.stagingQa.reportFilenamePrefix;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '.reports', 'assessments', `${prefix}-${stamp}.md`);
}

export async function runBaselineReadinessStagingQa(
  options: QaOperatorOptions
): Promise<QaReport> {
  const blockers: string[] = [];
  const sourceValidation = validateBaselineReadinessSource();
  if (!sourceValidation.ok) {
    blockers.push('Source JSON validation failed.');
  }

  if (options.mode === 'apply') {
    const gate = assertApplyModeAllowed(options);
    if (!gate.ok) {
      blockers.push(...gate.blockers);
    }
  }

  const plannedCmsOperations = buildPlannedCmsOperations(options);
  const requestAuth = {
    adminSessionCookie: options.adminSessionCookie,
    vercelProtectionBypass: options.vercelProtectionBypass,
  };

  let apiDiagnostics: AdminApiResponseProbe[] = [];
  if (options.diagnoseApi && options.baseUrl) {
    apiDiagnostics = await runAdminApiDiagnostics(BASELINE_READINESS_DEPLOYMENT_CONFIG, {
      baseUrl: options.baseUrl,
      adminSessionCookie: options.adminSessionCookie,
      vercelProtectionBypass: options.vercelProtectionBypass,
    });
    for (const probe of apiDiagnostics) {
      if (probe.likelyCause !== 'ok') {
        blockers.push(
          `Admin API diagnostic ${probe.method} ${probe.endpoint}: cause ${probe.likelyCause} — ${probe.detail}`
        );
      }
    }
  } else if (options.mode === 'apply' && options.baseUrl) {
    apiDiagnostics = await runAdminApiDiagnostics(BASELINE_READINESS_DEPLOYMENT_CONFIG, {
      baseUrl: options.baseUrl,
      adminSessionCookie: options.adminSessionCookie,
      vercelProtectionBypass: options.vercelProtectionBypass,
    });
  }

  const applyResults = await applyCmsOperations(options, plannedCmsOperations);

  let forcedPreviewChecks: ForcedPreviewCheck[] = [];
  if (!options.skipForcedPreview && options.baseUrl) {
    for (const levelId of BASELINE_READINESS_RESULT_LEVELS) {
      const expectedLabel =
        sourceValidation.resultPacks.packs[levelId]?.label;
      forcedPreviewChecks.push(
        await runForcedPreviewCheck(
          options.baseUrl,
          levelId,
          expectedLabel,
          requestAuth
        )
      );
    }
  } else if (!options.skipForcedPreview && !options.baseUrl) {
    forcedPreviewChecks = FORCED_PREVIEW_OUTCOMES.map((forceOutcome) => ({
      forceOutcome,
      status: 'skipped' as const,
      notes: ['Provide --base-url to run forced-preview checks against a running app.'],
    }));
  }

  let publicSafetyChecks: PublicSafetyCheck[] = [];
  if (!options.skipPublicSafety) {
    publicSafetyChecks = options.baseUrl
      ? await runPublicSafetyChecks(options.baseUrl, requestAuth)
      : buildInRepoPublicSafetyChecks().map((check) => ({
          ...check,
          detail: `${check.detail} (local in-repo check — provide --base-url for route/noindex HTTP checks).`,
        }));
  }

  const manualReviewRemaining = [
    'Public marketing launch sign-off (separate from guarded activation) — see runbook marketing launch checklist.',
    'Placeholder CTA and video URL acceptance (runbook §1.4) — human sign-off required.',
    'Formatted admin preview of question set (`/admin/question-sets/preview/...`) — visual check.',
    'Per-pack admin preview (`/admin/results-packs/preview/...`) — visual check.',
    'Evidence table capture (runbook §6) — attach to change ticket.',
    'Confirm admin role can publish if using --publish-revisions (admin-only).',
  ];

  const report: QaReport = {
    timestamp: new Date().toISOString(),
    mode: options.mode,
    environment: options.environment ?? '(not set)',
    baseUrl: options.baseUrl ?? null,
    sourceValidation,
    plannedCmsOperations,
    applyResults,
    apiDiagnostics,
    forcedPreviewChecks,
    publicSafetyChecks,
    sideEffectChecks: buildSideEffectChecks(),
    blockers,
    goNoGo: 'NO-GO',
    manualReviewRemaining,
  };

  report.goNoGo = computeGoNoGo(report);
  return report;
}

export function writeQaReport(
  report: QaReport,
  reportOut?: string,
  reportFilenamePrefix?: string
): string {
  const markdown = renderQaReportMarkdown(report);
  const outPath = reportOut || defaultReportPath(reportFilenamePrefix);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf8');
  return outPath;
}
