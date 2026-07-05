/**
 * Assessment Creation Wizard v1 (Packet L)
 *
 * Pure, code-owned, testable helpers that turn the Packet J/K factory metadata
 * into an interactive *planning* flow on `/admin/assessments/create`.
 *
 * What this module does:
 *   - hold a non-persistent wizard draft state (problem point, archetype,
 *     scoring template, optional planned concept prefill, working title,
 *     intended use),
 *   - prefill the draft from an existing planned concept (by id, including
 *     a `?concept=` query-param friendly path),
 *   - filter archetypes/scoring templates by compatibility with the current
 *     draft,
 *   - validate the draft (warnings + errors) using the factory + creation-plan
 *     metadata as the single source of truth,
 *   - track step completion,
 *   - generate a copyable planning/engineering handoff (Markdown + JSON-like).
 *
 * What this module deliberately does NOT do:
 *   - persist anything (no DB write, no row, no draft table),
 *   - register an assessment in `ASSESSMENT_REGISTRY`,
 *   - add or imply a public route,
 *   - execute scoring,
 *   - build an outcome builder UI or a generalized scoring-rule engine,
 *   - change Gut Check scoring/runtime/results/email/webhook/claim behavior.
 *
 * Every draft is treated as planning-only. `isDraftLive()` always returns
 * `false`, `isDraftPersisted()` always returns `false`, and the handoff output
 * says so explicitly so an admin can never mistake the wizard output for a
 * live/registered/public assessment.
 */

import {
  listProblemPoints,
  listArchetypes,
  listScoringTemplates,
  getProblemPoint,
  getArchetype,
  getScoringTemplate,
  type ProblemPoint,
  type AssessmentArchetype,
  type ScoringTemplate,
} from '@/lib/assessments/assessmentFactory';
import {
  getPlannedAssessmentConcept,
  listPlannedConceptsForProblemPoint,
  listActivationChecklistSteps,
  listActivationStepsByOwnership,
  getOwnershipSplitForConcept,
  isPlannedConceptLive,
  isPlannedConceptPersisted,
  type PlannedAssessmentConcept,
  type AssessmentActivationStep,
  type AssessmentCreationOwnership,
} from '@/lib/assessments/assessmentCreationPlan';

// ---------------------------------------------------------------------------
// Wizard steps
// ---------------------------------------------------------------------------

/**
 * Ordered wizard steps. These map onto the activation checklist's admin-owned
 * planning stages plus review/handoff. They are planning steps only — none of
 * them mutate state outside the in-memory draft.
 */
export const WIZARD_STEPS = [
  'choose-problem-point',
  'choose-concept',
  'choose-archetype',
  'choose-scoring-template',
  'review-compatibility',
  'review-admin-fields',
  'review-engineering-fields',
  'review-activation-checklist',
  'generate-handoff',
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number];

export const WIZARD_STEP_LABELS: Record<WizardStepId, string> = {
  'choose-problem-point': 'Choose a problem point',
  'choose-concept': 'Choose a planned concept or draft blank',
  'choose-archetype': 'Choose an archetype',
  'choose-scoring-template': 'Choose a scoring template',
  'review-compatibility': 'Review compatibility',
  'review-admin-fields': 'Review admin-owned fields',
  'review-engineering-fields': 'Review engineering-owned fields',
  'review-activation-checklist': 'Review activation checklist',
  'generate-handoff': 'Generate planning handoff',
};

// ---------------------------------------------------------------------------
// Draft state
// ---------------------------------------------------------------------------

/**
 * The in-memory, non-persistent wizard draft. All fields are admin-authored
 * planning inputs. None of them imply a live/registered/public assessment.
 */
export interface WizardDraft {
  /** Optional working title — planning label only, not public branding. */
  workingTitle: string;
  /** Optional intended use / audience, plain language. */
  intendedUse: string;
  /** Selected problem point id (must exist in PROBLEM_POINTS), or null. */
  problemPointId: string | null;
  /** Selected archetype id (must exist in ASSESSMENT_ARCHETYPES), or null. */
  archetypeId: string | null;
  /** Selected scoring template id (must exist in SCORING_TEMPLATES), or null. */
  scoringTemplateId: string | null;
  /**
   * Optional planned concept id used to prefill the draft. Stored so the
   * handoff can reference it. The concept itself remains planning-only.
   */
  plannedConceptId: string | null;
}

/** An empty, blank wizard draft. */
export function createEmptyDraft(): WizardDraft {
  return {
    workingTitle: '',
    intendedUse: '',
    problemPointId: null,
    archetypeId: null,
    scoringTemplateId: null,
    plannedConceptId: null,
  };
}

// ---------------------------------------------------------------------------
// Prefill from a planned concept
// ---------------------------------------------------------------------------

/**
 * The result of attempting to prefill a draft from a planned concept id.
 * `ok: false` means the concept id was unknown/invalid; the caller should
 * start blank (and may surface a friendly notice).
 */
export interface PrefillResult {
  ok: boolean;
  draft: WizardDraft;
  /** The concept id that was requested, for display even on failure. */
  requestedConceptId: string;
  /** Populated when ok is false, explaining why prefill fell back to blank. */
  fallbackReason?: string;
}

/**
 * Prefill a wizard draft from an existing planned assessment concept.
 *
 * Unknown/invalid concept ids fail gracefully: the returned draft is blank
 * (no crash) and `ok` is `false` with a `fallbackReason`. This is the path
 * used by `/admin/assessments/create?concept=<id>` so a bad link never breaks
 * the page.
 *
 * Prefilling never marks the draft live/persisted — it only copies the
 * planning fields (problem point, archetype, scoring template, working title,
 * intended use).
 */
export function prefillDraftFromConcept(
  conceptId: string | null | undefined,
  base: WizardDraft = createEmptyDraft()
): PrefillResult {
  const requestedConceptId = conceptId ?? '';
  if (!conceptId) {
    return { ok: false, draft: base, requestedConceptId, fallbackReason: 'No concept id provided.' };
  }
  const concept = getPlannedAssessmentConcept(conceptId);
  if (!concept) {
    return {
      ok: false,
      draft: base,
      requestedConceptId,
      fallbackReason: `Unknown concept "${conceptId}". Starting a blank draft.`,
    };
  }

  const draft: WizardDraft = {
    workingTitle: concept.workingTitle,
    intendedUse: concept.intendedUse,
    problemPointId: concept.problemPointId,
    archetypeId: concept.archetypeId,
    scoringTemplateId: concept.scoringTemplateId,
    plannedConceptId: concept.id,
  };
  return { ok: true, draft, requestedConceptId };
}

// ---------------------------------------------------------------------------
// Compatibility filtering
// ---------------------------------------------------------------------------

/**
 * Archetypes compatible with a chosen problem point. When a problem point is
 * selected, returns its suggested archetypes; when none is selected, returns
 * all archetypes (the admin can still browse).
 */
export function listArchetypesForDraft(draft: WizardDraft): AssessmentArchetype[] {
  if (!draft.problemPointId) return listArchetypes();
  const pp = getProblemPoint(draft.problemPointId);
  if (!pp) return [];
  return pp.suggestedArchetypeIds
    .map((id) => getArchetype(id))
    .filter((a): a is AssessmentArchetype => Boolean(a));
}

/**
 * Scoring templates compatible with the draft's chosen archetype. When an
 * archetype is selected, returns only the archetype's compatible templates
 * (optionally intersected with the problem point's suggested templates when
 * both are set). When no archetype is selected but a problem point is, returns
 * the problem point's suggested templates. When neither is set, returns all.
 */
export function listScoringTemplatesForDraft(draft: WizardDraft): ScoringTemplate[] {
  if (draft.archetypeId) {
    const archetype = getArchetype(draft.archetypeId);
    if (!archetype) return [];
    let templateIds = archetype.compatibleScoringTemplateIds;
    if (draft.problemPointId) {
      const pp = getProblemPoint(draft.problemPointId);
      if (pp) {
        const suggested = new Set(pp.suggestedScoringTemplateIds);
        const intersect = templateIds.filter((id) => suggested.has(id));
        // Fall back to the full compatible list if the intersection is empty —
        // never block an admin from a valid archetype/template pair just
        // because the problem point didn't suggest it.
        templateIds = intersect.length > 0 ? intersect : templateIds;
      }
    }
    return templateIds
      .map((id) => getScoringTemplate(id))
      .filter((t): t is ScoringTemplate => Boolean(t));
  }
  if (draft.problemPointId) {
    const pp = getProblemPoint(draft.problemPointId);
    if (!pp) return [];
    return pp.suggestedScoringTemplateIds
      .map((id) => getScoringTemplate(id))
      .filter((t): t is ScoringTemplate => Boolean(t));
  }
  return listScoringTemplates();
}

/**
 * True when the draft's archetype and scoring template are a valid
 * (declared-compatible) pair per the factory metadata. Used to gate the
 * compatibility review step and the handoff generation.
 */
export function isArchetypeTemplateCompatible(draft: WizardDraft): boolean {
  if (!draft.archetypeId || !draft.scoringTemplateId) return false;
  const archetype = getArchetype(draft.archetypeId);
  const template = getScoringTemplate(draft.scoringTemplateId);
  if (!archetype || !template) return false;
  return archetype.compatibleScoringTemplateIds.includes(template.id);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationSeverity = 'error' | 'warning';

export interface WizardValidationIssue {
  severity: ValidationSeverity;
  step: WizardStepId | 'general';
  message: string;
}

export interface WizardValidationResult {
  issues: WizardValidationIssue[];
  errors: WizardValidationIssue[];
  warnings: WizardValidationIssue[];
  /** True when the draft is complete enough to generate a handoff. */
  canGenerateHandoff: boolean;
}

/**
 * Validate the wizard draft against the factory + creation-plan metadata.
 *
 * `error` issues block handoff generation (missing required selections or an
 * incompatible archetype/template pair). `warning` issues do not block but
 * should be surfaced (e.g. a chosen template is still `planned`, or a
 * planned concept prefill was lost because the admin changed the problem
 * point).
 */
export function validateDraft(draft: WizardDraft): WizardValidationResult {
  const issues: WizardValidationIssue[] = [];

  if (!draft.problemPointId) {
    issues.push({
      severity: 'error',
      step: 'choose-problem-point',
      message: 'Choose a problem point before generating a handoff.',
    });
  } else if (!getProblemPoint(draft.problemPointId)) {
    issues.push({
      severity: 'error',
      step: 'choose-problem-point',
      message: `Unknown problem point "${draft.problemPointId}".`,
    });
  }

  if (!draft.archetypeId) {
    issues.push({
      severity: 'error',
      step: 'choose-archetype',
      message: 'Choose an archetype before generating a handoff.',
    });
  } else if (!getArchetype(draft.archetypeId)) {
    issues.push({
      severity: 'error',
      step: 'choose-archetype',
      message: `Unknown archetype "${draft.archetypeId}".`,
    });
  }

  if (!draft.scoringTemplateId) {
    issues.push({
      severity: 'error',
      step: 'choose-scoring-template',
      message: 'Choose a scoring template before generating a handoff.',
    });
  } else if (!getScoringTemplate(draft.scoringTemplateId)) {
    issues.push({
      severity: 'error',
      step: 'choose-scoring-template',
      message: `Unknown scoring template "${draft.scoringTemplateId}".`,
    });
  }

  // Compatibility check (only when both are set + valid).
  if (
    draft.archetypeId &&
    draft.scoringTemplateId &&
    getArchetype(draft.archetypeId) &&
    getScoringTemplate(draft.scoringTemplateId)
  ) {
    if (!isArchetypeTemplateCompatible(draft)) {
      issues.push({
        severity: 'error',
        step: 'review-compatibility',
        message: `Archetype "${draft.archetypeId}" is not compatible with scoring template "${draft.scoringTemplateId}".`,
      });
    }
  }

  // Honest-status warnings (do not block).
  if (draft.scoringTemplateId) {
    const template = getScoringTemplate(draft.scoringTemplateId);
    if (template && template.status !== 'available') {
      issues.push({
        severity: 'warning',
        step: 'choose-scoring-template',
        message: `Scoring template "${template.label}" is ${template.status} — activation still requires engineering.`,
      });
    }
  }
  if (draft.archetypeId) {
    const archetype = getArchetype(draft.archetypeId);
    if (archetype && archetype.status !== 'available') {
      issues.push({
        severity: 'warning',
        step: 'choose-archetype',
        message: `Archetype "${archetype.label}" is ${archetype.status} — wiring it still requires engineering.`,
      });
    }
  }
  if (!draft.workingTitle.trim()) {
    issues.push({
      severity: 'warning',
      step: 'choose-concept',
      message: 'No working title set. A working title makes the handoff easier to reference.',
    });
  }
  if (!draft.intendedUse.trim()) {
    issues.push({
      severity: 'warning',
      step: 'choose-concept',
      message: 'No intended use set. Describing the audience/use makes the handoff clearer.',
    });
  }

  // Prefill drift warning: a planned concept was selected but the admin
  // changed selections away from the concept's coordinates.
  if (draft.plannedConceptId) {
    const concept = getPlannedAssessmentConcept(draft.plannedConceptId);
    if (concept) {
      const drifted: string[] = [];
      if (draft.problemPointId && draft.problemPointId !== concept.problemPointId) {
        drifted.push('problem point');
      }
      if (draft.archetypeId && draft.archetypeId !== concept.archetypeId) {
        drifted.push('archetype');
      }
      if (draft.scoringTemplateId && draft.scoringTemplateId !== concept.scoringTemplateId) {
        drifted.push('scoring template');
      }
      if (drifted.length > 0) {
        issues.push({
          severity: 'warning',
          step: 'choose-concept',
          message: `Selections drifted from planned concept "${concept.id}" (${drifted.join(', ')}). The handoff will record the current selections, not the concept defaults.`,
        });
      }
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return {
    issues,
    errors,
    warnings,
    canGenerateHandoff: errors.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Step completion
// ---------------------------------------------------------------------------

/**
 * Which wizard steps are complete given the current draft. A step is complete
 * when the selections it depends on are present and (where applicable) valid.
 */
export function computeStepCompletion(
  draft: WizardDraft
): Record<WizardStepId, boolean> {
  const valid = validateDraft(draft);
  return {
    'choose-problem-point': Boolean(draft.problemPointId && getProblemPoint(draft.problemPointId)),
    'choose-concept': Boolean(
      draft.plannedConceptId || draft.workingTitle.trim() || draft.intendedUse.trim()
    ),
    'choose-archetype': Boolean(draft.archetypeId && getArchetype(draft.archetypeId)),
    'choose-scoring-template': Boolean(
      draft.scoringTemplateId && getScoringTemplate(draft.scoringTemplateId)
    ),
    'review-compatibility': isArchetypeTemplateCompatible(draft),
    'review-admin-fields': valid.canGenerateHandoff,
    'review-engineering-fields': valid.canGenerateHandoff,
    'review-activation-checklist': valid.canGenerateHandoff,
    'generate-handoff': valid.canGenerateHandoff,
  };
}

// ---------------------------------------------------------------------------
// Honest predicates (used by UI + tests)
// ---------------------------------------------------------------------------

/** A wizard draft is never live. Always returns false. */
export function isDraftLive(): boolean {
  return false;
}

/** A wizard draft is never persisted. Always returns false. */
export function isDraftPersisted(): boolean {
  return false;
}

// ---------------------------------------------------------------------------
// Handoff generation
// ---------------------------------------------------------------------------

/**
 * The structured, copyable handoff payload. This is what the wizard emits for
 * an admin to paste into an engineering ticket / doc. It is metadata-only and
 * explicitly labelled planning-only.
 */
export interface WizardHandoff {
  /** Always false — the draft is not live. */
  live: boolean;
  /** Always false — the draft is not persisted. */
  persisted: boolean;
  /** Always false — the draft has no registry entry. */
  registered: boolean;
  /** Always false — no public route exists. */
  hasPublicRoute: boolean;
  workingTitle: string;
  plannedConceptId: string | null;
  intendedUse: string;
  problemPoint: { id: string; label: string } | null;
  archetype: { id: string; label: string; status: string } | null;
  scoringTemplate: { id: string; label: string; status: string } | null;
  compatibilityOk: boolean;
  adminOwnedFields: { field: string; label: string; status: string; availableAtHref?: string }[];
  engineeringOwnedFields: {
    field: string;
    label: string;
    status: string;
    availableAtHref?: string;
  }[];
  sharedFields: { field: string; label: string; status: string; availableAtHref?: string }[];
  activationChecklist: {
    id: string;
    order: number;
    label: string;
    ownership: AssessmentCreationOwnership;
    status: string;
  }[];
  /** Activation step ids that block activation for the chosen planned concept, if any. */
  blockers: { id: string; label: string; ownership: AssessmentCreationOwnership }[];
  guardrails: string[];
  recommendedNextAction: string;
}

/**
 * Build the structured handoff payload from a validated draft. Returns null
 * when the draft is not ready (caller should call `validateDraft` first).
 *
 * The ownership split comes from the creation plan: when a planned concept is
 * selected, its per-concept split is used; otherwise the activation checklist
 * grouped by ownership is used as the generic split.
 */
export function buildHandoff(draft: WizardDraft): WizardHandoff | null {
  const validation = validateDraft(draft);
  if (!validation.canGenerateHandoff) return null;

  const problemPoint = draft.problemPointId ? getProblemPoint(draft.problemPointId) : null;
  const archetype = draft.archetypeId ? getArchetype(draft.archetypeId) : null;
  const template = draft.scoringTemplateId ? getScoringTemplate(draft.scoringTemplateId) : null;
  const concept = draft.plannedConceptId
    ? getPlannedAssessmentConcept(draft.plannedConceptId)
    : null;

  const checklist = listActivationChecklistSteps();

  let adminFields: WizardHandoff['adminOwnedFields'];
  let engineeringFields: WizardHandoff['engineeringOwnedFields'];
  let sharedFields: WizardHandoff['sharedFields'];
  if (concept) {
    const split = getOwnershipSplitForConcept(concept.id);
    adminFields = split.adminOwned.map((f) => ({
      field: f.field,
      label: f.label,
      status: f.status,
      availableAtHref: f.availableAtHref,
    }));
    engineeringFields = split.engineeringOwned.map((f) => ({
      field: f.field,
      label: f.label,
      status: f.status,
      availableAtHref: f.availableAtHref,
    }));
    sharedFields = split.shared.map((f) => ({
      field: f.field,
      label: f.label,
      status: f.status,
      availableAtHref: f.availableAtHref,
    }));
  } else {
    const mapStep = (s: AssessmentActivationStep) => ({
      field: s.id,
      label: s.label,
      status: s.status,
      availableAtHref: s.availableAtHref,
    });
    adminFields = listActivationStepsByOwnership('admin').map(mapStep);
    engineeringFields = listActivationStepsByOwnership('engineering').map(mapStep);
    sharedFields = listActivationStepsByOwnership('shared').map(mapStep);
  }

  const blockers = (concept?.activationBlockerStepIds ?? [])
    .map((id) => {
      const step = checklist.find((s) => s.id === id);
      if (!step) return null;
      return { id: step.id, label: step.label, ownership: step.ownership };
    })
    .filter((b): b is { id: string; label: string; ownership: AssessmentCreationOwnership } =>
      Boolean(b)
    );

  const guardrails = [
    'Planning-only — not persisted, not live, not public, not registered.',
    'No public route exists for this planned concept.',
    'Do not add a registry entry until engineering activates scoring dispatch and routes.',
    'Do not change Gut Check scoring/runtime/results/email/webhook/claim behavior.',
    'Activation requires engineering for registry, scoring dispatch, public route, and artifact coverage.',
  ];

  const recommendedNextAction = concept
    ? `Hand this plan to engineering to begin the activation checklist for planned concept "${concept.id}". The first engineering step is assessment-type-keyed scoring dispatch.`
    : `Hand this plan to engineering to review the chosen archetype/template pair and begin the activation checklist. The first engineering step is assessment-type-keyed scoring dispatch.`;

  return {
    live: false,
    persisted: false,
    registered: false,
    hasPublicRoute: false,
    workingTitle: draft.workingTitle.trim() || '(untitled planning draft)',
    plannedConceptId: draft.plannedConceptId,
    intendedUse: draft.intendedUse.trim(),
    problemPoint: problemPoint ? { id: problemPoint.id, label: problemPoint.label } : null,
    archetype: archetype
      ? { id: archetype.id, label: archetype.label, status: archetype.status }
      : null,
    scoringTemplate: template
      ? { id: template.id, label: template.label, status: template.status }
      : null,
    compatibilityOk: isArchetypeTemplateCompatible(draft),
    adminOwnedFields: adminFields,
    engineeringOwnedFields: engineeringFields,
    sharedFields: sharedFields,
    activationChecklist: checklist.map((s) => ({
      id: s.id,
      order: s.order,
      label: s.label,
      ownership: s.ownership,
      status: s.status,
    })),
    blockers,
    guardrails,
    recommendedNextAction,
  };
}

/**
 * Render the handoff as copyable Markdown for an admin to paste into a doc or
 * engineering ticket. Includes the explicit planning-only banner.
 */
export function renderHandoffMarkdown(handoff: WizardHandoff): string {
  const lines: string[] = [];
  lines.push('# Assessment Planning Handoff (Creation Wizard v1)');
  lines.push('');
  lines.push('> **PLANNING-ONLY.** Not persisted. Not live. Not public. Not registered.');
  lines.push('> Requires engineering to activate. No public route exists.');
  lines.push('');
  lines.push(`- **Working title:** ${handoff.workingTitle}`);
  if (handoff.plannedConceptId) {
    lines.push(`- **Planned concept:** \`${handoff.plannedConceptId}\``);
  } else {
    lines.push('- **Planned concept:** _none — blank draft_');
  }
  if (handoff.problemPoint) {
    lines.push(
      `- **Problem point:** ${handoff.problemPoint.label} (\`${handoff.problemPoint.id}\`)`
    );
  }
  if (handoff.archetype) {
    lines.push(
      `- **Archetype:** ${handoff.archetype.label} (\`${handoff.archetype.id}\`, status: ${handoff.archetype.status})`
    );
  }
  if (handoff.scoringTemplate) {
    lines.push(
      `- **Scoring template:** ${handoff.scoringTemplate.label} (\`${handoff.scoringTemplate.id}\`, status: ${handoff.scoringTemplate.status})`
    );
  }
  lines.push(`- **Archetype/template compatibility:** ${handoff.compatibilityOk ? 'ok' : 'NOT OK — fix before handoff'}`);
  if (handoff.intendedUse) {
    lines.push(`- **Intended use:** ${handoff.intendedUse}`);
  }
  lines.push('');

  lines.push('## Honest state');
  lines.push(`- live: ${handoff.live}`);
  lines.push(`- persisted: ${handoff.persisted}`);
  lines.push(`- registered: ${handoff.registered}`);
  lines.push(`- hasPublicRoute: ${handoff.hasPublicRoute}`);
  lines.push('');

  lines.push('## Admin-owned fields to complete');
  for (const f of handoff.adminOwnedFields) {
    lines.push(`- ${f.label} (\`${f.field}\`, status: ${f.status}${f.availableAtHref ? `, tool: ${f.availableAtHref}` : ''})`);
  }
  lines.push('');

  lines.push('## Engineering-owned activation steps');
  for (const f of handoff.engineeringOwnedFields) {
    lines.push(`- ${f.label} (\`${f.field}\`, status: ${f.status}${f.availableAtHref ? `, tool: ${f.availableAtHref}` : ''})`);
  }
  lines.push('');

  lines.push('## Shared steps');
  for (const f of handoff.sharedFields) {
    lines.push(`- ${f.label} (\`${f.field}\`, status: ${f.status}${f.availableAtHref ? `, tool: ${f.availableAtHref}` : ''})`);
  }
  lines.push('');

  if (handoff.blockers.length > 0) {
    lines.push('## Activation blockers (from planned concept)');
    for (const b of handoff.blockers) {
      lines.push(`- ${b.label} (\`${b.id}\`, owner: ${b.ownership})`);
    }
    lines.push('');
  }

  lines.push('## Full activation checklist');
  for (const s of handoff.activationChecklist) {
    lines.push(`${s.order}. ${s.label} (\`${s.id}\`, owner: ${s.ownership}, status: ${s.status})`);
  }
  lines.push('');

  lines.push('## Guardrails');
  for (const g of handoff.guardrails) {
    lines.push(`- ${g}`);
  }
  lines.push('');

  lines.push('## Recommended next action');
  lines.push(handoff.recommendedNextAction);
  lines.push('');
  return lines.join('\n');
}

/**
 * Render the handoff as copyable, JSON-like text (pretty-printed JSON). Useful
 * for pasting into an engineering ticket or a future import path. Metadata-only.
 */
export function renderHandoffJson(handoff: WizardHandoff): string {
  return JSON.stringify(handoff, null, 2);
}

/**
 * Convenience: validate the draft and, if ready, return the handoff plus the
 * markdown + json renderings. Returns null with the validation result when
 * the draft is not ready so the UI can show errors inline.
 */
export function generateHandoff(draft: WizardDraft): {
  validation: WizardValidationResult;
  handoff: WizardHandoff | null;
  markdown: string | null;
  json: string | null;
} {
  const validation = validateDraft(draft);
  if (!validation.canGenerateHandoff) {
    return { validation, handoff: null, markdown: null, json: null };
  }
  const handoff = buildHandoff(draft);
  if (!handoff) {
    return { validation, handoff: null, markdown: null, json: null };
  }
  return {
    validation,
    handoff,
    markdown: renderHandoffMarkdown(handoff),
    json: renderHandoffJson(handoff),
  };
}

// Re-exports for the wizard UI so it has a single import surface.
export {
  listProblemPoints,
  listPlannedConceptsForProblemPoint,
  listActivationChecklistSteps,
  listActivationStepsByOwnership,
  getPlannedAssessmentConcept,
  isPlannedConceptLive,
  isPlannedConceptPersisted,
};
export type { ProblemPoint, PlannedAssessmentConcept, AssessmentActivationStep };
