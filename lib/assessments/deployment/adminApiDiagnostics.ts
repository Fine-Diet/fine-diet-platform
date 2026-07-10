/**
 * Shared admin API diagnostics for assessment staging QA (Packet X11).
 */

import type { AssessmentDeploymentConfig } from '@/lib/assessments/deployment/types';

export type AdminApiBodyKind = 'json' | 'html' | 'text' | 'empty';
export type AdminApiFailureCause = 'A' | 'B' | 'C' | 'D';

export interface AdminApiEnvVarNames {
  adminCookieEnvVar: string;
  vercelBypassEnvVar: string;
}

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

export interface AdminApiDiagnosticsRequestOptions {
  baseUrl?: string;
  adminSessionCookie?: string;
  vercelProtectionBypass?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export function buildStagingQaRequestHeaders(options?: {
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
  envVarNames?: AdminApiEnvVarNames;
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
  const adminCookieEnvVar = input.envVarNames?.adminCookieEnvVar ?? 'QA_ADMIN_COOKIE';
  const vercelBypassEnvVar =
    input.envVarNames?.vercelBypassEnvVar ?? 'QA_VERCEL_BYPASS';

  const bodyKind = detectAdminApiBodyKind(input.raw, input.contentType);
  const jsonTopLevelKeys =
    input.json && typeof input.json === 'object'
      ? Object.keys(input.json as object)
      : [];
  const bodyPreview =
    bodyKind === 'json' ? null : sanitizeBodyPreview(input.raw);
  const vercelProtectionLikely =
    bodyKind === 'html' && isVercelProtectionHtml(input.raw);
  const appAuthLikely = Boolean(
    bodyKind === 'html'
      ? isAppAuthHtml(input.raw)
      : input.httpStatus === 401 ||
          input.httpStatus === 403 ||
          (input.json &&
            typeof input.json === 'object' &&
            'error' in (input.json as object) &&
            /unauthorized|forbidden|permission|auth/i.test(
              String((input.json as { error?: string }).error ?? '')
            ))
  );

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
      detail: `Likely Vercel Deployment Protection (HTML login shell, not Next.js admin API JSON). Provide ${vercelBypassEnvVar} or use an unprotected preview host.`,
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
      detail: `Likely missing/invalid app admin session (${adminCookieEnvVar}). Request reached the app but was not authorized.`,
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
  expectedShape: 'save-json-success' | 'create-pack-success',
  envVarNames?: AdminApiEnvVarNames
): string {
  const classification = classifyAdminApiResponse({
    httpStatus: response.status,
    contentType: response.contentType,
    raw: response.raw,
    json: response.json,
    expectedShape,
    envVarNames,
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
    envVarNames?: AdminApiEnvVarNames;
  }
): Promise<AdminApiResponseProbe> {
  const root = normalizeBaseUrl(baseUrl);
  const method = init.method ?? 'POST';
  const url = `${root}${endpoint}`;
  const headers = buildStagingQaRequestHeaders({
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
    envVarNames: init.envVarNames,
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
  config: AssessmentDeploymentConfig,
  options: AdminApiDiagnosticsRequestOptions
): Promise<AdminApiResponseProbe[]> {
  if (!options.baseUrl) {
    return [];
  }

  const envVarNames: AdminApiEnvVarNames = {
    adminCookieEnvVar: config.stagingQa.adminCookieEnvVar,
    vercelBypassEnvVar: config.stagingQa.vercelBypassEnvVar,
  };

  const firstLevelId = config.results.levelIds[0];
  if (!firstLevelId) {
    return [];
  }

  return [
    await probeAdminApiEndpoint(options.baseUrl, '/api/admin/question-sets/save-json', {
      method: 'POST',
      body: {
        assessmentVersion: config.questionSet.cmsVersion,
      },
      expectedShape: 'any-json',
      adminSessionCookie: options.adminSessionCookie,
      vercelProtectionBypass: options.vercelProtectionBypass,
      envVarNames,
    }),
    await probeAdminApiEndpoint(options.baseUrl, '/api/admin/results-packs/create', {
      method: 'POST',
      body: {
        assessment_type: config.assessmentType,
        results_version: config.results.resultsVersion,
        level_id: firstLevelId,
      },
      expectedShape: 'create-pack-success',
      adminSessionCookie: options.adminSessionCookie,
      vercelProtectionBypass: options.vercelProtectionBypass,
      envVarNames,
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

export function resolveStagingQaSecrets(
  config: AssessmentDeploymentConfig
): {
  adminSessionCookie?: string;
  vercelProtectionBypass?: string;
  adminCookiePresent: boolean;
  vercelBypassPresent: boolean;
} {
  const adminSessionCookie = process.env[config.stagingQa.adminCookieEnvVar]?.trim();
  const vercelProtectionBypass = process.env[config.stagingQa.vercelBypassEnvVar]?.trim();
  return {
    adminSessionCookie: adminSessionCookie || undefined,
    vercelProtectionBypass: vercelProtectionBypass || undefined,
    adminCookiePresent: Boolean(adminSessionCookie),
    vercelBypassPresent: Boolean(vercelProtectionBypass),
  };
}
