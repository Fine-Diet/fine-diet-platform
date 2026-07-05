/**
 * Tests for the Assessment Creation Wizard v1 helpers (Packet L).
 *
 * Covers:
 *   - blank draft creation,
 *   - prefill from a known planned concept,
 *   - unknown/invalid concept prefill fails gracefully (no crash),
 *   - compatibility filtering of archetypes and scoring templates,
 *   - archetype/template compatibility validation,
 *   - validation warnings vs errors and handoff readiness,
 *   - step completion,
 *   - generated handoff content (structured + markdown + json),
 *   - explicit no-live / no-persisted / no-registered / no-public-route semantics,
 *   - guardrails + recommended next action text.
 */

import {
  createEmptyDraft,
  prefillDraftFromConcept,
  listArchetypesForDraft,
  listScoringTemplatesForDraft,
  isArchetypeTemplateCompatible,
  validateDraft,
  computeStepCompletion,
  buildHandoff,
  generateHandoff,
  renderHandoffMarkdown,
  renderHandoffJson,
  isDraftLive,
  isDraftPersisted,
  WIZARD_STEPS,
} from '../assessmentCreationWizard';
import {
  getProblemPoint,
  getArchetype,
  getScoringTemplate,
} from '../assessmentFactory';
import {
  getPlannedAssessmentConcept,
  isPlannedConceptLive,
} from '../assessmentCreationPlan';

describe('wizard draft + prefill', () => {
  it('creates a blank draft with all nulls and empty strings', () => {
    const draft = createEmptyDraft();
    expect(draft.problemPointId).toBeNull();
    expect(draft.archetypeId).toBeNull();
    expect(draft.scoringTemplateId).toBeNull();
    expect(draft.plannedConceptId).toBeNull();
    expect(draft.workingTitle).toBe('');
    expect(draft.intendedUse).toBe('');
  });

  it('prefills from a known planned concept id', () => {
    const res = prefillDraftFromConcept('planned:baseline-readiness:starter-readiness');
    expect(res.ok).toBe(true);
    expect(res.draft.plannedConceptId).toBe('planned:baseline-readiness:starter-readiness');
    const concept = getPlannedAssessmentConcept('planned:baseline-readiness:starter-readiness');
    expect(concept).toBeDefined();
    expect(res.draft.problemPointId).toBe(concept!.problemPointId);
    expect(res.draft.archetypeId).toBe(concept!.archetypeId);
    expect(res.draft.scoringTemplateId).toBe(concept!.scoringTemplateId);
    expect(res.draft.workingTitle).toBe(concept!.workingTitle);
    expect(res.draft.intendedUse).toBe(concept!.intendedUse);
  });

  it('fails gracefully on an unknown concept id (no crash, blank draft)', () => {
    const res = prefillDraftFromConcept('planned:nope:does-not-exist');
    expect(res.ok).toBe(false);
    expect(res.fallbackReason).toMatch(/Unknown concept/);
    expect(res.draft.plannedConceptId).toBeNull();
    // blank draft returned, not undefined
    expect(res.draft.problemPointId).toBeNull();
  });

  it('fails gracefully on null/empty concept id', () => {
    expect(prefillDraftFromConcept(null).ok).toBe(false);
    expect(prefillDraftFromConcept('').ok).toBe(false);
    expect(prefillDraftFromConcept(undefined).ok).toBe(false);
  });
});

describe('wizard compatibility filtering', () => {
  it('returns all archetypes when no problem point selected', () => {
    const draft = createEmptyDraft();
    expect(listArchetypesForDraft(draft).length).toBeGreaterThan(0);
  });

  it('returns only suggested archetypes for a chosen problem point', () => {
    const pp = getProblemPoint('baseline-readiness');
    expect(pp).toBeDefined();
    const draft = { ...createEmptyDraft(), problemPointId: 'baseline-readiness' };
    const archetypes = listArchetypesForDraft(draft);
    expect(archetypes.length).toBe(pp!.suggestedArchetypeIds.length);
    for (const a of archetypes) {
      expect(pp!.suggestedArchetypeIds).toContain(a.id);
    }
  });

  it('returns all scoring templates when nothing is selected', () => {
    const draft = createEmptyDraft();
    expect(listScoringTemplatesForDraft(draft).length).toBeGreaterThan(0);
  });

  it('filters scoring templates by chosen archetype compatibility', () => {
    const draft = { ...createEmptyDraft(), archetypeId: 'readiness-audit' };
    const templates = listScoringTemplatesForDraft(draft);
    const archetype = getArchetype('readiness-audit');
    expect(archetype).toBeDefined();
    for (const t of templates) {
      expect(archetype!.compatibleScoringTemplateIds).toContain(t.id);
    }
  });

  it('intersects archetype compatibility with problem point suggestions when both set', () => {
    // baseline-readiness suggests total-score-to-levels + threshold-risk-flags.
    // readiness-audit is compatible with threshold-risk-flags + total-score-to-levels.
    const draft = {
      ...createEmptyDraft(),
      problemPointId: 'baseline-readiness',
      archetypeId: 'readiness-audit',
    };
    const templates = listScoringTemplatesForDraft(draft);
    const ids = templates.map((t) => t.id);
    expect(ids).toContain('total-score-to-levels');
    expect(ids).toContain('threshold-risk-flags');
  });

  it('falls back to full compatible list when intersection is empty', () => {
    // axis-profile compatible templates: axis-scores-to-profile, hybrid-score-and-flags.
    // baseline-readiness suggests total-score-to-levels, threshold-risk-flags — no overlap.
    const draft = {
      ...createEmptyDraft(),
      problemPointId: 'baseline-readiness',
      archetypeId: 'axis-profile',
    };
    const templates = listScoringTemplatesForDraft(draft);
    const ids = templates.map((t) => t.id);
    expect(ids).toContain('axis-scores-to-profile');
  });
});

describe('wizard archetype/template compatibility', () => {
  it('marks a declared-compatible pair as compatible', () => {
    const draft = {
      ...createEmptyDraft(),
      archetypeId: 'readiness-audit',
      scoringTemplateId: 'total-score-to-levels',
    };
    expect(isArchetypeTemplateCompatible(draft)).toBe(true);
  });

  it('marks an incompatible pair as incompatible', () => {
    const draft = {
      ...createEmptyDraft(),
      archetypeId: 'axis-profile',
      scoringTemplateId: 'category-tally-to-persona',
    };
    expect(isArchetypeTemplateCompatible(draft)).toBe(false);
  });

  it('returns false when either selection is missing', () => {
    expect(isArchetypeTemplateCompatible(createEmptyDraft())).toBe(false);
  });
});

describe('wizard validation', () => {
  it('reports errors for an empty draft and blocks handoff', () => {
    const v = validateDraft(createEmptyDraft());
    expect(v.errors.length).toBeGreaterThanOrEqual(3);
    expect(v.canGenerateHandoff).toBe(false);
  });

  it('passes a valid, compatible draft with no errors', () => {
    const draft = {
      ...createEmptyDraft(),
      workingTitle: 'Starter readiness',
      intendedUse: 'Prospect readiness before baseline.',
      problemPointId: 'baseline-readiness',
      archetypeId: 'readiness-audit',
      scoringTemplateId: 'total-score-to-levels',
    };
    const v = validateDraft(draft);
    expect(v.errors).toEqual([]);
    expect(v.canGenerateHandoff).toBe(true);
  });

  it('errors on an incompatible archetype/template pair', () => {
    const draft = {
      ...createEmptyDraft(),
      workingTitle: 'Bad pair',
      intendedUse: 'x',
      problemPointId: 'gut-health',
      archetypeId: 'axis-profile',
      scoringTemplateId: 'category-tally-to-persona',
    };
    const v = validateDraft(draft);
    expect(v.errors.some((e) => e.step === 'review-compatibility')).toBe(true);
    expect(v.canGenerateHandoff).toBe(false);
  });

  it('warns (not errors) when a chosen template is not available', () => {
    const draft = {
      ...createEmptyDraft(),
      workingTitle: 'Planned template',
      intendedUse: 'x',
      problemPointId: 'baseline-readiness',
      archetypeId: 'readiness-audit',
      scoringTemplateId: 'total-score-to-levels', // status: planned
    };
    const v = validateDraft(draft);
    expect(v.errors).toEqual([]);
    expect(
      v.warnings.some((w) => w.message.includes('total-score-to-levels') || w.message.includes('Total score'))
    ).toBe(true);
  });

  it('warns on prefill drift when selections diverge from the concept', () => {
    const draft = {
      ...createEmptyDraft(),
      plannedConceptId: 'planned:baseline-readiness:starter-readiness',
      problemPointId: 'gut-health', // drifted from baseline-readiness
      archetypeId: 'readiness-audit',
      scoringTemplateId: 'total-score-to-levels',
    };
    const v = validateDraft(draft);
    expect(v.warnings.some((w) => w.message.includes('drifted'))).toBe(true);
  });
});

describe('wizard step completion', () => {
  it('marks everything incomplete for a blank draft', () => {
    const completion = computeStepCompletion(createEmptyDraft());
    for (const step of WIZARD_STEPS) {
      expect(completion[step]).toBe(false);
    }
  });

  it('marks all steps complete for a valid draft', () => {
    const draft = {
      ...createEmptyDraft(),
      workingTitle: 'Starter readiness',
      intendedUse: 'x',
      problemPointId: 'baseline-readiness',
      archetypeId: 'readiness-audit',
      scoringTemplateId: 'total-score-to-levels',
    };
    const completion = computeStepCompletion(draft);
    for (const step of WIZARD_STEPS) {
      expect(completion[step]).toBe(true);
    }
  });
});

describe('wizard handoff generation', () => {
  const validDraft = {
    ...createEmptyDraft(),
    workingTitle: 'Starter readiness assessment',
    intendedUse: 'First readiness assessment before baseline.',
    problemPointId: 'baseline-readiness',
    archetypeId: 'readiness-audit',
    scoringTemplateId: 'total-score-to-levels',
  };

  it('buildHandoff returns null for an invalid draft', () => {
    expect(buildHandoff(createEmptyDraft())).toBeNull();
  });

  it('generateHandoff returns markdown + json for a valid draft', () => {
    const out = generateHandoff(validDraft);
    expect(out.validation.canGenerateHandoff).toBe(true);
    expect(out.handoff).not.toBeNull();
    expect(out.markdown).not.toBeNull();
    expect(out.json).not.toBeNull();
    expect(out.markdown).toContain('PLANNING-ONLY');
    expect(out.json).toContain('"live": false');
  });

  it('handoff carries the selected ids and labels', () => {
    const out = generateHandoff(validDraft);
    expect(out.handoff!.problemPoint).toEqual({
      id: 'baseline-readiness',
      label: getProblemPoint('baseline-readiness')!.label,
    });
    expect(out.handoff!.archetype!.id).toBe('readiness-audit');
    expect(out.handoff!.scoringTemplate!.id).toBe('total-score-to-levels');
    expect(out.handoff!.compatibilityOk).toBe(true);
  });

  it('handoff from a planned concept includes blockers + planned concept id', () => {
    const draft = {
      ...validDraft,
      plannedConceptId: 'planned:baseline-readiness:starter-readiness',
    };
    const out = generateHandoff(draft);
    expect(out.handoff!.plannedConceptId).toBe('planned:baseline-readiness:starter-readiness');
    expect(out.handoff!.blockers.length).toBeGreaterThan(0);
    const md = out.markdown!;
    expect(md).toContain('Activation blockers');
  });

  it('markdown includes admin-owned, engineering-owned, shared, checklist, guardrails, next action', () => {
    const out = generateHandoff(validDraft);
    const md = out.markdown!;
    expect(md).toContain('Admin-owned fields');
    expect(md).toContain('Engineering-owned activation steps');
    expect(md).toContain('Shared steps');
    expect(md).toContain('Full activation checklist');
    expect(md).toContain('Guardrails');
    expect(md).toContain('Recommended next action');
    expect(md).toContain('not persisted');
  });

  it('json parses back to the same shape', () => {
    const out = generateHandoff(validDraft);
    const parsed = JSON.parse(out.json!);
    expect(parsed.live).toBe(false);
    expect(parsed.persisted).toBe(false);
    expect(parsed.registered).toBe(false);
    expect(parsed.hasPublicRoute).toBe(false);
    expect(parsed.problemPoint.id).toBe('baseline-readiness');
  });
});

describe('wizard honest-state predicates', () => {
  it('isDraftLive and isDraftPersisted are always false', () => {
    expect(isDraftLive()).toBe(false);
    expect(isDraftPersisted()).toBe(false);
  });

  it('the handoff never claims live/persisted/registered/public-route', () => {
    const draft = {
      ...createEmptyDraft(),
      workingTitle: 'x',
      intendedUse: 'x',
      problemPointId: 'baseline-readiness',
      archetypeId: 'readiness-audit',
      scoringTemplateId: 'total-score-to-levels',
      plannedConceptId: 'planned:baseline-readiness:starter-readiness',
    };
    const out = generateHandoff(draft);
    expect(out.handoff!.live).toBe(false);
    expect(out.handoff!.persisted).toBe(false);
    expect(out.handoff!.registered).toBe(false);
    expect(out.handoff!.hasPublicRoute).toBe(false);
    // And the referenced planned concept is itself not live.
    expect(isPlannedConceptLive(draft.plannedConceptId)).toBe(false);
  });
});
