/**
 * Assessment Factory Metadata Layer
 *
 * Pure, code-owned, testable metadata that positions the assessment system
 * as an *assessment factory*: a platform for authoring many prospect-facing
 * assessment tools across Fine Diet problem points, built from reusable
 * archetypes and scoring templates, following a shared creation workflow.
 *
 * This module is INTENTIONALLY metadata-only. It does not:
 *   - execute scoring,
 *   - load CMS content,
 *   - create assessments,
 *   - mutate any DB row,
 *   - replace the operations contract (it layers *above* it).
 *
 * It exists so /admin/assessments can show the intended factory shape —
 * problem points, archetypes, scoring templates, the creation workflow, and
 * what is available now vs planned — without overbuilding a generalized
 * scoring-rule engine or an outcome builder UI prematurely.
 *
 * Honest statuses are used everywhere: `available`, `planned`, `manual-review`,
 * `not-implemented`. Nothing here implies a non-engineer can publish an
 * arbitrary assessment today.
 *
 * Discovery sources used to ground the taxonomy (see
 * `docs/assessments/assessment-factory.md` for the full summary):
 *   - lib/programs/programSeriesCatalogue.ts (Fine Diet program pathways)
 *   - lib/programs/programCategoryContent.ts (Nutrition Foundations copy)
 *   - lib/assessments/operationsContract.ts (Gut Check contract)
 *   - content/assessments/gut-check/results_v2.json (Fine Diet Method positioning)
 *   - lib/assessments/assessmentRegistry.ts (registered assessments)
 */

import type { AssessmentType } from '@/lib/assessmentTypes';
import { getOperationsContract } from '@/lib/assessments/operationsContract';

// ---------------------------------------------------------------------------
// Honest status vocabulary (shared across the factory model)
// ---------------------------------------------------------------------------

/**
 * Honest implementation status for a factory capability.
 * - `available`       — usable today by an admin/non-engineer for declared assessments.
 * - `planned`         — designed and documented, not yet built.
 * - `manual-review`   — partial; requires a human/engineer to confirm per assessment.
 * - `not-implemented` — not built and not wired.
 */
export type FactoryCapabilityStatus =
  | 'available'
  | 'planned'
  | 'manual-review'
  | 'not-implemented';

// ---------------------------------------------------------------------------
// Problem-point taxonomy
// ---------------------------------------------------------------------------

/**
 * One Fine Diet prospect problem point — the "why would someone take this
 * assessment" axis. Grounded in the program catalogue so assessments route
 * into real Fine Diet pathways instead of inventing new product surface area.
 */
export interface ProblemPoint {
  /** Stable, kebab-case id. */
  id: string;
  /** Display label. */
  label: string;
  /** One-line description of the prospect problem this addresses. */
  summary: string;
  /**
   * Fine Diet program slugs that address this problem point (from
   * `programSeriesCatalogue`). Used to keep assessments product-aligned.
   */
  relatedProgramSlugs: string[];
  /** Honest status of assessment coverage for this problem point. */
  status: FactoryCapabilityStatus;
  /** Suggested archetypes that fit this problem point (ids in `ASSESSMENT_ARCHETYPES`). */
  suggestedArchetypeIds: string[];
  /** Suggested scoring templates that fit this problem point (ids in `SCORING_TEMPLATES`). */
  suggestedScoringTemplateIds: string[];
}

// ---------------------------------------------------------------------------
// Assessment archetypes
// ---------------------------------------------------------------------------

/**
 * A reusable assessment shape — the "what kind of tool is this" axis. An
 * archetype describes the interaction + result model, independent of which
 * problem point it addresses. Gut Check is ONE instance of an archetype, not
 * the whole product model.
 */
export interface AssessmentArchetype {
  /** Stable, kebab-case id. */
  id: string;
  /** Display label. */
  label: string;
  /** One-line description of the archetype's shape and result model. */
  summary: string;
  /** Honest status of factory support for this archetype. */
  status: FactoryCapabilityStatus;
  /** Scoring template ids that are compatible with this archetype. */
  compatibleScoringTemplateIds: string[];
  /**
   * Optional reference implementation assessmentType, when one exists in the
   * registry. Documents which registered assessment already instantiates this
   * archetype so admins can see a worked example.
   */
  referenceAssessmentType?: AssessmentType;
}

// ---------------------------------------------------------------------------
// Scoring templates
// ---------------------------------------------------------------------------

/** What kind of result a scoring template produces. */
export type ScoringTemplateOutputKind =
  | 'level-bands'
  | 'axis-profile'
  | 'persona'
  | 'risk-flags'
  | 'recommendation-set'
  | 'progress-band';

/**
 * A reusable scoring-template descriptor — the "how do answers become a
 * result" axis. This is METADATA ONLY. It is not a generalized scoring-rule
 * engine. Each template names the output kind and the archetypes it supports
 * so a future packet can wire a real selector without redefining the model.
 */
export interface ScoringTemplate {
  /** Stable, kebab-case id. */
  id: string;
  /** Display label. */
  label: string;
  /** One-line description of how answers map to a result. */
  summary: string;
  /** What shape of result this template produces. */
  outputKind: ScoringTemplateOutputKind;
  /** Honest status of factory support for this template. */
  status: FactoryCapabilityStatus;
  /** Archetype ids this template can be applied to. */
  applicableArchetypeIds: string[];
}

// ---------------------------------------------------------------------------
// Creation workflow
// ---------------------------------------------------------------------------

/**
 * One stage of the assessment creation workflow. Stages are ordered by
 * `order` and each carries an honest status so the admin surface can show
 * what is actionable today vs what is still planned.
 */
export interface CreationWorkflowStage {
  /** Stable stage id. */
  id: string;
  /** 1-based order in the workflow. */
  order: number;
  /** Display label. */
  label: string;
  /** What happens at this stage. */
  description: string;
  /** Honest status of factory support for this stage. */
  status: FactoryCapabilityStatus;
  /** Admin route or tool that implements this stage today, if any. */
  availableAtHref?: string;
  /** Notes / caveats an admin should see. */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Factory model: maps a registered assessment to its factory coordinates
// ---------------------------------------------------------------------------

/**
 * The factory coordinates for one registered assessment: which problem point,
 * archetype, and scoring template it instantiates. Resolved from the
 * assessment's operations contract (`OperationsContract.factoryModel`) so the
 * contract remains the per-assessment source of truth and this module stays
 * metadata-only.
 */
export interface AssessmentFactoryModel {
  assessmentType: AssessmentType;
  /** Problem point id this assessment addresses. */
  problemPointId: string;
  /** Archetype id this assessment instantiates. */
  archetypeId: string;
  /** Scoring template id this assessment uses. */
  scoringTemplateId: string;
  /**
   * Optional reference to a future (not-yet-built) assessment slug that would
   * extend this archetype to a different problem point. Used for the roadmap
   * view only; never creates a public assessment.
   */
  plannedExtendsToProblemPointIds?: string[];
}

// ---------------------------------------------------------------------------
// Taxonomy data
// ---------------------------------------------------------------------------

export const PROBLEM_POINTS: readonly ProblemPoint[] = Object.freeze([
  {
    id: 'gut-health',
    label: 'Gut health & digestive reactivity',
    summary:
      'Digestive symptoms, reactivity, bloating, and context-sensitive gut patterns. The problem Gut Check already addresses.',
    relatedProgramSlugs: [
      'gut-check',
      'digestive-foundations',
      'low-fodmap',
      'elimination-protocol',
      'gluten-response',
      'dairy-response',
    ],
    status: 'available',
    suggestedArchetypeIds: ['axis-profile', 'habit-audit'],
    suggestedScoringTemplateIds: ['axis-scores-to-profile', 'total-score-to-levels'],
  },
  {
    id: 'protein-sufficiency',
    label: 'Protein gaps & meal protein structure',
    summary:
      'Difficulty hitting adequate protein, repetitive meals, and building meals that satisfy protein needs without rigidity.',
    relatedProgramSlugs: ['protein-sufficiency'],
    status: 'planned',
    suggestedArchetypeIds: ['habit-audit', 'score-band'],
    suggestedScoringTemplateIds: ['total-score-to-levels', 'category-tally-to-persona'],
  },
  {
    id: 'sugar-stability',
    label: 'Sugar reliance, cravings & energy swings',
    summary:
      'Sugar-driven energy swings, cravings, and the desire to reduce reliance without white-knuckling restriction.',
    relatedProgramSlugs: ['sugar-stability', 'sugar-reset'],
    status: 'planned',
    suggestedArchetypeIds: ['habit-audit', 'score-band'],
    suggestedScoringTemplateIds: ['total-score-to-levels', 'category-tally-to-persona'],
  },
  {
    id: 'inflammation-recovery',
    label: 'Inflammation & recovery patterns',
    summary:
      'Steadier energy and recovery support through food-pattern consistency, without promising clinical outcomes.',
    relatedProgramSlugs: ['inflammation-regulation', 'flare-control'],
    status: 'planned',
    suggestedArchetypeIds: ['axis-profile', 'score-band'],
    suggestedScoringTemplateIds: ['axis-scores-to-profile', 'total-score-to-levels'],
  },
  {
    id: 'food-sensitivity',
    label: 'Food response & reintroduction signals',
    summary:
      'Personal tolerance signals for gluten, dairy, and common trigger categories; readiness for a reintroduction experiment.',
    relatedProgramSlugs: [
      'gluten-response',
      'dairy-response',
      'elimination-protocol',
      'low-fodmap',
    ],
    status: 'planned',
    suggestedArchetypeIds: ['recommendation-routing', 'risk-triage'],
    suggestedScoringTemplateIds: ['recommendation-routing', 'threshold-risk-flags'],
  },
  {
    id: 'body-composition',
    label: 'Body composition & leaning/building readiness',
    summary:
      'Readiness for a fat-loss or building phase, including baseline habits and sustainability before starting a goal pathway.',
    relatedProgramSlugs: ['lean', 'build'],
    status: 'planned',
    suggestedArchetypeIds: ['readiness-audit', 'score-band'],
    suggestedScoringTemplateIds: ['total-score-to-levels', 'threshold-risk-flags'],
  },
  {
    id: 'baseline-readiness',
    label: 'Baseline & meal-rhythm readiness',
    summary:
      'Whether a prospect has the meal rhythm, observation habit, and starting context to begin the Fine Diet Method productively.',
    relatedProgramSlugs: ['baseline'],
    status: 'planned',
    suggestedArchetypeIds: ['readiness-audit', 'habit-audit'],
    suggestedScoringTemplateIds: ['total-score-to-levels', 'threshold-risk-flags'],
  },
  {
    id: 'training-recovery',
    label: 'Training recovery & daily support',
    summary:
      'Recovery and maintenance support for members with training demands or daily-life load alongside nutrition goals.',
    relatedProgramSlugs: ['support'],
    status: 'planned',
    suggestedArchetypeIds: ['habit-audit', 'axis-profile'],
    suggestedScoringTemplateIds: ['total-score-to-levels', 'axis-scores-to-profile'],
  },
  {
    id: 'program-fit',
    label: 'Program / product fit routing',
    summary:
      'Routing a prospect to the Fine Diet program or offer that best fits their signals — a recommendation-routing assessment, not a diagnostic one.',
    relatedProgramSlugs: ['baseline', 'digestive-foundations', 'protein-sufficiency'],
    status: 'planned',
    suggestedArchetypeIds: ['program-fit', 'recommendation-routing'],
    suggestedScoringTemplateIds: ['recommendation-routing', 'category-tally-to-persona'],
  },
]);

// ---------------------------------------------------------------------------
// Archetype data
// ---------------------------------------------------------------------------

export const ASSESSMENT_ARCHETYPES: readonly AssessmentArchetype[] = Object.freeze([
  {
    id: 'score-band',
    label: 'Score-band assessment',
    summary:
      'A total score maps to 3–5 ordered level bands. Simplest scoring shape; good for single-dimension problems.',
    status: 'planned',
    compatibleScoringTemplateIds: ['total-score-to-levels', 'hybrid-score-and-flags'],
  },
  {
    id: 'axis-profile',
    label: 'Axis / score-profile assessment',
    summary:
      'Answers map onto multiple axes; a profile or decision tree over the axis bands selects the result. Gut Check is the reference instance.',
    status: 'available',
    compatibleScoringTemplateIds: ['axis-scores-to-profile', 'hybrid-score-and-flags'],
    referenceAssessmentType: 'gut-check',
  },
  {
    id: 'persona-category',
    label: 'Persona / category quiz',
    summary:
      'Category tallies route to a persona or archetype label. Lightweight, shareable, less clinical framing.',
    status: 'planned',
    compatibleScoringTemplateIds: ['category-tally-to-persona'],
  },
  {
    id: 'readiness-audit',
    label: 'Readiness audit',
    summary:
      'Criteria-based audit that decides ready / needs-work / not-ready before a prospect starts a program or protocol.',
    status: 'planned',
    compatibleScoringTemplateIds: ['threshold-risk-flags', 'total-score-to-levels'],
  },
  {
    id: 'risk-triage',
    label: 'Risk / triage screener',
    summary:
      'Flags and thresholds triage a prospect to a risk band or a "talk to a clinician / not a self-led tool" outcome. Not a diagnosis.',
    status: 'planned',
    compatibleScoringTemplateIds: ['threshold-risk-flags'],
  },
  {
    id: 'habit-audit',
    label: 'Habit / behavior audit',
    summary:
      'Frequency-based audit of current habits (meal rhythm, protein, sugar, sleep-adjacent) producing a pattern snapshot.',
    status: 'planned',
    compatibleScoringTemplateIds: ['total-score-to-levels', 'category-tally-to-persona'],
  },
  {
    id: 'recommendation-routing',
    label: 'Recommendation-routing assessment',
    summary:
      'Answer patterns route to a recommended next step (program, offer, or "talk to us") instead of a diagnostic level.',
    status: 'planned',
    compatibleScoringTemplateIds: ['recommendation-routing'],
  },
  {
    id: 'program-fit',
    label: 'Program / product fit quiz',
    summary:
      'Specialized recommendation-routing quiz that maps prospect signals to a specific Fine Diet program or offer.',
    status: 'planned',
    compatibleScoringTemplateIds: ['recommendation-routing', 'category-tally-to-persona'],
  },
  {
    id: 'progress-checkin',
    label: 'Progress / check-in assessment',
    summary:
      'Compares a current snapshot to a prior baseline to produce a progress band. Requires saved prior submission context.',
    status: 'planned',
    compatibleScoringTemplateIds: ['progress-delta', 'total-score-to-levels'],
  },
]);

// ---------------------------------------------------------------------------
// Scoring template data
// ---------------------------------------------------------------------------

export const SCORING_TEMPLATES: readonly ScoringTemplate[] = Object.freeze([
  {
    id: 'total-score-to-levels',
    label: 'Total score → level bands',
    summary:
      'Sum option values across questions, map the total to 3–5 ordered level bands via thresholds.',
    outputKind: 'level-bands',
    status: 'planned',
    applicableArchetypeIds: [
      'score-band',
      'readiness-audit',
      'habit-audit',
      'progress-checkin',
    ],
  },
  {
    id: 'axis-scores-to-profile',
    label: 'Axis scores → profile / level',
    summary:
      'Score per axis, band each axis, resolve a profile or level via a decision tree. Gut Check uses this template.',
    outputKind: 'axis-profile',
    status: 'available',
    applicableArchetypeIds: ['axis-profile'],
  },
  {
    id: 'category-tally-to-persona',
    label: 'Category tally → persona',
    summary:
      'Tally which category each answer belongs to; highest-tally category becomes the persona label.',
    outputKind: 'persona',
    status: 'planned',
    applicableArchetypeIds: [
      'persona-category',
      'habit-audit',
      'program-fit',
    ],
  },
  {
    id: 'threshold-risk-flags',
    label: 'Threshold / risk flags',
    summary:
      'Individual answer thresholds raise risk flags; the flag set determines a triage band, not a numeric score.',
    outputKind: 'risk-flags',
    status: 'planned',
    applicableArchetypeIds: ['risk-triage', 'readiness-audit'],
  },
  {
    id: 'recommendation-routing',
    label: 'Answer pattern → recommendation set',
    summary:
      'Answer patterns route to a recommendation set (program / offer / next step). No diagnostic level is produced.',
    outputKind: 'recommendation-set',
    status: 'planned',
    applicableArchetypeIds: [
      'recommendation-routing',
      'program-fit',
    ],
  },
  {
    id: 'hybrid-score-and-flags',
    label: 'Hybrid: score band + flag overrides',
    summary:
      'A base score band is overridden by risk flags (e.g. elevate a band when a safety flag fires). Most complex template; not the first to build.',
    outputKind: 'level-bands',
    status: 'planned',
    applicableArchetypeIds: ['score-band', 'axis-profile'],
  },
  {
    id: 'progress-delta',
    label: 'Progress delta vs baseline',
    summary:
      'Compare current answers to a saved prior snapshot; the delta maps to a progress band (regressed / stable / advanced).',
    outputKind: 'progress-band',
    status: 'not-implemented',
    applicableArchetypeIds: ['progress-checkin'],
  },
]);

// ---------------------------------------------------------------------------
// Creation workflow data
// ---------------------------------------------------------------------------

export const CREATION_WORKFLOW_STAGES: readonly CreationWorkflowStage[] = Object.freeze([
  {
    id: 'choose-problem-point',
    order: 1,
    label: 'Choose a problem point',
    description:
      'Pick the Fine Diet prospect problem point this assessment addresses, from the taxonomy. Grounds the assessment in a real program pathway.',
    status: 'available',
    notes:
      'Taxonomy is code-owned in lib/assessments/assessmentFactory.ts. Admins can read it on /admin/assessments; selecting one for a new assessment is a planning step today, not a self-serve pick.',
  },
  {
    id: 'choose-archetype',
    order: 2,
    label: 'Choose an archetype',
    description:
      'Pick the reusable assessment shape (score-band, axis-profile, persona quiz, readiness audit, etc.) that fits the problem point.',
    status: 'available',
    notes:
      'Archetypes are code-owned metadata. Each problem point lists suggested archetypes. Wiring a non-Gut-Check archetype still requires engineering (scoring engine + results template work).',
  },
  {
    id: 'choose-scoring-template',
    order: 3,
    label: 'Choose a scoring template',
    description:
      'Pick the scoring template that maps answers to a result, compatible with the chosen archetype.',
    status: 'planned',
    notes:
      'Templates are metadata only. A scoring-template selector and a generalized scoring-rule engine are NOT built. Only the Gut Check axis template is implemented today.',
  },
  {
    id: 'author-questions',
    order: 4,
    label: 'Author questions',
    description:
      'Author the question set (sections, questions, options, option values) in the CMS via the structured authoring UI.',
    status: 'available',
    availableAtHref: '/admin/question-sets/author',
    notes:
      'Packet H authoring UI is available for declared assessments. The v2 question schema currently assumes 4 options/question with values 0–3, which fits score-band and axis-profile templates.',
  },
  {
    id: 'map-outcomes',
    order: 5,
    label: 'Map outcomes',
    description:
      'Map each result level / persona / recommendation to a results pack and a downstream CTA (program, offer, or "talk to us").',
    status: 'planned',
    notes:
      'A generalized outcome builder UI is NOT built. Gut Check maps levels to results packs manually via /admin/results-packs. Non-level outcomes (persona, recommendation-set) have no authoring UI yet.',
  },
  {
    id: 'preview-artifacts',
    order: 6,
    label: 'Preview artifacts',
    description:
      'Preview the question set, results packs, and downstream artifacts before publishing, including a forced-result preview per outcome.',
    status: 'manual-review',
    availableAtHref: '/admin/results-packs',
    notes:
      'Question-set preview, results-pack preview, and runtime ?preview=1 exist for Gut Check. A generalized forced-result preview (render a specific outcome on demand) is NOT implemented and is the recommended pre-build step for a second assessment.',
  },
  {
    id: 'publish-readiness',
    order: 7,
    label: 'Publish readiness',
    description:
      'Confirm the operations contract + readiness checklist pass before exposing the assessment on the public route.',
    status: 'available',
    availableAtHref: '/admin/assessments',
    notes:
      'Packet I readiness checklist is rendered on /admin/assessments for every assessment that declares an operations contract. Publishing itself remains admin-only via the question-set / results-pack pointer endpoints.',
  },
]);

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** All problem points in stable insertion order. */
export function listProblemPoints(): ProblemPoint[] {
  return [...PROBLEM_POINTS];
}

/** Look up a problem point by id. */
export function getProblemPoint(id: string | null | undefined): ProblemPoint | undefined {
  if (!id) return undefined;
  return PROBLEM_POINTS.find((p) => p.id === id);
}

/** All archetypes in stable insertion order. */
export function listArchetypes(): AssessmentArchetype[] {
  return [...ASSESSMENT_ARCHETYPES];
}

/** Look up an archetype by id. */
export function getArchetype(id: string | null | undefined): AssessmentArchetype | undefined {
  if (!id) return undefined;
  return ASSESSMENT_ARCHETYPES.find((a) => a.id === id);
}

/** All scoring templates in stable insertion order. */
export function listScoringTemplates(): ScoringTemplate[] {
  return [...SCORING_TEMPLATES];
}

/** Look up a scoring template by id. */
export function getScoringTemplate(
  id: string | null | undefined
): ScoringTemplate | undefined {
  if (!id) return undefined;
  return SCORING_TEMPLATES.find((t) => t.id === id);
}

/** All creation workflow stages, ordered by `order`. */
export function listCreationWorkflowStages(): CreationWorkflowStage[] {
  return [...CREATION_WORKFLOW_STAGES].sort((a, b) => a.order - b.order);
}

// ---------------------------------------------------------------------------
// Factory model resolution (joins with the operations contract)
// ---------------------------------------------------------------------------

/**
 * Resolve the factory model for a registered assessment by reading its
 * operations contract's `factoryModel` declaration. Returns null when the
 * assessment has no contract or the contract does not declare factory
 * coordinates.
 */
export function getFactoryModelForAssessmentType(
  assessmentType: string | null | undefined
): AssessmentFactoryModel | null {
  const contract = getOperationsContract(assessmentType);
  if (!contract?.factoryModel) return null;
  const fm = contract.factoryModel;
  return {
    assessmentType: contract.assessmentType,
    problemPointId: fm.problemPointId,
    archetypeId: fm.archetypeId,
    scoringTemplateId: fm.scoringTemplateId,
    plannedExtendsToProblemPointIds: fm.plannedExtendsToProblemPointIds,
  };
}

/**
 * All declared factory models, in operations-contract insertion order. Used to
 * render the "registered assessments as factory instances" view on
 * /admin/assessments.
 */
export function listFactoryModels(): AssessmentFactoryModel[] {
  const out: AssessmentFactoryModel[] = [];
  for (const type of REGISTERED_ASSESSMENT_TYPES) {
    const fm = getFactoryModelForAssessmentType(type);
    if (fm) out.push(fm);
  }
  return out;
}

/**
 * Registered assessment types that declare a contract. Kept in a small,
 * explicit list (instead of importing the registry) to avoid a circular
 * import and to stay focused on assessments that carry an operations
 * contract. Today this is Gut Check only.
 */
const REGISTERED_ASSESSMENT_TYPES: AssessmentType[] = ['gut-check'];

// ---------------------------------------------------------------------------
// Integrity validation (pure; exported for tests + module-load invariant)
// ---------------------------------------------------------------------------

export interface FactoryIntegrityViolation {
  kind:
    | 'duplicate-problem-point-id'
    | 'duplicate-archetype-id'
    | 'duplicate-scoring-template-id'
    | 'duplicate-stage-id'
    | 'archetype-missing-template'
    | 'template-missing-archetype'
    | 'problem-point-missing-archetype'
    | 'problem-point-missing-template'
    | 'stage-order-gap'
    | 'stage-duplicate-order';
  detail: string;
}

/**
 * Validate the factory metadata for internal consistency:
 *   - unique ids across problem points, archetypes, templates, stages;
 *   - every archetype's compatible templates exist and reference it back;
 *   - every template's applicable archetypes exist and reference it back;
 *   - every problem point's suggested archetypes/templates exist;
 *   - creation workflow stages have contiguous, unique 1-based order.
 *
 * Returns the list of violations (empty when healthy). Throws in
 * non-production environments when violations exist, mirroring the registry
 * invariant pattern. Skipped under jest so module-load side effects do not
 * leak across test files.
 */
export function validateFactoryIntegrity(): FactoryIntegrityViolation[] {
  const violations: FactoryIntegrityViolation[] = [];

  // Unique ids.
  const seenProblemPoint = new Set<string>();
  const seenArchetype = new Set<string>();
  const seenTemplate = new Set<string>();
  const seenStage = new Set<string>();
  for (const p of PROBLEM_POINTS) {
    if (seenProblemPoint.has(p.id)) {
      violations.push({
        kind: 'duplicate-problem-point-id',
        detail: p.id,
      });
    } else {
      seenProblemPoint.add(p.id);
    }
  }
  for (const a of ASSESSMENT_ARCHETYPES) {
    if (seenArchetype.has(a.id)) {
      violations.push({ kind: 'duplicate-archetype-id', detail: a.id });
    } else {
      seenArchetype.add(a.id);
    }
  }
  for (const t of SCORING_TEMPLATES) {
    if (seenTemplate.has(t.id)) {
      violations.push({ kind: 'duplicate-scoring-template-id', detail: t.id });
    } else {
      seenTemplate.add(t.id);
    }
  }
  for (const s of CREATION_WORKFLOW_STAGES) {
    if (seenStage.has(s.id)) {
      violations.push({ kind: 'duplicate-stage-id', detail: s.id });
    } else {
      seenStage.add(s.id);
    }
  }

  // Archetype <-> template bidirectional consistency.
  for (const a of ASSESSMENT_ARCHETYPES) {
    for (const templateId of a.compatibleScoringTemplateIds) {
      const t = getScoringTemplate(templateId);
      if (!t) {
        violations.push({
          kind: 'archetype-missing-template',
          detail: `${a.id} → missing template ${templateId}`,
        });
        continue;
      }
      if (!t.applicableArchetypeIds.includes(a.id)) {
        violations.push({
          kind: 'template-missing-archetype',
          detail: `template ${t.id} does not list archetype ${a.id}`,
        });
      }
    }
  }
  for (const t of SCORING_TEMPLATES) {
    for (const archetypeId of t.applicableArchetypeIds) {
      const a = getArchetype(archetypeId);
      if (!a) {
        violations.push({
          kind: 'template-missing-archetype',
          detail: `${t.id} → missing archetype ${archetypeId}`,
        });
        continue;
      }
      if (!a.compatibleScoringTemplateIds.includes(t.id)) {
        violations.push({
          kind: 'archetype-missing-template',
          detail: `archetype ${a.id} does not list template ${t.id}`,
        });
      }
    }
  }

  // Problem point suggested archetypes/templates exist.
  for (const p of PROBLEM_POINTS) {
    for (const archetypeId of p.suggestedArchetypeIds) {
      if (!getArchetype(archetypeId)) {
        violations.push({
          kind: 'problem-point-missing-archetype',
          detail: `${p.id} → missing archetype ${archetypeId}`,
        });
      }
    }
    for (const templateId of p.suggestedScoringTemplateIds) {
      if (!getScoringTemplate(templateId)) {
        violations.push({
          kind: 'problem-point-missing-template',
          detail: `${p.id} → missing template ${templateId}`,
        });
      }
    }
  }

  // Creation workflow stages: contiguous, unique 1-based order.
  const orders = [...CREATION_WORKFLOW_STAGES]
    .map((s) => s.order)
    .sort((a, b) => a - b);
  const orderSet = new Set<number>();
  for (const order of orders) {
    if (orderSet.has(order)) {
      violations.push({ kind: 'stage-duplicate-order', detail: `order ${order}` });
    }
    orderSet.add(order);
  }
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) {
      violations.push({
        kind: 'stage-order-gap',
        detail: `expected ${i + 1}, found ${orders[i]}`,
      });
      break;
    }
  }

  if (violations.length > 0 && process.env.NODE_ENV !== 'production') {
    const msg = `[assessmentFactory] Integrity violations: ${JSON.stringify(violations)}`;
    if (!process.env.JEST_WORKER_ID) {
      throw new Error(msg);
    }
  }
  return violations;
}

if (!process.env.JEST_WORKER_ID) {
  validateFactoryIntegrity();
}

// ---------------------------------------------------------------------------
// Factory readiness summary (for the admin surface)
// ---------------------------------------------------------------------------

export interface FactoryReadinessSummary {
  problemPoints: { total: number; available: number; planned: number };
  archetypes: { total: number; available: number; planned: number };
  scoringTemplates: {
    total: number;
    available: number;
    planned: number;
    notImplemented: number;
  };
  creationStages: {
    total: number;
    available: number;
    planned: number;
    manualReview: number;
    notImplemented: number;
  };
  registeredFactoryInstances: number;
}

/**
 * Honest roll-up of factory capability status, for the /admin/assessments
 * readiness header. Counts use the honest `FactoryCapabilityStatus` of each
 * item — nothing is inflated.
 */
export function summarizeFactoryReadiness(): FactoryReadinessSummary {
  const countBy = <T extends { status: FactoryCapabilityStatus }>(items: readonly T[]) => {
    const acc: Record<FactoryCapabilityStatus, number> = {
      available: 0,
      planned: 0,
      'manual-review': 0,
      'not-implemented': 0,
    };
    for (const item of items) acc[item.status]++;
    return acc;
  };

  const pp = countBy(PROBLEM_POINTS);
  const ar = countBy(ASSESSMENT_ARCHETYPES);
  const st = countBy(SCORING_TEMPLATES);
  const cs = countBy(CREATION_WORKFLOW_STAGES);

  return {
    problemPoints: {
      total: PROBLEM_POINTS.length,
      available: pp.available,
      planned: pp.planned,
    },
    archetypes: {
      total: ASSESSMENT_ARCHETYPES.length,
      available: ar.available,
      planned: ar.planned,
    },
    scoringTemplates: {
      total: SCORING_TEMPLATES.length,
      available: st.available,
      planned: st.planned,
      notImplemented: st['not-implemented'],
    },
    creationStages: {
      total: CREATION_WORKFLOW_STAGES.length,
      available: cs.available,
      planned: cs.planned,
      manualReview: cs['manual-review'],
      notImplemented: cs['not-implemented'],
    },
    registeredFactoryInstances: listFactoryModels().length,
  };
}
