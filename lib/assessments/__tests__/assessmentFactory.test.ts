/**
 * Tests for the assessment factory metadata layer (Packet J).
 *
 * Covers:
 *   - unique ids across problem points, archetypes, templates, stages.
 *   - archetypes map to valid scoring templates (bidirectional).
 *   - problem points have suggested archetypes/templates that exist.
 *   - creation workflow stages are ordered and contiguous.
 *   - Gut Check maps to a valid factory model via its operations contract.
 *   - lookups behave for known / unknown / empty inputs.
 *   - summarizeFactoryReadiness reports honest counts.
 */

import {
  PROBLEM_POINTS,
  ASSESSMENT_ARCHETYPES,
  SCORING_TEMPLATES,
  CREATION_WORKFLOW_STAGES,
  listProblemPoints,
  getProblemPoint,
  listArchetypes,
  getArchetype,
  listScoringTemplates,
  getScoringTemplate,
  listCreationWorkflowStages,
  getFactoryModelForAssessmentType,
  listFactoryModels,
  validateFactoryIntegrity,
  summarizeFactoryReadiness,
} from '../assessmentFactory';

describe('factory integrity', () => {
  it('has no integrity violations', () => {
    expect(validateFactoryIntegrity()).toEqual([]);
  });

  it('has unique problem-point ids', () => {
    const ids = PROBLEM_POINTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique archetype ids', () => {
    const ids = ASSESSMENT_ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique scoring-template ids', () => {
    const ids = SCORING_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique creation-stage ids', () => {
    const ids = CREATION_WORKFLOW_STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('archetype <-> scoring template consistency', () => {
  it('every archetype compatible template exists and lists the archetype back', () => {
    for (const archetype of ASSESSMENT_ARCHETYPES) {
      for (const templateId of archetype.compatibleScoringTemplateIds) {
        const template = getScoringTemplate(templateId);
        expect(template).toBeDefined();
        expect(template!.applicableArchetypeIds).toContain(archetype.id);
      }
    }
  });

  it('every scoring template applicable archetype exists and lists the template back', () => {
    for (const template of SCORING_TEMPLATES) {
      for (const archetypeId of template.applicableArchetypeIds) {
        const archetype = getArchetype(archetypeId);
        expect(archetype).toBeDefined();
        expect(archetype!.compatibleScoringTemplateIds).toContain(template.id);
      }
    }
  });

  it('every archetype has at least one compatible template', () => {
    for (const archetype of ASSESSMENT_ARCHETYPES) {
      expect(archetype.compatibleScoringTemplateIds.length).toBeGreaterThan(0);
    }
  });

  it('every scoring template has at least one applicable archetype', () => {
    for (const template of SCORING_TEMPLATES) {
      expect(template.applicableArchetypeIds.length).toBeGreaterThan(0);
    }
  });
});

describe('problem-point suggestions', () => {
  it('every problem point has suggested archetypes that exist', () => {
    for (const p of PROBLEM_POINTS) {
      expect(p.suggestedArchetypeIds.length).toBeGreaterThan(0);
      for (const id of p.suggestedArchetypeIds) {
        expect(getArchetype(id)).toBeDefined();
      }
    }
  });

  it('every problem point has suggested templates that exist', () => {
    for (const p of PROBLEM_POINTS) {
      expect(p.suggestedScoringTemplateIds.length).toBeGreaterThan(0);
      for (const id of p.suggestedScoringTemplateIds) {
        expect(getScoringTemplate(id)).toBeDefined();
      }
    }
  });

  it('gut-health is the available problem point', () => {
    const gut = getProblemPoint('gut-health');
    expect(gut).toBeDefined();
    expect(gut!.status).toBe('available');
    expect(gut!.suggestedArchetypeIds).toContain('axis-profile');
  });
});

describe('creation workflow ordering', () => {
  it('stages are returned in ascending order', () => {
    const stages = listCreationWorkflowStages();
    const orders = stages.map((s) => s.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it('orders are contiguous starting at 1', () => {
    const stages = listCreationWorkflowStages();
    expect(stages.map((s) => s.order)).toEqual(
      stages.map((_, i) => i + 1)
    );
  });

  it('covers the seven intended stages in order', () => {
    const stages = listCreationWorkflowStages();
    expect(stages.map((s) => s.id)).toEqual([
      'choose-problem-point',
      'choose-archetype',
      'choose-scoring-template',
      'author-questions',
      'map-outcomes',
      'preview-artifacts',
      'publish-readiness',
    ]);
  });
});

describe('Gut Check factory model integration', () => {
  it('Gut Check maps to a valid factory model via its operations contract', () => {
    const fm = getFactoryModelForAssessmentType('gut-check');
    expect(fm).not.toBeNull();
    expect(fm!.assessmentType).toBe('gut-check');
    expect(fm!.problemPointId).toBe('gut-health');
    expect(fm!.archetypeId).toBe('axis-profile');
    expect(fm!.scoringTemplateId).toBe('axis-scores-to-profile');
  });

  it('Gut Check factory model references exist in the taxonomy', () => {
    const fm = getFactoryModelForAssessmentType('gut-check')!;
    expect(getProblemPoint(fm.problemPointId)).toBeDefined();
    expect(getArchetype(fm.archetypeId)).toBeDefined();
    expect(getScoringTemplate(fm.scoringTemplateId)).toBeDefined();
  });

  it('Gut Check archetype reference is set on the archetype record', () => {
    const archetype = getArchetype('axis-profile');
    expect(archetype?.referenceAssessmentType).toBe('gut-check');
    expect(archetype?.status).toBe('available');
  });

  it('Gut Check scoring template is the available one', () => {
    const template = getScoringTemplate('axis-scores-to-profile');
    expect(template?.status).toBe('available');
    expect(template?.applicableArchetypeIds).toContain('axis-profile');
  });

  it('planned extensions reference real problem points', () => {
    const fm = getFactoryModelForAssessmentType('gut-check')!;
    expect(fm.plannedExtendsToProblemPointIds).toBeDefined();
    for (const id of fm.plannedExtendsToProblemPointIds ?? []) {
      expect(getProblemPoint(id)).toBeDefined();
    }
  });

  it('returns null for an assessment with no factory model', () => {
    expect(getFactoryModelForAssessmentType('does-not-exist')).toBeNull();
    expect(getFactoryModelForAssessmentType(null)).toBeNull();
  });

  it('listFactoryModels includes Gut Check', () => {
    const models = listFactoryModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.assessmentType === 'gut-check')).toBe(true);
  });
});

describe('lookups', () => {
  it('list helpers return non-empty arrays', () => {
    expect(listProblemPoints().length).toBeGreaterThan(0);
    expect(listArchetypes().length).toBeGreaterThan(0);
    expect(listScoringTemplates().length).toBeGreaterThan(0);
    expect(listCreationWorkflowStages().length).toBeGreaterThan(0);
  });

  it('returns undefined for unknown / empty lookups', () => {
    expect(getProblemPoint('nope')).toBeUndefined();
    expect(getProblemPoint(null)).toBeUndefined();
    expect(getArchetype('')).toBeUndefined();
    expect(getScoringTemplate(null)).toBeUndefined();
  });
});

describe('summarizeFactoryReadiness', () => {
  it('reports honest counts that sum to totals', () => {
    const s = summarizeFactoryReadiness();
    expect(s.problemPoints.available + s.problemPoints.planned).toBe(
      s.problemPoints.total
    );
    expect(
      s.scoringTemplates.available +
        s.scoringTemplates.planned +
        s.scoringTemplates.notImplemented
    ).toBe(s.scoringTemplates.total);
    expect(
      s.creationStages.available +
        s.creationStages.planned +
        s.creationStages.manualReview +
        s.creationStages.notImplemented
    ).toBe(s.creationStages.total);
  });

  it('reports exactly one available problem point (gut-health) and one available archetype', () => {
    const s = summarizeFactoryReadiness();
    expect(s.problemPoints.available).toBe(1);
    expect(s.archetypes.available).toBe(1);
    expect(s.scoringTemplates.available).toBe(1);
  });

  it('reports at least one registered factory instance', () => {
    const s = summarizeFactoryReadiness();
    expect(s.registeredFactoryInstances).toBeGreaterThanOrEqual(1);
  });
});
