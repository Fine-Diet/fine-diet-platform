/**
 * Assessment Operations Contract Registry
 *
 * Pure, code-owned source of truth for the operations contract of every
 * assessment: how questions/options connect to scoring, what result levels
 * exist, which output artifacts are produced (screen / email / PDF / webhook /
 * claim / share), what the preview strategy is, and what publish-readiness
 * requires.
 *
 * This module is INTENTIONALLY metadata-only. It does not:
 *   - execute scoring,
 *   - load CMS content,
 *   - send email / webhooks,
 *   - mutate any submission.
 *
 * It exists so admins can SEE the contract for an assessment at a glance and so
 * future assessments (Packet J) can declare their own contract by adding a
 * record below — without reusing Gut Check's scoring semantics and without
 * building a generalized scoring-rule editor.
 *
 * Add a new assessment's contract:
 *   1. Add an `OperationsContract` record to `OPERATIONS_CONTRACTS` keyed by
 *      `assessmentType`.
 *   2. Declare its scoring adapter id, option value model, result levels, and
 *      output artifact statuses (honest: Implemented / Not Implemented /
 *      External / Manual Review).
 *   3. List its publish-readiness requirements.
 *
 * The registry entry in `assessmentRegistry.ts` continues to own identity
 * (slug, version, status, canonical path). This module owns the operations
 * contract layered on top of that identity.
 */

import type { AssessmentType } from '@/lib/assessmentTypes';
import {
  getAssessmentEntryByType,
  type AssessmentRegistryEntry,
} from '@/lib/assessments/assessmentRegistry';
import { GUT_CHECK_RESULTS_CONTENT_VERSION } from '@/lib/assessments/results/constants';

// ---------------------------------------------------------------------------
// Value model
// ---------------------------------------------------------------------------

/** Coarse classification of how an assessment maps answers to a result level. */
export type ScoringStyle =
  | 'axis-band-decision-tree'
  | 'weighted-avatar-normalization'
  | 'custom';

/**
 * Stable adapter id. Versioned so a future scoring change can declare a new
 * adapter without reusing an old id. Gut Check's live engine is the v3 axis
 * engine; v1 and v2 are documented as legacy for visibility only.
 */
export type ScoringAdapterId =
  | 'gut-check-axis-v3'
  | 'gut-check-axis-v2'
  | 'gut-check-weighted-v1';

/** Implementation state of a single output artifact. Honest, never inflated. */
export type ArtifactStatus =
  | 'implemented'
  | 'external' // owned outside this repo (e.g. n8n)
  | 'not-implemented'
  | 'manual-review';

/** Honest status for a single publish-readiness check. */
export type ReadinessStatus =
  | 'verified'
  | 'manual-review'
  | 'missing'
  | 'not-implemented';

/** The set of answer option values an assessment's scoring contract expects. */
export interface OptionValueModel {
  /** Min option value (inclusive). */
  min: number;
  /** Max option value (inclusive). */
  max: number;
  /** Required number of options per question, if fixed. */
  optionsPerQuestion?: number;
  /** Human-readable description of what the values mean (e.g. "0 = never, 3 = almost always"). */
  semantics: string;
}

/** One result level an assessment can produce. */
export interface ResultLevelDescriptor {
  /** Stable level id stored as `primary_avatar` on the submission row. */
  id: string;
  /** Display label from the results pack. */
  label: string;
  /** One-line description of the level / who lands here. */
  summary: string;
  /** Where the result copy for this level lives. */
  copySource: 'cms-results-pack' | 'file-results-pack' | 'hardcoded';
  /** Public runtime URL for this assessment (cover/runner/results share one route). */
  runtimePreviewHref: string;
  /** Admin preview href for the results pack for this level, when known. */
  resultsPackPreviewHref?: string;
}

/** One downstream output artifact an assessment produces. */
export interface OutputArtifactDescriptor {
  /** Stable artifact key (screen, email, pdf, webhook, claim, share, download, account-save). */
  key: string;
  /** Display label. */
  label: string;
  /** Honest implementation status. */
  status: ArtifactStatus;
  /** Where it is implemented (file path or external system), or null if missing. */
  implementedAt?: string;
  /** Notes / caveats an admin should see. */
  notes?: string;
}

/** How an assessment can be previewed before publishing. */
export interface PreviewStrategy {
  /** Supports `?preview=1` runtime preview against a CMS draft revision. */
  runtimePreviewFlag: boolean;
  /** Supports `?v=` version override on the public route. */
  versionOverride: boolean;
  /** Admin preview available for question sets. */
  questionSetPreview: boolean;
  /** Admin preview available for results packs. */
  resultsPackPreview: boolean;
  /** Forced-result preview (render a specific level without taking the assessment). */
  forcedResultPreview: boolean;
  /** Notes on preview limitations. */
  notes?: string;
}

/** A single publish-readiness requirement for an assessment. */
export interface ReadinessRequirement {
  /** Stable check key. */
  key: string;
  /** Display label. */
  label: string;
  /**
   * Whether this check is automated by code in this packet. `true` means the
   * readiness evaluator can compute it from a `ReadinessInput`. `false` means
   * it is info-only and always reports `manual-review` until a human confirms.
   */
  automated: boolean;
  /** Short description of what "verified" means for this check. */
  description: string;
}

/** Runtime input snapshot used to evaluate readiness for one assessment version. */
export interface ReadinessInput {
  /** assessmentType being evaluated. */
  assessmentType: AssessmentType;
  /** Question set present for this version/locale? */
  questionSetPresent: boolean;
  /** Did the question set pass schema validation? */
  questionSetValidates?: boolean;
  /** Number of result levels with a published results pack (0..4 for Gut Check). */
  resultsLevelsWithCopy: number;
  /** Number of result levels expected. */
  resultsLevelsExpected: number;
  /** Runtime preview flag supported (from contract). */
  runtimePreviewAvailable: boolean;
  /** N8N_WEBHOOK_URL configured server-side? */
  emailWebhookConfigured: boolean;
  /** PDF generation route present? */
  pdfRoutePresent: boolean;
  /** Scoring adapter declared in the contract? */
  scoringAdapterDeclared: boolean;
  /** Whether the published pointer exposes draft content on the public route. */
  draftContentExposed: boolean;
}

/** Result of evaluating one readiness requirement. */
export interface ReadinessCheckResult {
  key: string;
  label: string;
  status: ReadinessStatus;
  /** Human-readable explanation of why this status was assigned. */
  detail: string;
  /** Whether this check was computed by code or flagged for human review. */
  automated: boolean;
}

/** The full operations contract for one assessment. */
export interface OperationsContract {
  /** Assessment type (matches registry + DB `assessment_type`). */
  assessmentType: AssessmentType;
  /** Display title. */
  title: string;
  /** Scoring style classification. */
  scoringStyle: ScoringStyle;
  /** Live scoring adapter id. */
  scoringAdapterId: ScoringAdapterId;
  /** Legacy / historical scoring adapters, for visibility only. */
  legacyScoringAdapters: ScoringAdapterId[];
  /** Human-readable description of the scoring logic. */
  scoringDescription: string;
  /** File where the live scoring engine lives. */
  scoringEnginePath: string;
  /** Expected answer option value model. */
  optionValueModel: OptionValueModel;
  /** Result levels this assessment can produce, in canonical order. */
  resultLevels: ResultLevelDescriptor[];
  /** Results content version (decoupled from question set version). */
  resultsContentVersion: string;
  /** Where results content is sourced from. */
  resultsPackSource: 'cms-results-pack' | 'file-results-pack' | 'both';
  /** Downstream output artifacts. */
  outputs: OutputArtifactDescriptor[];
  /** Preview strategy. */
  preview: PreviewStrategy;
  /** Publish-readiness requirements. */
  readinessRequirements: ReadinessRequirement[];
}

// ---------------------------------------------------------------------------
// Gut Check contract
// ---------------------------------------------------------------------------

const GUT_CHECK_RESULT_LEVELS: ResultLevelDescriptor[] = [
  {
    id: 'level1',
    label: 'Level 1',
    summary: 'Digestion working under load — context-sensitive fluctuation.',
    copySource: 'cms-results-pack',
    runtimePreviewHref: '/assessments/gut-check?preview=1',
    resultsPackPreviewHref: '/admin/results-packs',
  },
  {
    id: 'level2',
    label: 'Sensitive',
    summary: 'Lower buffer; symptoms show up more readily across contexts.',
    copySource: 'cms-results-pack',
    runtimePreviewHref: '/assessments/gut-check?preview=1',
    resultsPackPreviewHref: '/admin/results-packs',
  },
  {
    id: 'level3',
    label: 'Reactive',
    summary: 'Higher responsiveness strain; recovery and protection need attention.',
    copySource: 'cms-results-pack',
    runtimePreviewHref: '/assessments/gut-check?preview=1',
    resultsPackPreviewHref: '/admin/results-packs',
  },
  {
    id: 'level4',
    label: 'Highly Reactive',
    summary: 'Protection-dominant pattern; the system is signalling hard limits.',
    copySource: 'cms-results-pack',
    runtimePreviewHref: '/assessments/gut-check?preview=1',
    resultsPackPreviewHref: '/admin/results-packs',
  },
];

const GUT_CHECK_OUTPUTS: OutputArtifactDescriptor[] = [
  {
    key: 'screen',
    label: 'ResultsScreen (3-page flow)',
    status: 'implemented',
    implementedAt: 'components/assessments/ResultsScreen.tsx',
    notes: 'Flow v2 with legacy single-page fallback.',
  },
  {
    key: 'email',
    label: 'Email summary',
    status: 'external',
    implementedAt: 'pages/api/assessments/email-capture.ts → n8n',
    notes: 'Email body composed by n8n workflow. Requires N8N_WEBHOOK_URL. Repo only captures the address and posts the event.',
  },
  {
    key: 'pdf',
    label: 'Downloadable PDF',
    status: 'implemented',
    implementedAt: 'pages/api/assessments/results-pdf.ts (pdfkit)',
    notes: 'PDF button is always shown. results_v2.json channels.pdf.enabled=false is metadata only and NOT enforced at runtime.',
  },
  {
    key: 'webhook',
    label: 'n8n webhook event',
    status: 'external',
    implementedAt: 'pages/api/assessments/email-capture.ts → webhook_outbox',
    notes: 'event_type: email_capture. Submit-time webhook was intentionally removed; only email-capture fires.',
  },
  {
    key: 'claim',
    label: 'Guest claim flow',
    status: 'implemented',
    implementedAt: 'pages/api/assessments/claim.ts + useAssessmentClaimFlow',
    notes: 'Guest submissions carry metadata.claimToken; signed-in users can claim.',
  },
  {
    key: 'account-save',
    label: 'Save to account',
    status: 'implemented',
    implementedAt: 'components/assessments/ResultsScreen.tsx (SavedToAccountBanner)',
  },
  {
    key: 'share',
    label: 'Native share / Web Share API',
    status: 'not-implemented',
    notes: 'No navigator.share or share button. Only deep links via ?screen= are shareable.',
  },
];

const GUT_CHECK_READINESS_REQUIREMENTS: ReadinessRequirement[] = [
  {
    key: 'question-set-validates',
    label: 'Question set validates',
    automated: false,
    description: 'Published question set passes the v2 schema validator (4 options/question, values 0–3).',
  },
  {
    key: 'option-values-match-contract',
    label: 'Option values match scoring contract',
    automated: false,
    description: 'Every option on every question carries value ∈ {0,1,2,3} as the v3 axis engine expects.',
  },
  {
    key: 'result-levels-have-copy',
    label: 'All result levels have result copy',
    automated: true,
    description: 'A published results pack exists for every level the scoring engine can produce.',
  },
  {
    key: 'runtime-preview-available',
    label: 'Runtime preview available',
    automated: true,
    description: '?preview=1 resolves a CMS draft without exposing it on the public route.',
  },
  {
    key: 'email-summary-configured',
    label: 'Email summary path configured',
    automated: true,
    description: 'N8N_WEBHOOK_URL is set and the email-capture route can fire the event.',
  },
  {
    key: 'pdf-path-configured',
    label: 'PDF path configured',
    automated: true,
    description: 'results-pdf route is present and reachable from ResultsScreen.',
  },
  {
    key: 'scoring-adapter-declared',
    label: 'Scoring adapter declared',
    automated: true,
    description: 'The operations contract names the live scoring adapter for this assessment.',
  },
  {
    key: 'no-draft-content-exposed',
    label: 'No draft content exposed publicly',
    automated: false,
    description: 'Published pointer targets a published revision; draft revisions only load under ?preview=1. Confirm via the question-set / results-pack manage pages.',
  },
];

const GUT_CHECK_CONTRACT: OperationsContract = {
  assessmentType: 'gut-check',
  title: 'Gut Check Assessment',
  scoringStyle: 'axis-band-decision-tree',
  scoringAdapterId: 'gut-check-axis-v3',
  legacyScoringAdapters: ['gut-check-axis-v2', 'gut-check-weighted-v1'],
  scoringDescription:
    '17 questions map onto five axes (capacity, buffer, responsiveness, recovery, protection). Each axis is banded low/moderate/high from the answer average (with reverse-direction normalization per question). A decision tree over the five bands selects one of four levels (level1–level4). q16/q17 feed confidence (high/moderate/low) only; they do not change the level. v3 corrects q8 directionality vs v2.',
  scoringEnginePath: 'lib/assessmentScoringV2.ts (calculateScoringV3)',
  optionValueModel: {
    min: 0,
    max: 3,
    optionsPerQuestion: 4,
    semantics: '0 = lowest agreement, 3 = highest agreement. Directionality is normalized per-question (reverse flag), so callers must NOT assume higher = more strain.',
  },
  resultLevels: GUT_CHECK_RESULT_LEVELS,
  resultsContentVersion: GUT_CHECK_RESULTS_CONTENT_VERSION,
  resultsPackSource: 'both',
  outputs: GUT_CHECK_OUTPUTS,
  preview: {
    runtimePreviewFlag: true,
    versionOverride: true,
    questionSetPreview: true,
    resultsPackPreview: true,
    forcedResultPreview: false,
    notes:
      'Forced-result preview (render a specific level on demand without taking the assessment) is NOT implemented. Admins can preview each results pack at /admin/results-packs/preview/[packId] and run the live assessment with ?preview=1.',
  },
  readinessRequirements: GUT_CHECK_READINESS_REQUIREMENTS,
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const OPERATIONS_CONTRACTS: Record<AssessmentType, OperationsContract> = {
  'gut-check': GUT_CHECK_CONTRACT,
};

/** Lookup a contract by assessmentType. Returns undefined if none declared. */
export function getOperationsContract(
  assessmentType: string | null | undefined
): OperationsContract | undefined {
  if (!assessmentType) return undefined;
  return OPERATIONS_CONTRACTS[assessmentType as AssessmentType];
}

/** All declared contracts, in stable insertion order. */
export function listOperationsContracts(): OperationsContract[] {
  return Object.values(OPERATIONS_CONTRACTS);
}

/** True when a contract is declared for this assessmentType. */
export function hasOperationsContract(
  assessmentType: string | null | undefined
): boolean {
  return !!getOperationsContract(assessmentType);
}

/**
 * Join a contract with its registry identity. Returns null when either side is
 * missing — both must exist for an assessment to be fully manageable.
 */
export interface AssessmentOperationsProfile {
  registry: AssessmentRegistryEntry;
  contract: OperationsContract;
}

export function getAssessmentOperationsProfile(
  assessmentType: string | null | undefined
): AssessmentOperationsProfile | null {
  const contract = getOperationsContract(assessmentType);
  const registry = getAssessmentEntryByType(assessmentType);
  if (!contract || !registry) return null;
  return { registry, contract };
}

// ---------------------------------------------------------------------------
// Readiness evaluation (pure)
// ---------------------------------------------------------------------------

/**
 * Evaluate the publish-readiness checklist for one assessment version against a
 * runtime status snapshot. Pure: no I/O, no side effects. Callers (admin UI or
 * tests) supply `ReadinessInput`; this function maps each requirement to an
 * honest `ReadinessStatus`.
 *
 * Automated checks derive their status from `ReadinessInput`. Info-only checks
 * (automated: false) always report `manual-review` with a prompt for a human to
 * confirm — they never pretend to be verified.
 */
export function evaluateReadiness(
  contract: OperationsContract,
  input: ReadinessInput
): ReadinessCheckResult[] {
  return contract.readinessRequirements.map((req) => {
    if (!req.automated) {
      return {
        key: req.key,
        label: req.label,
        status: 'manual-review',
        detail: `${req.description} — requires human confirmation.`,
        automated: false,
      };
    }

    switch (req.key) {
      case 'result-levels-have-copy': {
        const ok =
          input.resultsLevelsWithCopy >= input.resultsLevelsExpected &&
          input.resultsLevelsExpected > 0;
        return {
          key: req.key,
          label: req.label,
          status: ok ? 'verified' : 'missing',
          detail: ok
            ? `${input.resultsLevelsWithCopy}/${input.resultsLevelsExpected} result levels have published copy.`
            : `Only ${input.resultsLevelsWithCopy}/${input.resultsLevelsExpected} result levels have published copy.`,
          automated: true,
        };
      }
      case 'runtime-preview-available': {
        return {
          key: req.key,
          label: req.label,
          status: input.runtimePreviewAvailable ? 'verified' : 'missing',
          detail: input.runtimePreviewAvailable
            ? '?preview=1 is supported by the resolver.'
            : 'Runtime preview flag is not supported for this assessment.',
          automated: true,
        };
      }
      case 'email-summary-configured': {
        return {
          key: req.key,
          label: req.label,
          status: input.emailWebhookConfigured ? 'verified' : 'manual-review',
          detail: input.emailWebhookConfigured
            ? 'N8N_WEBHOOK_URL is configured; email-capture will fire the event.'
            : 'N8N_WEBHOOK_URL is not detected — email capture will silently skip the webhook. Confirm server env.',
          automated: true,
        };
      }
      case 'pdf-path-configured': {
        return {
          key: req.key,
          label: req.label,
          status: input.pdfRoutePresent ? 'verified' : 'not-implemented',
          detail: input.pdfRoutePresent
            ? 'results-pdf route is present.'
            : 'No PDF route found for this assessment.',
          automated: true,
        };
      }
      case 'scoring-adapter-declared': {
        return {
          key: req.key,
          label: req.label,
          status: input.scoringAdapterDeclared ? 'verified' : 'missing',
          detail: input.scoringAdapterDeclared
            ? `Live adapter: ${contract.scoringAdapterId}.`
            : 'No scoring adapter declared in the operations contract.',
          automated: true,
        };
      }
      case 'no-draft-content-exposed': {
        return {
          key: req.key,
          label: req.label,
          status: input.draftContentExposed ? 'missing' : 'verified',
          detail: input.draftContentExposed
            ? 'Draft content is reachable on the public route — fix the published pointer before publishing.'
            : 'Public route resolves the published revision; drafts only load under ?preview=1.',
          automated: true,
        };
      }
      default:
        return {
          key: req.key,
          label: req.label,
          status: 'manual-review',
          detail: `No automated evaluator for "${req.key}".`,
          automated: false,
        };
    }
  });
}

/** Roll up a set of readiness results into a single honest summary status. */
export function summarizeReadiness(
  results: ReadinessCheckResult[]
): {
  status: 'ready' | 'needs-review' | 'blocked';
  verified: number;
  manualReview: number;
  missing: number;
  notImplemented: number;
} {
  const verified = results.filter((r) => r.status === 'verified').length;
  const manualReview = results.filter((r) => r.status === 'manual-review').length;
  const missing = results.filter((r) => r.status === 'missing').length;
  const notImplemented = results.filter(
    (r) => r.status === 'not-implemented'
  ).length;

  let status: 'ready' | 'needs-review' | 'blocked' = 'ready';
  if (missing > 0 || notImplemented > 0) {
    status = 'blocked';
  } else if (manualReview > 0) {
    status = 'needs-review';
  }
  return { status, verified, manualReview, missing, notImplemented };
}
