/**
 * Baseline Readiness staging/internal QA operator (Packet U)
 *
 * Guarded, repeatable validation + optional staging writes + forced-preview checks.
 * Default mode is dry-run (read-only). No registry activation or public launch.
 */

import * as fs from 'fs';
import * as path from 'path';

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
import { validateQuestionSet } from '@/lib/questionSet/validateQuestionSetShared';
import { validateResultsPack } from '@/lib/resultsPack/validateResultsPack';

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
  /^https?:\/\/(www\.)?finediet\.com/i,
  /^https?:\/\/(www\.)?fine-diet\.com/i,
];

export type QaOperatorMode = 'dry-run' | 'apply';

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

export type AdminApiBodyKind = 'json' | 'html' | 'text' | 'empty';
export type AdminApiFailureCause = 'A' | 'B' | 'C' | 'D';

export interface AdminApiResponseProbe {
  endpoint: string;
  method: string;
  httpStatus: number;
  contentType: string | null;
  bodyKind: AdminApiBodyKind;
  jsonTopLevelKeys: string[];
  bodyPreview: string | null;
  vercelProtectionLikely: boolean;
  appAuthLikely: boolean;
  expectedShape: string;
  shapeMatches: boolean;
  likelyCause: AdminApiFailureCause | 'ok';
  detail: string;
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
  const args = argv.slice(2);
  const hasApply = args.includes('--apply');
  const mode: QaOperatorMode = hasApply ? 'apply' : 'dry-run';

  let environment: string | undefined;
  let baseUrl: string | undefined;
  let reportOut: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--environment=')) {
      environment = arg.slice('--environment='.length).trim();
    } else if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length).trim();
    } else if (arg.startsWith('--report-out=')) {
      reportOut = arg.slice('--report-out='.length).trim();
    }
  }

  return {
    mode,
    environment,
    baseUrl,
    confirmStagingWrite: args.includes('--confirm-staging-write'),
    publishRevisions: args.includes('--publish-revisions'),
    reportOut,
    adminSessionCookie: process.env.BASELINE_READINESS_QA_ADMIN_COOKIE?.trim(),
    vercelProtectionBypass: process.env.BASELINE_READINESS_QA_VERCEL_BYPASS?.trim(),
    skipForcedPreview: args.includes('--skip-forced-preview'),
    skipPublicSafety: args.includes('--skip-public-safety'),
    diagnoseApi: args.includes('--diagnose-api'),
  };
}

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
  options: QaOperatorOptions
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
      'Apply mode requires BASELINE_READINESS_QA_ADMIN_COOKIE env var (admin session cookie — do not commit).'
    );
  }

  if (options.publishRevisions && !options.confirmStagingWrite) {
    blockers.push('--publish-revisions also requires --confirm-staging-write.');
  }

  return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}

export function validateBaselineReadinessSource(): SourceValidationResult {
  const errors: string[] = [];

  const qsValidation = validateQuestionSet(questionSetSource);
  const questionIds = questionSetSource.questions.map((q) => q.id);
  const avatars = questionSetSource.avatars ?? [];

  if (questionSetSource.assessmentType !== BASELINE_READINESS_ASSESSMENT_TYPE) {
    errors.push(
      `Question set assessmentType must be "${BASELINE_READINESS_ASSESSMENT_TYPE}", got "${questionSetSource.assessmentType}".`
    );
  }

  if (questionSetSource.version !== '2') {
    errors.push(`Question set schema version must be "2", got "${questionSetSource.version}".`);
  }

  const missingQuestions = EXPECTED_QUESTION_IDS.filter(
    (id) => !questionIds.includes(id)
  );
  if (missingQuestions.length > 0) {
    errors.push(`Missing expected question IDs: ${missingQuestions.join(', ')}`);
  }

  const extraQuestions = questionIds.filter(
    (id) => !(EXPECTED_QUESTION_IDS as readonly string[]).includes(id)
  );
  if (extraQuestions.length > 0) {
    errors.push(`Unexpected question IDs: ${extraQuestions.join(', ')}`);
  }

  for (const q of questionSetSource.questions) {
    const values = q.options.map((o) => o.value).sort((a, b) => a - b);
    if (values.join(',') !== '0,1,2,3') {
      errors.push(`Question ${q.id} must have option values 0,1,2,3 exactly once.`);
    }
  }

  for (const avatar of EXPECTED_AVATARS) {
    if (!avatars.includes(avatar)) {
      errors.push(`Missing expected avatar "${avatar}".`);
    }
  }

  if (!qsValidation.ok) {
    errors.push(...qsValidation.errors.map((e) => `Question set: ${e}`));
  }

  if (resultsSource.assessmentType !== BASELINE_READINESS_ASSESSMENT_TYPE) {
    errors.push(
      `Results spec assessmentType must be "${BASELINE_READINESS_ASSESSMENT_TYPE}".`
    );
  }

  if (resultsSource.version !== BASELINE_READINESS_RESULTS_CONTENT_VERSION) {
    errors.push(
      `Results spec version must be "${BASELINE_READINESS_RESULTS_CONTENT_VERSION}", got "${resultsSource.version}".`
    );
  }

  const packResults: SourceValidationResult['resultPacks']['packs'] = {};
  for (const levelId of BASELINE_READINESS_RESULT_LEVELS) {
    const pack = resultsSource.packs[levelId];
    if (!pack) {
      errors.push(`Missing result pack for level "${levelId}".`);
      packResults[levelId] = { ok: false, errors: ['missing pack'], warnings: [] };
      continue;
    }

    for (const ch of ['email', 'pdf'] as const) {
      if (pack.channels?.[ch]?.enabled) {
        errors.push(`Pack ${levelId}: channels.${ch}.enabled must be false for internal QA.`);
      }
    }

    const validation = validateResultsPack(pack);
    packResults[levelId] = {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
      label: pack.label,
    };
    if (!validation.ok) {
      errors.push(
        ...validation.errors.map((e) => `Result pack ${levelId}: ${e}`)
      );
    }
  }

  const levelIds = Object.keys(resultsSource.packs).sort();
  const expectedSorted = [...BASELINE_READINESS_RESULT_LEVELS].sort();
  if (levelIds.join(',') !== expectedSorted.join(',')) {
    errors.push(
      `Result pack level IDs must be ${expectedSorted.join(', ')}, got ${levelIds.join(', ')}.`
    );
  }

  const questionSetOk =
    qsValidation.ok &&
    questionSetSource.assessmentType === BASELINE_READINESS_ASSESSMENT_TYPE &&
    missingQuestions.length === 0 &&
    extraQuestions.length === 0;

  const resultPacksOk = Object.values(packResults).every((p) => p.ok);

  return {
    ok: errors.length === 0 && questionSetOk && resultPacksOk,
    questionSet: {
      ok: questionSetOk,
      errors: qsValidation.errors,
      warnings: qsValidation.warnings,
      assessmentType: questionSetSource.assessmentType,
      schemaVersion: questionSetSource.version,
      assessmentVersion: BASELINE_READINESS_QUESTION_SET_VERSION,
      questionIds,
      avatars,
    },
    resultPacks: {
      ok: resultPacksOk,
      resultsVersion: resultsSource.version,
      levelIds,
      packs: packResults,
    },
    errors,
  };
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

function buildRequestHeaders(options?: {
  adminSessionCookie?: string;
  vercelProtectionBypass?: string;
  accept?: string;
  contentType?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: options?.accept ?? 'application/json',
  };
  if (options?.contentType) {
    headers['Content-Type'] = options.contentType;
  }
  if (options?.adminSessionCookie) {
    headers.Cookie = options.adminSessionCookie;
  }
  if (options?.vercelProtectionBypass) {
    headers['x-vercel-protection-bypass'] = options.vercelProtectionBypass;
  }
  return headers;
}

export function sanitizeBodyPreview(raw: string, maxLen = 300): string {
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function detectAdminApiBodyKind(
  raw: string,
  contentType: string | null
): AdminApiBodyKind {
  if (!raw.trim()) return 'empty';
  if (contentType?.includes('application/json')) return 'json';
  if (contentType?.includes('text/html') || /^\s*</.test(raw)) return 'html';
  try {
    JSON.parse(raw);
    return 'json';
  } catch {
    return 'text';
  }
}

function isVercelProtectionHtml(raw: string): boolean {
  return (
    /<title[^>]*>\s*Login\s*[–-]\s*Vercel/i.test(raw) ||
    (/vercel/i.test(raw.slice(0, 800)) &&
      (/>\s*Login\s*</i.test(raw) || /Authentication Required/i.test(raw)))
  );
}

function isAppAuthHtml(raw: string): boolean {
  return /don't have permission|do not have permission|Unauthorized/i.test(raw);
}

export function matchesSaveJsonSuccessShape(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  const body = json as {
    ok?: boolean;
    questionSetId?: string;
    revisionId?: string;
  };
  return Boolean(body.ok && body.questionSetId && body.revisionId);
}

export function matchesCreatePackSuccessShape(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  const body = json as { pack?: { id?: string } };
  return Boolean(body.pack?.id);
}

export function classifyAdminApiResponse(input: {
  httpStatus: number;
  contentType: string | null;
  raw: string;
  json: unknown | null;
  expectedShape: 'save-json-success' | 'create-pack-success' | 'any-json';
}): Pick<
  AdminApiResponseProbe,
  | 'bodyKind'
  | 'jsonTopLevelKeys'
  | 'bodyPreview'
  | 'vercelProtectionLikely'
  | 'appAuthLikely'
  | 'shapeMatches'
  | 'likelyCause'
  | 'detail'
> {
  const bodyKind = detectAdminApiBodyKind(input.raw, input.contentType);
  const jsonTopLevelKeys =
    input.json && typeof input.json === 'object'
      ? Object.keys(input.json as object)
      : [];
  const bodyPreview =
    bodyKind === 'json' ? null : sanitizeBodyPreview(input.raw);
  const vercelProtectionLikely =
    bodyKind === 'html' && isVercelProtectionHtml(input.raw);
  const appAuthLikely =
    bodyKind === 'html'
      ? isAppAuthHtml(input.raw)
      : input.httpStatus === 401 ||
        input.httpStatus === 403 ||
        (input.json &&
          typeof input.json === 'object' &&
          'error' in (input.json as object) &&
          /unauthorized|forbidden|permission|auth/i.test(
            String((input.json as { error?: string }).error ?? '')
          ));

  let shapeMatches = false;
  if (input.expectedShape === 'save-json-success') {
    shapeMatches = matchesSaveJsonSuccessShape(input.json);
  } else if (input.expectedShape === 'create-pack-success') {
    shapeMatches = matchesCreatePackSuccessShape(input.json);
  } else if (input.json) {
    shapeMatches = true;
  }

  if (shapeMatches) {
    return {
      bodyKind,
      jsonTopLevelKeys,
      bodyPreview,
      vercelProtectionLikely,
      appAuthLikely,
      shapeMatches: true,
      likelyCause: 'ok',
      detail: 'Response parsed as expected admin API JSON.',
    };
  }

  if (vercelProtectionLikely) {
    return {
      bodyKind,
      jsonTopLevelKeys,
      bodyPreview,
      vercelProtectionLikely: true,
      appAuthLikely,
      shapeMatches: false,
      likelyCause: 'B',
      detail:
        'Likely Vercel Deployment Protection (HTML login shell, not Next.js admin API JSON). Provide BASELINE_READINESS_QA_VERCEL_BYPASS or use an unprotected preview host.',
    };
  }

  if (appAuthLikely) {
    return {
      bodyKind,
      jsonTopLevelKeys,
      bodyPreview,
      vercelProtectionLikely,
      appAuthLikely: true,
      shapeMatches: false,
      likelyCause: 'A',
      detail:
        'Likely missing/invalid app admin session (BASELINE_READINESS_QA_ADMIN_COOKIE). Request reached the app but was not authorized.',
    };
  }

  if (bodyKind !== 'json') {
    return {
      bodyKind,
      jsonTopLevelKeys,
      bodyPreview,
      vercelProtectionLikely,
      appAuthLikely,
      shapeMatches: false,
      likelyCause: 'B',
      detail: `Non-JSON response (${bodyKind}) with HTTP ${input.httpStatus}; expected admin API JSON.`,
    };
  }

  const jsonBody = input.json as {
    ok?: boolean;
    kind?: string;
    errors?: string[];
    error?: string;
  } | null;

  if (jsonBody?.ok === false && jsonBody.kind === 'validation') {
    if (input.expectedShape === 'any-json') {
      return {
        bodyKind,
        jsonTopLevelKeys,
        bodyPreview: null,
        vercelProtectionLikely,
        appAuthLikely,
        shapeMatches: true,
        likelyCause: 'ok',
        detail:
          'Admin API reachable (validation probe returned expected JSON; no CMS write performed).',
      };
    }
    return {
      bodyKind,
      jsonTopLevelKeys,
      bodyPreview: null,
      vercelProtectionLikely,
      appAuthLikely,
      shapeMatches: false,
      likelyCause: 'D',
      detail: `Admin API validation failure: ${jsonBody.errors?.join('; ') || 'validation error'}`,
    };
  }

  if (jsonBody?.error) {
    return {
      bodyKind,
      jsonTopLevelKeys,
      bodyPreview: null,
      vercelProtectionLikely,
      appAuthLikely,
      shapeMatches: false,
      likelyCause: 'D',
      detail: `Admin API error: ${jsonBody.error}`,
    };
  }

  return {
    bodyKind,
    jsonTopLevelKeys,
    bodyPreview: null,
    vercelProtectionLikely,
    appAuthLikely,
    shapeMatches: false,
    likelyCause: 'C',
    detail: `JSON parsed but unexpected shape (keys: ${jsonTopLevelKeys.join(', ') || 'none'}).`,
  };
}

export function formatAdminApiFailure(
  response: {
    status: number;
    json: unknown | null;
    raw: string;
    contentType: string | null;
  },
  expectedShape: 'save-json-success' | 'create-pack-success'
): string {
  const classification = classifyAdminApiResponse({
    httpStatus: response.status,
    contentType: response.contentType,
    raw: response.raw,
    json: response.json,
    expectedShape,
  });

  const parts = [
    `HTTP ${response.status}`,
    `content-type=${response.contentType ?? 'unknown'}`,
    `body=${classification.bodyKind}`,
    `cause=${classification.likelyCause}`,
    classification.detail,
  ];

  if (classification.bodyPreview) {
    parts.push(`preview="${classification.bodyPreview}"`);
  } else if (classification.jsonTopLevelKeys.length > 0) {
    parts.push(`jsonKeys=[${classification.jsonTopLevelKeys.join(', ')}]`);
  }

  return parts.join(' | ');
}

export async function probeAdminApiEndpoint(
  baseUrl: string,
  endpoint: string,
  init: {
    method?: string;
    body?: unknown;
    expectedShape: 'save-json-success' | 'create-pack-success' | 'any-json';
    adminSessionCookie?: string;
    vercelProtectionBypass?: string;
  }
): Promise<AdminApiResponseProbe> {
  const root = normalizeBaseUrl(baseUrl);
  const method = init.method ?? 'POST';
  const url = `${root}${endpoint}`;
  const headers = buildRequestHeaders({
    adminSessionCookie: init.adminSessionCookie,
    vercelProtectionBypass: init.vercelProtectionBypass,
    accept: 'application/json',
    contentType: init.body === undefined ? undefined : 'application/json',
  });

  const response = await fetch(url, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    redirect: 'follow',
  });
  const contentType = response.headers.get('content-type');
  const raw = await response.text();
  let json: unknown | null = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }

  const expectedShapeLabel =
    init.expectedShape === 'save-json-success'
      ? '{ ok:true, questionSetId, revisionId }'
      : init.expectedShape === 'create-pack-success'
        ? '{ pack:{ id } }'
        : 'JSON object';

  const classification = classifyAdminApiResponse({
    httpStatus: response.status,
    contentType,
    raw,
    json,
    expectedShape: init.expectedShape,
  });

  return {
    endpoint,
    method,
    httpStatus: response.status,
    contentType,
    expectedShape: expectedShapeLabel,
    ...classification,
  };
}

export async function runAdminApiDiagnostics(
  options: Pick<
    QaOperatorOptions,
    'baseUrl' | 'adminSessionCookie' | 'vercelProtectionBypass'
  >
): Promise<AdminApiResponseProbe[]> {
  if (!options.baseUrl) {
    return [];
  }

  return [
    await probeAdminApiEndpoint(options.baseUrl, '/api/admin/question-sets/save-json', {
      method: 'POST',
      body: {
        assessmentVersion: BASELINE_READINESS_QUESTION_SET_VERSION,
      },
      expectedShape: 'any-json',
      adminSessionCookie: options.adminSessionCookie,
      vercelProtectionBypass: options.vercelProtectionBypass,
    }),
    await probeAdminApiEndpoint(options.baseUrl, '/api/admin/results-packs/create', {
      method: 'POST',
      body: {
        assessment_type: BASELINE_READINESS_ASSESSMENT_TYPE,
        results_version: BASELINE_READINESS_RESULTS_CONTENT_VERSION,
        level_id: BASELINE_READINESS_RESULT_LEVELS[0],
      },
      expectedShape: 'create-pack-success',
      adminSessionCookie: options.adminSessionCookie,
      vercelProtectionBypass: options.vercelProtectionBypass,
    }),
  ];
}

export function renderAdminApiDiagnosticsMarkdown(
  probes: AdminApiResponseProbe[]
): string {
  if (probes.length === 0) {
    return 'No API diagnostics run (--base-url required).';
  }

  const lines: string[] = ['## Admin API diagnostics', ''];
  for (const probe of probes) {
    lines.push(`### ${probe.method} ${probe.endpoint}`);
    lines.push(`- HTTP status: ${probe.httpStatus}`);
    lines.push(`- Content-Type: \`${probe.contentType ?? 'unknown'}\``);
    lines.push(`- Body kind: **${probe.bodyKind}**`);
    lines.push(`- Expected shape: \`${probe.expectedShape}\``);
    lines.push(`- Shape matches: ${probe.shapeMatches ? 'yes' : 'no'}`);
    lines.push(`- Vercel protection likely: ${probe.vercelProtectionLikely ? 'yes' : 'no'}`);
    lines.push(`- App auth issue likely: ${probe.appAuthLikely ? 'yes' : 'no'}`);
    lines.push(`- Likely cause: **${probe.likelyCause}**`);
    lines.push(`- Detail: ${probe.detail}`);
    if (probe.jsonTopLevelKeys.length > 0) {
      lines.push(`- JSON top-level keys: ${probe.jsonTopLevelKeys.join(', ')}`);
    }
    if (probe.bodyPreview) {
      lines.push(`- Body preview: \`${probe.bodyPreview}\``);
    }
    lines.push('');
  }

  lines.push(
    'Cause key: **A** app auth/session, **B** Vercel protection or non-JSON shell, **C** unexpected JSON shape, **D** real admin API error.'
  );
  return lines.join('\n');
}

async function fetchText(
  url: string,
  options?: { adminSessionCookie?: string; vercelProtectionBypass?: string }
): Promise<{ status: number; body: string }> {
  const headers = buildRequestHeaders({
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
  const headers = buildRequestHeaders({
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
  const resolveUrl = `${root}/api/results-packs/resolve?assessmentType=${encodeURIComponent(BASELINE_READINESS_ASSESSMENT_TYPE)}&resultsVersion=${encodeURIComponent(BASELINE_READINESS_RESULTS_CONTENT_VERSION)}&levelId=${encodeURIComponent(forceOutcome)}`;

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
          'Resolve API did not return a pack — packs may not be published/staged yet.'
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
        'No admin cookie — preview route auth check may be blocked; resolve API checked published packs only.'
      );
    }
    notes.push(...previewNotes, ...resolveNotes);
  } catch (err) {
    check.status = 'fail';
    notes.push(err instanceof Error ? err.message : String(err));
  }

  return check;
}

export async function runPublicSafetyChecks(
  baseUrl: string
): Promise<PublicSafetyCheck[]> {
  const root = normalizeBaseUrl(baseUrl);
  const checks: PublicSafetyCheck[] = [];

  const entry = getAssessmentEntry(BASELINE_READINESS_ASSESSMENT_TYPE);
  checks.push({
    name: 'Registry status remains draft (in-repo)',
    status: entry?.status === 'draft' ? 'pass' : 'fail',
    detail: entry
      ? `Registry status is "${entry.status}" (must stay draft during staging QA).`
      : 'baseline-readiness registry entry missing.',
  });

  checks.push({
    name: 'Slug not publicly supported (in-repo)',
    status: !isSupportedAssessmentSlug(BASELINE_READINESS_ASSESSMENT_TYPE)
      ? 'pass'
      : 'fail',
    detail: isSupportedAssessmentSlug(BASELINE_READINESS_ASSESSMENT_TYPE)
      ? 'baseline-readiness is publicly active in registry — operator refuses launch.'
      : 'Public slug remains inactive (expected).',
  });

  try {
    const publicRoute = await fetchText(`${root}/assessments/baseline-readiness`);
    const blocked =
      publicRoute.status === 404 ||
      /not found|404/i.test(publicRoute.body.slice(0, 500));
    checks.push({
      name: 'Public route /assessments/baseline-readiness blocked',
      status: blocked ? 'pass' : 'fail',
      detail: blocked
        ? `Public route returned ${publicRoute.status} (expected blocked).`
        : `Public route responded ${publicRoute.status} — investigate before GO.`,
    });
  } catch (err) {
    checks.push({
      name: 'Public route /assessments/baseline-readiness blocked',
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
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
              formatAdminApiFailure(response, 'save-json-success'),
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
            formatAdminApiFailure(response, 'save-json-success'),
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
            detail: formatAdminApiFailure(response, 'create-pack-success'),
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
            detail: response.json?.error || formatAdminApiFailure(response, 'create-pack-success'),
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
            response.json?.error || formatAdminApiFailure(response, 'create-pack-success'),
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
            response.json?.error || formatAdminApiFailure(response, 'create-pack-success'),
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
      name: 'No registry activation',
      status: 'pass',
      detail: 'Operator never modifies assessment registry status.',
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
    '- This operator does **not** activate Baseline Readiness publicly or change registry status.',
    '- Gut Check behavior is untouched.',
    '- Forced-preview visual QA (screenshots, CTA/video placeholder acceptance) still requires human review per the runbook §1.4 and §5.'
  );

  return lines.join('\n');
}

export function defaultReportPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '.reports', 'assessments', `baseline-readiness-qa-${stamp}.md`);
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
    apiDiagnostics = await runAdminApiDiagnostics({
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
    apiDiagnostics = await runAdminApiDiagnostics({
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
      ? await runPublicSafetyChecks(options.baseUrl)
      : [
          {
            name: 'In-repo registry draft check',
            status: getAssessmentEntry(BASELINE_READINESS_ASSESSMENT_TYPE)?.status === 'draft'
              ? 'pass'
              : 'fail',
            detail: 'Local registry check only — provide --base-url for public route check.',
          },
        ];
  }

  const manualReviewRemaining = [
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

export function writeQaReport(report: QaReport, reportOut?: string): string {
  const markdown = renderQaReportMarkdown(report);
  const outPath = reportOut || defaultReportPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf8');
  return outPath;
}
