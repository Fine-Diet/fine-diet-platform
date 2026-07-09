/**
 * Assessment Registry / Catalog
 *
 * Central source of truth for which assessments exist, how they are addressed
 * by slug, and the metadata used to render their canonical routes.
 *
 * Gut Check is registered here as ONE assessment instance — not a hardcoded
 * global product/route. The canonical route /assessments/[slug] and the
 * generic assessment runner resolve everything they need from this registry,
 * so new assessments that share the same flow can be added as a record here
 * (plus a published CMS question set) without touching route or runner code.
 *
 * Adding a new assessment:
 *   1. Add a record below with a unique `slug` and `assessmentType`.
 *   2. Publish a question set in the CMS for that `assessmentType`.
 *   3. Set `status: 'active'` to expose the direct-link route at /assessments/<slug>.
 *   4. Set `catalogVisible: true` only when marketing approves listing on /assessments
 *      and other public catalog surfaces (`listCatalogAssessments`).
 *
 * Only Gut Check carries a file-system question fallback (`hasFileFallback`);
 * every other assessment is CMS-only and 404s without a published revision.
 */

import type { AssessmentType } from '@/lib/assessmentTypes';

/** Lifecycle state of a registered assessment. */
export type AssessmentLifecycleStatus = 'active' | 'draft' | 'retired';

/** Identity-level role, mirrors question_sets.role. */
export type AssessmentRole = 'entry' | 'care-pathway' | 'resource-tool';

export interface AssessmentRegistryEntry {
  /** Canonical URL slug under /assessments/<slug>. Unique. */
  slug: string;
  /** DB / runtime assessment_type key. Usually equals slug. */
  assessmentType: AssessmentType;
  /** Full title used in <title> / page headers. */
  title: string;
  /** Short label used in lists, cards, and account history. */
  shortTitle: string;
  /** Marketing/SEO description for the canonical route. */
  description: string;
  /** Default question-set version when no ?v= override is provided. */
  defaultVersion: number;
  /** Identity-level role, if known. */
  role?: AssessmentRole;
  /** Lifecycle status. Only `active` resolves on the public route. */
  status: AssessmentLifecycleStatus;
  /**
   * When true, the assessment appears on public catalog surfaces (e.g.
   * `/assessments` via `listCatalogAssessments`). Independent of `status`:
   * guarded activation can keep `status: 'active'` for direct-link runtime while
   * `catalogVisible: false` hides unapproved marketing listing.
   */
  catalogVisible: boolean;
  /** Canonical path for this assessment. */
  canonicalPath: string;
  /**
   * When true, the route preserves the indefinite file-system question
   * fallback (legacy Gut Check behavior). All other assessments are CMS-only.
   */
  hasFileFallback: boolean;
  /** Version to fall back to when the requested version has no file. */
  fileFallbackVersion?: number;
}

/**
 * The catalog. Gut Check is the first registered record.
 */
export const ASSESSMENT_REGISTRY: readonly AssessmentRegistryEntry[] = Object.freeze([
  {
    slug: 'gut-check',
    assessmentType: 'gut-check',
    title: 'Gut Check Assessment',
    shortTitle: 'Gut Check',
    description:
      'Take our quick gut health assessment to discover your personalized insights and learn about The Fine Diet Method.',
    defaultVersion: 3,
    role: 'entry',
    status: 'active',
    catalogVisible: true,
    canonicalPath: '/assessments/gut-check',
    hasFileFallback: true,
    fileFallbackVersion: 2,
  },
  {
    slug: 'baseline-readiness',
    assessmentType: 'baseline-readiness',
    title: 'Baseline Readiness',
    shortTitle: 'Baseline Readiness',
    description:
      'See how ready your current meal rhythm is for the Fine Diet Method — and what to strengthen before you start.',
    defaultVersion: 1,
    role: 'entry',
    status: 'active',
    catalogVisible: false,
    canonicalPath: '/assessments/baseline-readiness',
    hasFileFallback: false,
  },
]);

/**
 * Validate a registry for unique slug + assessmentType. Duplicate keys would
 * otherwise be silently masked by `find`, so this surfaces them loudly. Throws
 * in non-production environments; in production it logs and returns the
 * duplicates so a broken deploy never takes down request serving.
 *
 * Exported for tests; called once at module load below (skipped under jest so
 * the side effect does not leak across test files sharing a worker).
 */
export function validateRegistry(
  registry: readonly AssessmentRegistryEntry[]
): { slug: string; assessmentType: string }[] {
  const seenSlug = new Set<string>();
  const seenType = new Set<string>();
  const dupes: { slug: string; assessmentType: string }[] = [];
  for (const entry of registry) {
    if (seenSlug.has(entry.slug)) {
      dupes.push({ slug: entry.slug, assessmentType: entry.assessmentType });
    } else {
      seenSlug.add(entry.slug);
    }
    if (seenType.has(entry.assessmentType)) {
      dupes.push({ slug: entry.slug, assessmentType: entry.assessmentType });
    } else {
      seenType.add(entry.assessmentType);
    }
  }
  if (dupes.length > 0) {
    const msg = `[assessmentRegistry] Duplicate slug/assessmentType detected: ${JSON.stringify(dupes)}`;
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(msg);
    }
    console.error(msg);
  }
  return dupes;
}

// Module-load invariant: surface duplicate slugs/types immediately in dev.
// Skipped under jest to avoid cross-test-file module side effects; tests call
// validateRegistry() explicitly.
if (!process.env.JEST_WORKER_ID) {
  validateRegistry(ASSESSMENT_REGISTRY);
}

/**
 * Look up a registry record by slug. Returns undefined if not registered,
 * regardless of status.
 */
export function getAssessmentEntry(
  slug: string | null | undefined
): AssessmentRegistryEntry | undefined {
  if (!slug) return undefined;
  return ASSESSMENT_REGISTRY.find((entry) => entry.slug === slug);
}

/**
 * Look up a registry record by assessment_type. Returns undefined if none.
 */
export function getAssessmentEntryByType(
  assessmentType: string | null | undefined
): AssessmentRegistryEntry | undefined {
  if (!assessmentType) return undefined;
  return ASSESSMENT_REGISTRY.find((entry) => entry.assessmentType === assessmentType);
}

/**
 * True when the slug resolves to an `active` registered assessment, i.e. it
 * should be served by the canonical /assessments/<slug> route.
 */
export function isSupportedAssessmentSlug(slug: string | null | undefined): boolean {
  const entry = getAssessmentEntry(slug);
  return !!entry && entry.status === 'active';
}

/** All `active` assessments, in registry order. Used for runtime/direct-link checks. */
export function listActiveAssessments(): AssessmentRegistryEntry[] {
  return ASSESSMENT_REGISTRY.filter((entry) => entry.status === 'active');
}

/**
 * Active assessments approved for public catalog listing (`/assessments`, etc.).
 * Requires both `status: 'active'` and `catalogVisible: true`.
 */
export function listCatalogAssessments(): AssessmentRegistryEntry[] {
  return ASSESSMENT_REGISTRY.filter(
    (entry) => entry.status === 'active' && entry.catalogVisible
  );
}

/**
 * True when an active assessment is approved for public catalog surfaces.
 */
export function isCatalogVisibleAssessment(
  slug: string | null | undefined
): boolean {
  const entry = getAssessmentEntry(slug);
  return !!entry && entry.status === 'active' && entry.catalogVisible;
}

/**
 * Human-readable label for an assessment_type, resolved from the registry.
 * Falls back to the raw type when the type is not registered.
 */
export function getAssessmentLabel(assessmentType: string): string {
  return getAssessmentEntryByType(assessmentType)?.shortTitle ?? assessmentType;
}
