/**
 * resolveAssessmentExperience
 *
 * Single source of truth for resolving everything an assessment route needs
 * from the registry: identity (registry entry), version, cover config, SEO,
 * preview state, and — when requested — the runner question-set config.
 *
 * Two routes consume this resolver:
 *
 *   • /assessments/[slug]        (cover)  — resolveRunnerConfig: false
 *   • /assessments/[slug]/start  (runner) — resolveRunnerConfig: true
 *
 * Cover-only resolution skips CMS question-set work entirely, so landing on
 * the cover page does NOT trigger question-set lookups or session creation.
 * The runner route resolves the full config (CMS-first with file fallback,
 * same logic the old [slug] page used) and lets AssessmentRoot/Runner own
 * session creation on the client.
 */

import type { GetServerSidePropsContext, PreviewData } from 'next';
import type { ParsedUrlQuery } from 'querystring';
import {
  getAssessmentEntry,
  type AssessmentRegistryEntry,
} from './assessmentRegistry';
import { getAssessmentCoverConfig, type AssessmentCoverConfig } from './coverConfig';
import { parseVersionFromQuery } from './questions/parseVersion';
import { resolveQuestionSet } from './questions/resolveQuestionSet';
import { questionSetToAssessmentConfig, getAssessmentConfig } from '@/lib/assessmentConfig';
import type { AssessmentConfig } from '@/lib/assessmentTypes';
import { getSeoForRoute } from '@/lib/seo/getSeo';
import type { SeoMeta } from '@/lib/seo/getSeo';
import { buildAuthUrl } from '@/lib/auth/authContext';

/** Role used for preview gating inside resolveQuestionSet. */
type ResolveUserRole = 'user' | 'editor' | 'admin' | 'staff' | 'coach';

export interface ResolveAssessmentExperienceOptions {
  slug: string;
  query: ParsedUrlQuery;
  /** When true, resolve the runner question-set config (CMS-first + file fallback). */
  resolveRunnerConfig: boolean;
  /** Honor ?preview=1 only for editor/admin roles. */
  preview?: boolean;
  /** Caller-supplied role; defaults to 'user' (public). */
  userRole?: ResolveUserRole;
}

export interface ResolvedAssessmentExperience {
  slug: string;
  entry: AssessmentRegistryEntry;
  initialVersion: number;
  cover: AssessmentCoverConfig;
  seo: SeoMeta;
  /** Path that starts/resumes the assessment runner. */
  startHref: string;
  /** True when ?submission_id is present — cover route renders results inline. */
  hasSubmissionId: boolean;
  /** True when ?preview=1 is present and the caller is authorized. */
  isPreview: boolean;
  // Runner config — only present when resolveRunnerConfig was true and succeeded.
  runnerConfig?: AssessmentConfig;
  resolvedSource?: 'cms' | 'file' | 'cms_empty';
  revisionId?: string;
}

/**
 * Resolve the full assessment experience for a route. Returns `null` when the
 * slug is not a registered, active assessment (caller should 404).
 */
export async function resolveAssessmentExperience(
  options: ResolveAssessmentExperienceOptions
): Promise<ResolvedAssessmentExperience | null> {
  const { slug, query, resolveRunnerConfig, preview, userRole } = options;

  const entry = getAssessmentEntry(slug);
  if (!entry || entry.status !== 'active') {
    return null;
  }

  const initialVersion = parseVersionFromQuery(query.v, entry.defaultVersion);
  const hasSubmissionId = Boolean(query.submission_id);

  // Cover config + login link (source: assessment, redirect back to cover).
  const baseCover = getAssessmentCoverConfig(entry);
  const cover: AssessmentCoverConfig = {
    ...baseCover,
    loginHref: buildAuthUrl({
      intent: 'login',
      source: 'assessment',
      redirectTo: entry.canonicalPath,
      assessmentSlug: entry.slug,
    }),
  };

  // SEO via the shared pipeline; registry title/description are page fallback.
  const seoResult = await getSeoForRoute({
    routePath: `/assessments/${slug}`,
    pageTitle: cover.seoTitle,
    pageDescription: cover.seoDescription,
  });

  const startHref = `${entry.canonicalPath}/start${stringifyExtraParams(query)}`;

  const result: ResolvedAssessmentExperience = {
    slug,
    entry,
    initialVersion,
    cover,
    seo: seoResult.seo,
    startHref,
    hasSubmissionId,
    isPreview: false,
  };

  if (!resolveRunnerConfig) {
    return result;
  }

  // Runner config: CMS-first with file fallback (same path the old [slug] used).
  try {
    const resolved = await resolveQuestionSet({
      assessmentType: entry.assessmentType,
      assessmentVersion: initialVersion,
      locale: null,
      preview: Boolean(preview),
      userRole: userRole ?? 'user',
      pinnedQuestionsRef: null,
    });

    if ((resolved.source === 'cms' || resolved.source === 'file') && resolved.questionSet) {
      result.runnerConfig = questionSetToAssessmentConfig(resolved.questionSet, initialVersion);
      result.resolvedSource = resolved.source;
      result.revisionId =
        resolved.questionSetRef?.publishedRevisionId ||
        resolved.questionSetRef?.previewRevisionId;
      result.isPreview = Boolean(resolved.isPreview);
      return result;
    }

    if (resolved.source === 'cms_empty') {
      if (entry.hasFileFallback) {
        const fileConfig = await resolveFileFallbackConfig(entry, initialVersion);
        result.runnerConfig = fileConfig;
        result.resolvedSource = 'file';
        return result;
      }
      // CMS identity exists but nothing published and no file fallback → no runner.
      return result;
    }

    // Unexpected state — try file fallback if allowed, else leave runner undefined.
    if (entry.hasFileFallback) {
      const fileConfig = await resolveFileFallbackConfig(entry, initialVersion);
      result.runnerConfig = fileConfig;
      result.resolvedSource = 'file';
    }
    return result;
  } catch (error) {
    console.error(
      `[resolveAssessmentExperience] Error resolving question set for "${slug}":`,
      error
    );
    if (entry.hasFileFallback) {
      const fileConfig = await resolveFileFallbackConfig(entry, initialVersion);
      result.runnerConfig = fileConfig;
      result.resolvedSource = 'file';
    }
    return result;
  }
}

/**
 * File-system fallback config (registry-driven). Mirrors the logic that lived
 * in the old [slug] getServerSideProps so runner behavior is preserved.
 */
async function resolveFileFallbackConfig(
  entry: AssessmentRegistryEntry,
  requestedVersion: number
): Promise<AssessmentConfig> {
  const { loadQuestionSet } = await import('./questions/loadQuestionSet');

  const requested = loadQuestionSet({
    assessmentType: entry.assessmentType,
    assessmentVersion: requestedVersion,
    locale: null,
  });
  if (requested) {
    return questionSetToAssessmentConfig(requested, requestedVersion);
  }

  const fallbackVersion = entry.fileFallbackVersion ?? entry.defaultVersion;
  if (requestedVersion !== fallbackVersion) {
    const fallback = loadQuestionSet({
      assessmentType: entry.assessmentType,
      assessmentVersion: fallbackVersion,
      locale: null,
    });
    console.warn(
      `[resolveAssessmentExperience] Version ${requestedVersion} not available for "${entry.slug}", falling back to v${fallbackVersion} file`
    );
    return fallback
      ? questionSetToAssessmentConfig(fallback, fallbackVersion)
      : getAssessmentConfig(entry.assessmentType, fallbackVersion);
  }

  return getAssessmentConfig(entry.assessmentType, fallbackVersion);
}

/**
 * Carry forward `v` (version) and `preview=1` to the start route so the cover
 * CTA preserves editor/admin preview intent. `submission_id` is intentionally
 * excluded so the cover CTA always starts a clean runner flow. The start route
 * resolver still performs role-based preview gating — carrying `preview=1`
 * here does not authorize it; it only forwards the intent.
 */
function stringifyExtraParams(query: ParsedUrlQuery): string {
  const params = new URLSearchParams();

  const v = query.v;
  if (v) {
    const vStr = Array.isArray(v) ? v[0] : v;
    if (vStr) params.set('v', vStr);
  }

  const preview = query.preview;
  if (preview !== undefined) {
    const previewStr = Array.isArray(preview) ? preview[0] : preview;
    if (previewStr === '1') params.set('preview', '1');
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Convenience wrapper for GetServerSideProps callers. Reads role from the SSR
 * auth context (best-effort) so ?preview=1 is honored only for editors/admins,
 * matching the gating in /api/question-sets/resolve.
 */
export async function resolveAssessmentExperienceFromContext(
  context: GetServerSidePropsContext<ParsedUrlQuery, PreviewData>,
  options: Pick<ResolveAssessmentExperienceOptions, 'resolveRunnerConfig'>
): Promise<ResolvedAssessmentExperience | null> {
  const slug = Array.isArray(context.params?.slug)
    ? context.params!.slug[0]
    : context.params?.slug ?? '';

  let userRole: ResolveUserRole = 'user';
  if (options.resolveRunnerConfig) {
    try {
      const { getCurrentUserWithRoleFromSSR } = await import('@/lib/authServer');
      const user = await getCurrentUserWithRoleFromSSR(context);
      if (user) userRole = user.role as ResolveUserRole;
    } catch {
      // Not authenticated — default to 'user'.
    }
  }

  return resolveAssessmentExperience({
    slug,
    query: context.query,
    resolveRunnerConfig: options.resolveRunnerConfig,
    preview: context.query.preview === '1',
    userRole,
  });
}
