/**
 * Assessment Creation Planning Layer (Packet K)
 *
 * Pure, code-owned, testable metadata that matures the assessment factory
 * from a *readiness map* (Packet J) into a *creation-system foundation*
 * (Packet K) — without creating, registering, routing, or publishing a real
 * second assessment.
 *
 * What this module adds on top of `assessmentFactory.ts`:
 *   - `PlannedAssessmentConcept`: a planning-only assessment concept. Many
 *     concepts can map to one problem point, proving problem points are
 *     *categories*, not single assessments.
 *   - `AssessmentCreationOwnership`: explicit admin-owned vs
 *     engineering-owned field split, so admins know what they can do today
 *     vs what still requires an engineer.
 *   - `AssessmentActivationStep` + `ASSESSMENT_ACTIVATION_CHECKLIST`: a
 *     reusable activation checklist that separates admin-owned work from
 *     engineering-owned work.
 *   - `AssessmentCreationPlanStatus`: honest lifecycle status for a planned
 *     concept (`idea`, `planned`, `scaffold-ready`, `activation-blocked`,
 *     `ready-for-engineering-handoff`). None of these imply live/public.
 *
 * What this module deliberately does NOT do:
 *   - register an assessment in `ASSESSMENT_REGISTRY`,
 *   - add a public route,
 *   - persist planning concepts to a database (no DB table exists; concepts
 *     are static code-owned metadata and labelled `persisted: false`),
 *   - execute scoring,
 *   - build a generalized scoring-rule engine,
 *   - build an outcome builder UI,
 *   - change Gut Check scoring/runtime/results/email/webhook/claim behavior.
 *
 * Honest statuses are used everywhere. A planned concept is never treated as
 * live, registered, or public — see `isPlannedConceptLive()` which always
 * returns `false` for every concept in this module.
 */

import {
  getProblemPoint,
  getArchetype,
  getScoringTemplate,
  type FactoryCapabilityStatus,
} from '@/lib/assessments/assessmentFactory';

// ---------------------------------------------------------------------------
// Ownership vocabulary
// ---------------------------------------------------------------------------

/**
 * Who owns a piece of work in the assessment creation system.
 * - `admin`        — an admin/non-engineer can do this today via existing tools.
 * - `engineering`  — requires an engineer to change code (registry, scoring
 *                    dispatch, routes, artifact wiring).
 * - `shared`       — admin-authored content with an engineering-owned guardrail
 *                    (e.g. results packs are admin-authored but a forced-result
 *                    preview harness is engineering-owned).
 */
export type AssessmentCreationOwnership = 'admin' | 'engineering' | 'shared';

// ---------------------------------------------------------------------------
// Creation plan status
// ---------------------------------------------------------------------------

/**
 * Honest lifecycle status for a planned assessment concept. None of these
 * imply the concept is live, registered, or public.
 * - `idea`                       — captured as a concept; no concrete plan yet.
 * - `planned`                    — problem point / archetype / template chosen.
 * - `scaffold-ready`             — ready to scaffold question set + results packs in the CMS.
 * - `activation-blocked`         — content may exist but activation is blocked on engineering.
 * - `ready-for-engineering-handoff` — admin-owned work complete; engineering can activate.
 */
export type AssessmentCreationPlanStatus =
  | 'idea'
  | 'planned'
  | 'scaffold-ready'
  | 'activation-blocked'
  | 'ready-for-engineering-handoff';

export const PLAN_STATUS_LABELS: Record<AssessmentCreationPlanStatus, string> = {
  idea: 'Idea',
  planned: 'Planned',
  'scaffold-ready': 'Scaffold ready',
  'activation-blocked': 'Activation blocked',
  'ready-for-engineering-handoff': 'Ready for engineering handoff',
};

// ---------------------------------------------------------------------------
// Field ownership descriptors
// ---------------------------------------------------------------------------

/**
 * One field of a planned assessment concept, labelled with who owns it. Used
 * to render the "admin-owned vs engineering-owned" split on /admin/assessments
 * and in the creation manual.
 */
export interface PlannedAssessmentFieldOwnership {
  /** Field name as it appears on the concept (e.g. "workingTitle"). */
  field: string;
  /** Display label. */
  label: string;
  /** Who owns this field today. */
  ownership: AssessmentCreationOwnership;
  /** Honest status of tooling support for this field. */
  status: FactoryCapabilityStatus;
  /** Admin route or tool that owns this field today, if any. */
  availableAtHref?: string;
  /** Caveat an admin should see. */
  notes?: string;
}

/**
 * The full admin-owned vs engineering-owned field split for a planned
 * assessment concept. Rendered as two columns on /admin/assessments so an
 * admin can see exactly what they can touch today vs what still needs
 * engineering.
 */
export interface AssessmentCreationOwnershipSplit {
  adminOwned: PlannedAssessmentFieldOwnership[];
  engineeringOwned: PlannedAssessmentFieldOwnership[];
  shared: PlannedAssessmentFieldOwnership[];
}

// ---------------------------------------------------------------------------
// Planned assessment concept
// ---------------------------------------------------------------------------

/**
 * A planning-only assessment concept. This is NOT a registered assessment:
 * it has no registry entry, no public route, no scoring dispatch, and no
 * runtime behavior. It exists so the creation system can represent many
 * assessments per problem point and so admins can see what would be required
 * to activate one.
 *
 * `persisted` is always `false` in v1 — there is no DB table for planned
 * concepts. Concepts are static code-owned metadata.
 */
export interface PlannedAssessmentConcept {
  /** Stable, kebab-case id unique within PLANNED_ASSESSMENT_CONCEPTS. */
  id: string;
  /** Working title — planning label only, not public branding. */
  workingTitle: string;
  /** Problem point id (must exist in PROBLEM_POINTS). */
  problemPointId: string;
  /** Archetype id (must exist in ASSESSMENT_ARCHETYPES). */
  archetypeId: string;
  /** Scoring template id (must exist in SCORING_TEMPLATES). */
  scoringTemplateId: string;
  /** Intended audience / use case, in plain language. */
  intendedUse: string;
  /** Honest lifecycle status. Never implies live/public. */
  status: AssessmentCreationPlanStatus;
  /**
   * Activation blockers — ids in ASSESSMENT_ACTIVATION_CHECKLIST that are
   * not yet satisfied and block activation. Rendered honestly on admin.
   */
  activationBlockerStepIds: string[];
  /**
   * Always `false` in v1. Explicit so the admin UI and tests can prove no
   * planned concept is treated as persisted/live.
   */
  persisted: boolean;
  /**
   * Always `false`. A planned concept is never live. This field exists so
   * the admin surface can render the honest "not live / not public" badge
   * without inferring it.
   */
  isLive: boolean;
  /**
   * Always `false`. A planned concept has no registry entry. This is
   * explicit so tests can assert it.
   */
  isRegistered: boolean;
  /** Optional pointer to the docs section that explains this concept. */
  docsHref?: string;
}

// ---------------------------------------------------------------------------
// Activation step + checklist
// ---------------------------------------------------------------------------

/**
 * One step of the assessment activation checklist. The checklist is the
 * honest, reusable list of work required to take a planned concept from
 * `idea` to a live, public, registered assessment. Each step is labelled
 * with who owns it so admins and engineers can see their responsibilities.
 */
export interface AssessmentActivationStep {
  /** Stable step id. */
  id: string;
  /** 1-based order in the checklist. */
  order: number;
  /** Display label. */
  label: string;
  /** What done looks like for this step. */
  description: string;
  /** Who owns this step. */
  ownership: AssessmentCreationOwnership;
  /** Honest status of tooling support for this step. */
  status: FactoryCapabilityStatus;
  /** Admin route or tool that implements this step today, if any. */
  availableAtHref?: string;
  /** Caveat an admin or engineer should see. */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Activation checklist data
// ---------------------------------------------------------------------------

export const ASSESSMENT_ACTIVATION_CHECKLIST: readonly AssessmentActivationStep[] =
  Object.freeze([
    {
      id: 'choose-problem-point',
      order: 1,
      label: 'Choose a problem point',
      description:
        'Pick the Fine Diet prospect problem point from the taxonomy. Grounds the assessment in a real program pathway.',
      ownership: 'admin',
      status: 'available',
      availableAtHref: '/admin/assessments',
      notes:
        'Taxonomy is code-owned metadata. Selecting one is a planning step today, not a self-serve DB write.',
    },
    {
      id: 'choose-archetype',
      order: 2,
      label: 'Choose an archetype',
      description:
        'Pick the reusable assessment shape (score-band, axis-profile, persona quiz, readiness audit, etc.).',
      ownership: 'admin',
      status: 'available',
      availableAtHref: '/admin/assessments',
      notes:
        'Archetypes are metadata. Wiring a non-Gut-Check archetype still requires engineering.',
    },
    {
      id: 'choose-scoring-template',
      order: 3,
      label: 'Choose a scoring template',
      description:
        'Pick the scoring template that maps answers to a result, compatible with the chosen archetype.',
      ownership: 'admin',
      status: 'planned',
      notes:
        'A scoring-template selector is planned, not built. Only the Gut Check axis template is implemented today.',
    },
    {
      id: 'define-outcomes',
      order: 4,
      label: 'Define outcomes',
      description:
        'Define the result levels / personas / recommendation set the assessment can produce and the CTA each maps to.',
      ownership: 'shared',
      status: 'planned',
      notes:
        'Outcome shape is designed by admin, but a generalized outcome builder UI is not built. Non-level outcomes (persona, recommendation-set) have no authoring UI yet.',
    },
    {
      id: 'author-question-set',
      order: 5,
      label: 'Author the question set',
      description:
        'Author sections, questions, options, and option values in the CMS structured authoring UI.',
      ownership: 'admin',
      status: 'available',
      availableAtHref: '/admin/question-sets/author',
      notes:
        'Packet H authoring UI is available. The v2 schema assumes 4 options/question with values 0–3, which fits score-band and axis-profile templates.',
    },
    {
      id: 'map-answers-scoring',
      order: 6,
      label: 'Map answers / scoring dispatch',
      description:
        'Wire the question set to a scoring engine. Today scoring dispatch is keyed by assessmentVersion, not assessmentType.',
      ownership: 'engineering',
      status: 'planned',
      notes:
        'Assessment-type-keyed scoring dispatch is the first engineering step before a second assessment. Without it, a v2 assessment would be scored by the Gut Check axis engine.',
    },
    {
      id: 'add-registry-entry',
      order: 7,
      label: 'Add a registry entry',
      description:
        'Add the assessment to ASSESSMENT_REGISTRY with a unique slug, status, and hasFileFallback flag.',
      ownership: 'engineering',
      status: 'available',
      notes:
        'Code-owned. A non-live/planning-only entry must NOT be added to the runtime registry. This step is engineering-gated on purpose.',
    },
    {
      id: 'add-operations-contract',
      order: 8,
      label: 'Add an operations contract',
      description:
        'Declare an operations contract (scoring adapter, result levels, outputs, preview, readiness requirements).',
      ownership: 'engineering',
      status: 'available',
      notes:
        'Code-owned. Includes factory coordinates (problem point / archetype / scoring template).',
    },
    {
      id: 'add-factory-coordinates',
      order: 9,
      label: 'Add factory coordinates',
      description:
        'Set factoryModel on the operations contract so the assessment appears as a factory instance.',
      ownership: 'engineering',
      status: 'available',
      availableAtHref: '/admin/assessments',
      notes:
        'Code-owned. Positions the assessment within the factory model alongside Gut Check.',
    },
    {
      id: 'add-scoring-dispatch',
      order: 10,
      label: 'Add scoring dispatch',
      description:
        'Wire the runtime scoring path to dispatch by assessmentType to the correct engine.',
      ownership: 'engineering',
      status: 'planned',
      notes:
        'Currently version-keyed to the Gut Check engine. Must be decoupled before a second assessment goes live.',
    },
    {
      id: 'add-result-pack-outcome-mapping',
      order: 11,
      label: 'Add result pack / outcome mapping',
      description:
        'Author results packs in the CMS and map each outcome to a results pack + downstream CTA.',
      ownership: 'shared',
      status: 'available',
      availableAtHref: '/admin/results-packs',
      notes:
        'Results-pack content is admin-authored. Mapping to non-level outcomes (persona, recommendation-set) still needs engineering.',
    },
    {
      id: 'configure-artifact-payload-coverage',
      order: 12,
      label: 'Configure artifact payload coverage',
      description:
        'Confirm the normalized artifact payload (email/PDF/webhook/CTA) is covered for this assessment.',
      ownership: 'engineering',
      status: 'manual-review',
      availableAtHref: '/admin/assessments',
      notes:
        'Packet I artifact payload contract is visible on /admin/assessments. Per-assessment coverage is manual-review today.',
    },
    {
      id: 'preview-all-outcomes',
      order: 13,
      label: 'Preview all outcomes',
      description:
        'Preview every result level / persona / recommendation before publishing, including a forced-result preview per outcome.',
      ownership: 'shared',
      status: 'manual-review',
      availableAtHref: '/admin/results-packs',
      notes:
        'Question-set + results-pack preview and runtime ?preview=1 exist for Gut Check. A generalized forced-result preview harness is not implemented.',
    },
    {
      id: 'configure-email-pdf-webhook-cta-routing',
      order: 14,
      label: 'Configure email / PDF / webhook / CTA routing',
      description:
        'Configure per-assessment downstream outputs: email body, PDF, webhook payload, CTA/program routing.',
      ownership: 'engineering',
      status: 'planned',
      notes:
        'Today these are Gut Check-shaped. A second assessment with different downstream outputs needs per-assessment configuration.',
    },
    {
      id: 'publish-readiness',
      order: 15,
      label: 'Publish readiness',
      description:
        'Confirm the operations-contract readiness checklist passes before exposing the assessment publicly.',
      ownership: 'admin',
      status: 'available',
      availableAtHref: '/admin/assessments',
      notes:
        'Packet I readiness checklist is rendered on /admin/assessments. Publishing itself remains admin-only via pointer endpoints.',
    },
    {
      id: 'qa-public-route',
      order: 16,
      label: 'QA the public route',
      description:
        'QA the live public route end-to-end (start, scoring, results, email, PDF, webhook, CTA) before promoting.',
      ownership: 'shared',
      status: 'planned',
      notes:
        'Requires the public route to exist (engineering). QA itself is shared: admin smoke-tests, engineering verifies scoring/artifacts.',
    },
  ]);

// ---------------------------------------------------------------------------
// Planned assessment concepts (PLANNING-ONLY; not live, not registered)
// ---------------------------------------------------------------------------

export const PLANNED_ASSESSMENT_CONCEPTS: readonly PlannedAssessmentConcept[] =
  Object.freeze([
    // gut-health: Gut Check is the live instance; these are future concepts.
    {
      id: 'planned:gut-health:digestive-reactivity-checkin',
      workingTitle: 'Digestive reactivity check-in',
      problemPointId: 'gut-health',
      archetypeId: 'habit-audit',
      scoringTemplateId: 'total-score-to-levels',
      intendedUse:
        'A lighter habit-audit for prospects who finish Gut Check and want to track reactivity patterns over time.',
      status: 'idea',
      activationBlockerStepIds: [
        'choose-scoring-template',
        'map-answers-scoring',
        'add-scoring-dispatch',
        'configure-email-pdf-webhook-cta-routing',
      ],
      persisted: false,
      isLive: false,
      isRegistered: false,
    },
    {
      id: 'planned:gut-health:reintroduction-readiness',
      workingTitle: 'Reintroduction readiness quiz',
      problemPointId: 'gut-health',
      archetypeId: 'readiness-audit',
      scoringTemplateId: 'threshold-risk-flags',
      intendedUse:
        'A readiness audit for prospects considering a reintroduction experiment after an elimination protocol.',
      status: 'idea',
      activationBlockerStepIds: [
        'choose-scoring-template',
        'define-outcomes',
        'map-answers-scoring',
        'add-scoring-dispatch',
        'configure-email-pdf-webhook-cta-routing',
      ],
      persisted: false,
      isLive: false,
      isRegistered: false,
    },
    // baseline-readiness: multiple planned concepts.
    {
      id: 'planned:baseline-readiness:starter-readiness',
      workingTitle: 'Starter readiness assessment',
      problemPointId: 'baseline-readiness',
      archetypeId: 'readiness-audit',
      scoringTemplateId: 'total-score-to-levels',
      intendedUse:
        'The first readiness assessment a prospect takes before starting the Fine Diet Method. Lowest-scoring-risk archetype.',
      status: 'planned',
      activationBlockerStepIds: [
        'map-answers-scoring',
        'add-registry-entry',
        'add-operations-contract',
        'add-scoring-dispatch',
        'configure-email-pdf-webhook-cta-routing',
        'qa-public-route',
      ],
      persisted: false,
      isLive: false,
      isRegistered: false,
      docsHref: '/docs/assessments/assessment-creation-manual',
    },
    {
      id: 'planned:baseline-readiness:meal-rhythm-audit',
      workingTitle: 'Meal rhythm audit',
      problemPointId: 'baseline-readiness',
      archetypeId: 'habit-audit',
      scoringTemplateId: 'total-score-to-levels',
      intendedUse:
        'A frequency-based audit of current meal rhythm habits, producing a pattern snapshot before baseline.',
      status: 'idea',
      activationBlockerStepIds: [
        'map-answers-scoring',
        'add-scoring-dispatch',
        'configure-email-pdf-webhook-cta-routing',
      ],
      persisted: false,
      isLive: false,
      isRegistered: false,
    },
    {
      id: 'planned:baseline-readiness:tracking-readiness-quiz',
      workingTitle: 'Tracking readiness quiz',
      problemPointId: 'baseline-readiness',
      archetypeId: 'readiness-audit',
      scoringTemplateId: 'threshold-risk-flags',
      intendedUse:
        'A short quiz to decide whether a prospect is ready to start tracking intake and observations without overcommitting.',
      status: 'idea',
      activationBlockerStepIds: [
        'choose-scoring-template',
        'define-outcomes',
        'map-answers-scoring',
        'add-scoring-dispatch',
        'configure-email-pdf-webhook-cta-routing',
      ],
      persisted: false,
      isLive: false,
      isRegistered: false,
    },
    // program-fit: multiple planned concepts.
    {
      id: 'planned:program-fit:program-fit-router',
      workingTitle: 'Program fit router',
      problemPointId: 'program-fit',
      archetypeId: 'program-fit',
      scoringTemplateId: 'recommendation-routing',
      intendedUse:
        'Routes a prospect to the Fine Diet program that best fits their signals. Recommendation-routing, not diagnostic.',
      status: 'planned',
      activationBlockerStepIds: [
        'define-outcomes',
        'map-answers-scoring',
        'add-registry-entry',
        'add-operations-contract',
        'add-scoring-dispatch',
        'configure-email-pdf-webhook-cta-routing',
        'qa-public-route',
      ],
      persisted: false,
      isLive: false,
      isRegistered: false,
    },
    {
      id: 'planned:program-fit:product-fit-quiz',
      workingTitle: 'Product fit quiz',
      problemPointId: 'program-fit',
      archetypeId: 'program-fit',
      scoringTemplateId: 'category-tally-to-persona',
      intendedUse:
        'A lighter persona/category quiz that maps a prospect to a Fine Diet offer (membership, program, or "talk to us").',
      status: 'idea',
      activationBlockerStepIds: [
        'choose-scoring-template',
        'define-outcomes',
        'map-answers-scoring',
        'add-scoring-dispatch',
        'configure-email-pdf-webhook-cta-routing',
      ],
      persisted: false,
      isLive: false,
      isRegistered: false,
    },
  ]);

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** All planned assessment concepts in stable insertion order. */
export function listPlannedAssessmentConcepts(): PlannedAssessmentConcept[] {
  return [...PLANNED_ASSESSMENT_CONCEPTS];
}

/** Look up a planned assessment concept by id. */
export function getPlannedAssessmentConcept(
  id: string | null | undefined
): PlannedAssessmentConcept | undefined {
  if (!id) return undefined;
  return PLANNED_ASSESSMENT_CONCEPTS.find((c) => c.id === id);
}

/** All planned concepts for a given problem point id. */
export function listPlannedConceptsForProblemPoint(
  problemPointId: string | null | undefined
): PlannedAssessmentConcept[] {
  if (!problemPointId) return [];
  return PLANNED_ASSESSMENT_CONCEPTS.filter(
    (c) => c.problemPointId === problemPointId
  );
}

/** All activation checklist steps, ordered by `order`. */
export function listActivationChecklistSteps(): AssessmentActivationStep[] {
  return [...ASSESSMENT_ACTIVATION_CHECKLIST].sort((a, b) => a.order - b.order);
}

/** Look up an activation step by id. */
export function getActivationStep(
  id: string | null | undefined
): AssessmentActivationStep | undefined {
  if (!id) return undefined;
  return ASSESSMENT_ACTIVATION_CHECKLIST.find((s) => s.id === id);
}

/** Activation steps filtered by ownership. */
export function listActivationStepsByOwnership(
  ownership: AssessmentCreationOwnership
): AssessmentActivationStep[] {
  return listActivationChecklistSteps().filter((s) => s.ownership === ownership);
}

// ---------------------------------------------------------------------------
// Ownership split (per concept)
// ---------------------------------------------------------------------------

/**
 * Resolve the admin-owned vs engineering-owned vs shared field split for a
 * planned assessment concept. The split is derived from the activation
 * checklist so there is one source of truth for "who owns what".
 */
export function getOwnershipSplitForConcept(
  conceptId: string | null | undefined
): AssessmentCreationOwnershipSplit {
  const empty: AssessmentCreationOwnershipSplit = {
    adminOwned: [],
    engineeringOwned: [],
    shared: [],
  };
  const concept = getPlannedAssessmentConcept(conceptId);
  if (!concept) return empty;

  const fields: PlannedAssessmentFieldOwnership[] = [
    {
      field: 'workingTitle',
      label: 'Working title',
      ownership: 'admin',
      status: 'available',
      notes: 'Planning label only. Not public branding.',
    },
    {
      field: 'problemPointId',
      label: 'Problem point',
      ownership: 'admin',
      status: 'available',
      availableAtHref: '/admin/assessments',
    },
    {
      field: 'archetypeId',
      label: 'Archetype',
      ownership: 'admin',
      status: 'available',
      availableAtHref: '/admin/assessments',
    },
    {
      field: 'scoringTemplateId',
      label: 'Scoring template',
      ownership: 'admin',
      status: getActivationStep('choose-scoring-template')?.status ?? 'planned',
      notes: 'Selector is planned. Only the Gut Check axis template is implemented.',
    },
    {
      field: 'intendedUse',
      label: 'Intended use / audience',
      ownership: 'admin',
      status: 'available',
    },
    {
      field: 'questionSet',
      label: 'Question set content',
      ownership: 'admin',
      status: 'available',
      availableAtHref: '/admin/question-sets/author',
    },
    {
      field: 'resultsPacks',
      label: 'Results pack content',
      ownership: 'shared',
      status: 'available',
      availableAtHref: '/admin/results-packs',
      notes: 'Admin-authored. Non-level outcome mapping still needs engineering.',
    },
    {
      field: 'registryEntry',
      label: 'Registry entry',
      ownership: 'engineering',
      status: 'available',
      notes: 'Code-owned. Must NOT be added for a planning-only concept.',
    },
    {
      field: 'operationsContract',
      label: 'Operations contract + factory coordinates',
      ownership: 'engineering',
      status: 'available',
    },
    {
      field: 'scoringDispatch',
      label: 'Scoring dispatch (by assessmentType)',
      ownership: 'engineering',
      status: 'planned',
      notes: 'Currently version-keyed to the Gut Check engine.',
    },
    {
      field: 'artifactRouting',
      label: 'Email / PDF / webhook / CTA routing',
      ownership: 'engineering',
      status: 'planned',
    },
    {
      field: 'publicRoute',
      label: 'Public route',
      ownership: 'engineering',
      status: 'planned',
      notes: 'No public route exists for any planned concept.',
    },
  ];

  return {
    adminOwned: fields.filter((f) => f.ownership === 'admin'),
    engineeringOwned: fields.filter((f) => f.ownership === 'engineering'),
    shared: fields.filter((f) => f.ownership === 'shared'),
  };
}

// ---------------------------------------------------------------------------
// Honest predicates (used by tests + admin UI)
// ---------------------------------------------------------------------------

/**
 * A planned assessment concept is NEVER live. This function exists so the
 * admin surface and tests can prove it: it always returns `false` for every
 * concept in this module.
 */
export function isPlannedConceptLive(
  conceptId: string | null | undefined
): boolean {
  const concept = getPlannedAssessmentConcept(conceptId);
  if (!concept) return false;
  return false; // intentional: planning concepts are never live.
}

/** True when a planned concept is persisted to a DB. Always false in v1. */
export function isPlannedConceptPersisted(
  conceptId: string | null | undefined
): boolean {
  const concept = getPlannedAssessmentConcept(conceptId);
  return Boolean(concept?.persisted); // always false in v1
}

// ---------------------------------------------------------------------------
// Creation-system readiness summary (for the admin surface)
// ---------------------------------------------------------------------------

export interface CreationSystemSummary {
  plannedConcepts: { total: number; byStatus: Record<AssessmentCreationPlanStatus, number> };
  problemPointsWithMultipleConcepts: number;
  activationChecklist: {
    total: number;
    adminOwned: number;
    engineeringOwned: number;
    shared: number;
    available: number;
    planned: number;
    manualReview: number;
  };
  persistedConcepts: number;
  liveConcepts: number;
}

/**
 * Honest roll-up of the creation-system state for the /admin/assessments
 * header. Counts are honest — `liveConcepts` is always 0 in v1.
 */
export function summarizeCreationSystem(): CreationSystemSummary {
  const byStatus: Record<AssessmentCreationPlanStatus, number> = {
    idea: 0,
    planned: 0,
    'scaffold-ready': 0,
    'activation-blocked': 0,
    'ready-for-engineering-handoff': 0,
  };
  for (const c of PLANNED_ASSESSMENT_CONCEPTS) byStatus[c.status]++;

  const problemPointCounts: Record<string, number> = {};
  for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
    problemPointCounts[c.problemPointId] =
      (problemPointCounts[c.problemPointId] ?? 0) + 1;
  }
  const problemPointsWithMultipleConcepts = Object.values(
    problemPointCounts
  ).filter((n) => n > 1).length;

  const steps = listActivationChecklistSteps();
  const acc: Record<AssessmentCreationOwnership, number> = {
    admin: 0,
    engineering: 0,
    shared: 0,
  };
  const statusAcc: Record<FactoryCapabilityStatus, number> = {
    available: 0,
    planned: 0,
    'manual-review': 0,
    'not-implemented': 0,
  };
  for (const s of steps) {
    acc[s.ownership]++;
    statusAcc[s.status]++;
  }

  return {
    plannedConcepts: { total: PLANNED_ASSESSMENT_CONCEPTS.length, byStatus },
    problemPointsWithMultipleConcepts,
    activationChecklist: {
      total: steps.length,
      adminOwned: acc.admin,
      engineeringOwned: acc.engineering,
      shared: acc.shared,
      available: statusAcc.available,
      planned: statusAcc.planned,
      manualReview: statusAcc['manual-review'],
    },
    persistedConcepts: PLANNED_ASSESSMENT_CONCEPTS.filter((c) => c.persisted).length,
    liveConcepts: 0, // always 0 in v1
  };
}

// ---------------------------------------------------------------------------
// Integrity validation (pure; exported for tests + module-load invariant)
// ---------------------------------------------------------------------------

export interface CreationPlanIntegrityViolation {
  kind:
    | 'duplicate-concept-id'
    | 'concept-missing-problem-point'
    | 'concept-missing-archetype'
    | 'concept-missing-scoring-template'
    | 'concept-missing-activation-step'
    | 'concept-archetype-template-mismatch'
    | 'concept-marked-live'
    | 'concept-marked-persisted'
    | 'concept-marked-registered'
    | 'duplicate-activation-step-id'
    | 'activation-step-order-gap'
    | 'activation-step-duplicate-order'
    | 'activation-step-missing-ownership';
  detail: string;
}

/**
 * Validate the creation-planning metadata for internal consistency:
 *   - unique concept ids;
 *   - every concept references valid problem point / archetype / template ids;
 *   - every concept's archetype is compatible with its scoring template;
 *   - every concept's activation blockers reference real activation steps;
 *   - no concept is marked live / persisted / registered (planning-only);
 *   - activation checklist has unique ids, contiguous 1-based order, and
 *     every step declares an ownership.
 */
export function validateCreationPlanIntegrity(): CreationPlanIntegrityViolation[] {
  const violations: CreationPlanIntegrityViolation[] = [];

  // Unique concept ids + reference integrity.
  const seenConcept = new Set<string>();
  for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
    if (seenConcept.has(c.id)) {
      violations.push({ kind: 'duplicate-concept-id', detail: c.id });
    } else {
      seenConcept.add(c.id);
    }
    if (!getProblemPoint(c.problemPointId)) {
      violations.push({
        kind: 'concept-missing-problem-point',
        detail: `${c.id} → ${c.problemPointId}`,
      });
    }
    const archetype = getArchetype(c.archetypeId);
    if (!archetype) {
      violations.push({
        kind: 'concept-missing-archetype',
        detail: `${c.id} → ${c.archetypeId}`,
      });
    }
    const template = getScoringTemplate(c.scoringTemplateId);
    if (!template) {
      violations.push({
        kind: 'concept-missing-scoring-template',
        detail: `${c.id} → ${c.scoringTemplateId}`,
      });
    }
    if (archetype && template) {
      if (!archetype.compatibleScoringTemplateIds.includes(template.id)) {
        violations.push({
          kind: 'concept-archetype-template-mismatch',
          detail: `${c.id}: archetype ${archetype.id} not compatible with template ${template.id}`,
        });
      }
    }
    for (const stepId of c.activationBlockerStepIds) {
      if (!getActivationStep(stepId)) {
        violations.push({
          kind: 'concept-missing-activation-step',
          detail: `${c.id} → ${stepId}`,
        });
      }
    }
    if (c.isLive) {
      violations.push({
        kind: 'concept-marked-live',
        detail: `${c.id} must not be marked live`,
      });
    }
    if (c.persisted) {
      violations.push({
        kind: 'concept-marked-persisted',
        detail: `${c.id} must not be marked persisted in v1`,
      });
    }
    if (c.isRegistered) {
      violations.push({
        kind: 'concept-marked-registered',
        detail: `${c.id} must not be marked registered (planning-only)`,
      });
    }
  }

  // Activation checklist integrity.
  const seenStep = new Set<string>();
  for (const s of ASSESSMENT_ACTIVATION_CHECKLIST) {
    if (seenStep.has(s.id)) {
      violations.push({ kind: 'duplicate-activation-step-id', detail: s.id });
    } else {
      seenStep.add(s.id);
    }
    if (!s.ownership) {
      violations.push({
        kind: 'activation-step-missing-ownership',
        detail: s.id,
      });
    }
  }
  const orders = [...ASSESSMENT_ACTIVATION_CHECKLIST]
    .map((s) => s.order)
    .sort((a, b) => a - b);
  const orderSet = new Set<number>();
  for (const order of orders) {
    if (orderSet.has(order)) {
      violations.push({
        kind: 'activation-step-duplicate-order',
        detail: `order ${order}`,
      });
    }
    orderSet.add(order);
  }
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) {
      violations.push({
        kind: 'activation-step-order-gap',
        detail: `expected ${i + 1}, found ${orders[i]}`,
      });
      break;
    }
  }

  if (violations.length > 0 && process.env.NODE_ENV !== 'production') {
    const msg = `[assessmentCreationPlan] Integrity violations: ${JSON.stringify(violations)}`;
    if (!process.env.JEST_WORKER_ID) {
      throw new Error(msg);
    }
  }
  return violations;
}

if (!process.env.JEST_WORKER_ID) {
  validateCreationPlanIntegrity();
}
