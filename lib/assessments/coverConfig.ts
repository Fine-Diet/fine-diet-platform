/**
 * Assessment Cover Config
 *
 * Reusable, assessment-agnostic configuration for the cover/landing hero
 * rendered at /assessments/[slug]. The shape is deliberately generic — it
 * carries no Gut Check-specific copy or scoring semantics — so future
 * assessment types can supply their own cover by adding a record to
 * `ASSESSMENT_COVER_CONFIGS` (or, later, by reading from the CMS).
 *
 * Packet A/B scope: code-backed defaults are acceptable while CMS storage
 * for cover content is not yet ready. Gut Check is the first registered
 * cover, keyed by registry slug.
 */

import type { AssessmentRegistryEntry } from './assessmentRegistry';

/**
 * Reusable cover/landing hero configuration.
 */
export interface AssessmentCoverConfig {
  /** Identifies the cover template used to render this config. */
  templateKey: string;
  /** Wordmark / brand text rendered in the hero corner. */
  logoText: string;
  /** Primary headline. */
  headline: string;
  /** Supporting subheadline beneath the headline. */
  subheadline: string;
  /** Label for the primary CTA that starts/resumes the assessment. */
  ctaLabel: string;
  /** Prompt copy above the login link (e.g. "Already have an account?"). */
  loginPrompt: string;
  /** Label for the login link. */
  loginLabel: string;
  /**
   * href for the login link. Built by the resolver via buildAuthUrl so it
   * carries the assessment source context and a safe redirect back to the
   * cover route.
   */
  loginHref: string;
  /** Optional desktop hero background image URL. */
  heroImageUrl?: string;
  /** Optional mobile-specific hero background image URL. */
  mobileHeroImageUrl?: string;
  /** Alt text for the hero background image. */
  imageAlt?: string;
  /** Overlay opacity (0–1) applied over the hero background for legibility. */
  overlayOpacity: number;
  /** Desktop background focal point as percentages (0–100). */
  desktopFocalPoint?: { x: number; y: number };
  /** Mobile background focal point as percentages (0–100). */
  mobileFocalPoint?: { x: number; y: number };
  /** SEO title fallback for the cover route. */
  seoTitle: string;
  /** SEO description fallback for the cover route. */
  seoDescription: string;
}

/**
 * Code-backed cover defaults, keyed by registry slug.
 *
 * Gut Check and Baseline Readiness ship with code-backed covers today. Add a
 * record here for each new assessment that should ship with a code-backed cover; future
 * packets can swap this map for CMS-driven cover content without changing
 * the resolver or hero component.
 */
const BASELINE_READINESS_COVER: AssessmentCoverConfig = {
  templateKey: 'assessment-cover-hero-v1',
  logoText: 'Fine Diet',
  headline: 'Check your Baseline Readiness',
  subheadline:
    'Answer a few quick questions about your meal rhythm, planning habits, and follow-through so Fine Diet can show the best next step for you.',
  ctaLabel: 'Start the readiness check',
  loginPrompt: 'Already have an account?',
  loginLabel: 'Log in',
  loginHref: '/login?ctx=assessment',
  heroImageUrl: undefined,
  mobileHeroImageUrl: undefined,
  imageAlt: 'Fine Diet Baseline Readiness assessment cover',
  overlayOpacity: 0.55,
  desktopFocalPoint: { x: 50, y: 40 },
  mobileFocalPoint: { x: 50, y: 30 },
  seoTitle: 'Baseline Readiness Assessment | Fine Diet',
  seoDescription:
    'Check how ready your current meal rhythm is for the Fine Diet Method and get a practical next step based on your habits.',
};

const GUT_CHECK_COVER: AssessmentCoverConfig = {
  templateKey: 'assessment-cover-hero-v1',
  logoText: 'Fine Diet',
  headline: 'Find your gut’s starting point.',
  subheadline:
    'A quick, free assessment that reads your signals and points you toward your first focus — no scan, no guesswork.',
  ctaLabel: 'Start the Gut Check',
  loginPrompt: 'Already have an account?',
  loginLabel: 'Log in',
  loginHref: '/login?ctx=assessment',
  heroImageUrl: undefined,
  mobileHeroImageUrl: undefined,
  imageAlt: 'Fine Diet Gut Check assessment cover',
  overlayOpacity: 0.55,
  desktopFocalPoint: { x: 50, y: 40 },
  mobileFocalPoint: { x: 50, y: 30 },
  seoTitle: 'Gut Check Assessment — Fine Diet',
  seoDescription:
    'Take our quick gut health assessment to discover your personalized insights and learn about The Fine Diet Method.',
};

/** Map of registry slug → code-backed cover config. */
const ASSESSMENT_COVER_CONFIGS: Record<string, AssessmentCoverConfig> = {
  'baseline-readiness': BASELINE_READINESS_COVER,
  'gut-check': GUT_CHECK_COVER,
};

/**
 * Resolve the cover config for a registered assessment.
 *
 * Falls back to a generic, assessment-agnostic cover when no code-backed
 * record exists for the slug — so new registry entries render a sensible
 * default cover until a dedicated one is added.
 */
export function getAssessmentCoverConfig(
  entry: AssessmentRegistryEntry
): AssessmentCoverConfig {
  const configured = ASSESSMENT_COVER_CONFIGS[entry.slug];
  if (configured) return configured;

  return {
    templateKey: 'assessment-cover-hero-v1',
    logoText: 'Fine Diet',
    headline: entry.title,
    subheadline: entry.description,
    ctaLabel: `Start ${entry.shortTitle}`,
    loginPrompt: 'Already have an account?',
    loginLabel: 'Log in',
    loginHref: '/login?ctx=assessment',
    imageAlt: `${entry.shortTitle} assessment cover`,
    overlayOpacity: 0.55,
    desktopFocalPoint: { x: 50, y: 40 },
    mobileFocalPoint: { x: 50, y: 30 },
    seoTitle: entry.title,
    seoDescription: entry.description,
  };
}
