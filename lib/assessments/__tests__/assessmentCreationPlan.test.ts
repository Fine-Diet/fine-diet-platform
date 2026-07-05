/**
 * Tests for the assessment creation planning layer (Packet K).
 *
 * Covers:
 *   - multiple planned assessments can map to one problem point,
 *   - every planned concept references valid problem point / archetype /
 *     scoring-template ids,
 *   - every planned concept's archetype is compatible with its scoring template,
 *   - every planned concept lists admin-owned and engineering-owned work
 *     (via the ownership split + activation blockers),
 *   - no planned assessment is treated as live / public / registered / persisted,
 *   - the activation checklist includes required admin and engineering steps,
 *     is ordered, and every step declares an ownership,
 *   - Gut Check behavior is not affected (no registry entry, no public route
 *     added by this module),
 *   - lookups behave for known / unknown / empty inputs,
 *   - summarizeCreationSystem reports honest counts.
 */

import {
  PLANNED_ASSESSMENT_CONCEPTS,
  ASSESSMENT_ACTIVATION_CHECKLIST,
  listPlannedAssessmentConcepts,
  getPlannedAssessmentConcept,
  listPlannedConceptsForProblemPoint,
  listActivationChecklistSteps,
  listActivationStepsByOwnership,
  getActivationStep,
  getOwnershipSplitForConcept,
  isPlannedConceptLive,
  isPlannedConceptPersisted,
  summarizeCreationSystem,
  validateCreationPlanIntegrity,
} from '../assessmentCreationPlan';
import {
  PROBLEM_POINTS,
  getProblemPoint,
  getArchetype,
  getScoringTemplate,
} from '../assessmentFactory';

describe('creation plan integrity', () => {
  it('has no integrity violations', () => {
    expect(validateCreationPlanIntegrity()).toEqual([]);
  });

  it('has unique planned concept ids', () => {
    const ids = PLANNED_ASSESSMENT_CONCEPTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique activation step ids', () => {
    const ids = ASSESSMENT_ACTIVATION_CHECKLIST.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('multiple assessments per problem point', () => {
  it('at least one problem point has more than one planned concept', () => {
    const counts: Record<string, number> = {};
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      counts[c.problemPointId] = (counts[c.problemPointId] ?? 0) + 1;
    }
    const multi = Object.values(counts).filter((n) => n > 1);
    expect(multi.length).toBeGreaterThan(0);
  });

  it('baseline-readiness has multiple planned concepts', () => {
    const concepts = listPlannedConceptsForProblemPoint('baseline-readiness');
    expect(concepts.length).toBeGreaterThanOrEqual(2);
  });

  it('program-fit has multiple planned concepts', () => {
    const concepts = listPlannedConceptsForProblemPoint('program-fit');
    expect(concepts.length).toBeGreaterThanOrEqual(2);
  });

  it('gut-health has multiple planned concepts (alongside the live Gut Check)', () => {
    const concepts = listPlannedConceptsForProblemPoint('gut-health');
    expect(concepts.length).toBeGreaterThanOrEqual(2);
  });

  it('listPlannedConceptsForProblemPoint returns empty for unknown / empty', () => {
    expect(listPlannedConceptsForProblemPoint('nope')).toEqual([]);
    expect(listPlannedConceptsForProblemPoint(null)).toEqual([]);
  });
});

describe('planned concept reference integrity', () => {
  it('every concept references a valid problem point', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      expect(getProblemPoint(c.problemPointId)).toBeDefined();
    }
  });

  it('every concept references a valid archetype', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      expect(getArchetype(c.archetypeId)).toBeDefined();
    }
  });

  it('every concept references a valid scoring template', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      expect(getScoringTemplate(c.scoringTemplateId)).toBeDefined();
    }
  });

  it('every concept archetype is compatible with its scoring template', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      const archetype = getArchetype(c.archetypeId)!;
      expect(archetype.compatibleScoringTemplateIds).toContain(c.scoringTemplateId);
    }
  });

  it('every concept activation blocker references a real activation step', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      for (const stepId of c.activationBlockerStepIds) {
        expect(getActivationStep(stepId)).toBeDefined();
      }
    }
  });
});

describe('planned concepts are never live / registered / persisted', () => {
  it('no concept is marked live', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      expect(c.isLive).toBe(false);
    }
  });

  it('no concept is marked registered', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      expect(c.isRegistered).toBe(false);
    }
  });

  it('no concept is marked persisted (v1)', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      expect(c.persisted).toBe(false);
    }
  });

  it('isPlannedConceptLive always returns false', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      expect(isPlannedConceptLive(c.id)).toBe(false);
    }
    expect(isPlannedConceptLive('does-not-exist')).toBe(false);
    expect(isPlannedConceptLive(null)).toBe(false);
  });

  it('isPlannedConceptPersisted always returns false in v1', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      expect(isPlannedConceptPersisted(c.id)).toBe(false);
    }
  });

  it('no concept id collides with a live assessmentType slug', () => {
    // Planned concept ids are namespaced with "planned:" so they can never be
    // confused with a live registry slug.
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      expect(c.id.startsWith('planned:')).toBe(true);
    }
  });
});

describe('ownership split', () => {
  it('every concept has an ownership split with admin and engineering fields', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      const split = getOwnershipSplitForConcept(c.id);
      expect(split.adminOwned.length).toBeGreaterThan(0);
      expect(split.engineeringOwned.length).toBeGreaterThan(0);
    }
  });

  it('returns empty split for unknown concept', () => {
    const split = getOwnershipSplitForConcept('nope');
    expect(split.adminOwned).toEqual([]);
    expect(split.engineeringOwned).toEqual([]);
    expect(split.shared).toEqual([]);
  });

  it('ownership split includes the authoring UI link for admin-owned question set field', () => {
    const split = getOwnershipSplitForConcept(
      'planned:baseline-readiness:starter-readiness'
    );
    const questionSetField = split.adminOwned.find((f) => f.field === 'questionSet');
    expect(questionSetField).toBeDefined();
    expect(questionSetField?.availableAtHref).toBe('/admin/question-sets/author');
  });
});

describe('activation checklist', () => {
  it('steps are returned in ascending order', () => {
    const steps = listActivationChecklistSteps();
    const orders = steps.map((s) => s.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it('orders are contiguous starting at 1', () => {
    const steps = listActivationChecklistSteps();
    expect(steps.map((s) => s.order)).toEqual(steps.map((_, i) => i + 1));
  });

  it('includes the required admin steps', () => {
    const ids = listActivationStepsByOwnership('admin').map((s) => s.id);
    expect(ids).toContain('choose-problem-point');
    expect(ids).toContain('choose-archetype');
    expect(ids).toContain('author-question-set');
    expect(ids).toContain('publish-readiness');
  });

  it('includes the required engineering steps', () => {
    const ids = listActivationStepsByOwnership('engineering').map((s) => s.id);
    expect(ids).toContain('add-registry-entry');
    expect(ids).toContain('add-operations-contract');
    expect(ids).toContain('add-factory-coordinates');
    expect(ids).toContain('add-scoring-dispatch');
    expect(ids).toContain('configure-email-pdf-webhook-cta-routing');
  });

  it('includes the shared steps', () => {
    const ids = listActivationStepsByOwnership('shared').map((s) => s.id);
    expect(ids).toContain('define-outcomes');
    expect(ids).toContain('add-result-pack-outcome-mapping');
    expect(ids).toContain('preview-all-outcomes');
    expect(ids).toContain('qa-public-route');
  });

  it('every step declares an ownership', () => {
    for (const s of ASSESSMENT_ACTIVATION_CHECKLIST) {
      expect(['admin', 'engineering', 'shared']).toContain(s.ownership);
    }
  });

  it('has at least one admin-owned, one engineering-owned, and one shared step', () => {
    expect(listActivationStepsByOwnership('admin').length).toBeGreaterThan(0);
    expect(listActivationStepsByOwnership('engineering').length).toBeGreaterThan(0);
    expect(listActivationStepsByOwnership('shared').length).toBeGreaterThan(0);
  });

  it('getActivationStep returns undefined for unknown / empty', () => {
    expect(getActivationStep('nope')).toBeUndefined();
    expect(getActivationStep(null)).toBeUndefined();
  });
});

describe('Gut Check is unaffected', () => {
  it('no planned concept uses the gut-check registry slug as its id', () => {
    for (const c of PLANNED_ASSESSMENT_CONCEPTS) {
      expect(c.id).not.toBe('gut-check');
    }
  });

  it('problem points still include gut-health as the available one', () => {
    const gut = getProblemPoint('gut-health');
    expect(gut).toBeDefined();
    expect(gut!.status).toBe('available');
  });

  it('PROBLEM_POINTS is unchanged in count (9)', () => {
    expect(PROBLEM_POINTS.length).toBe(9);
  });
});

describe('summarizeCreationSystem', () => {
  it('reports honest counts', () => {
    const s = summarizeCreationSystem();
    expect(s.plannedConcepts.total).toBe(PLANNED_ASSESSMENT_CONCEPTS.length);
    expect(s.activationChecklist.total).toBe(ASSESSMENT_ACTIVATION_CHECKLIST.length);
    expect(
      s.activationChecklist.adminOwned +
        s.activationChecklist.engineeringOwned +
        s.activationChecklist.shared
    ).toBe(s.activationChecklist.total);
  });

  it('reports zero live and zero persisted concepts in v1', () => {
    const s = summarizeCreationSystem();
    expect(s.liveConcepts).toBe(0);
    expect(s.persistedConcepts).toBe(0);
  });

  it('reports at least one problem point with multiple concepts', () => {
    const s = summarizeCreationSystem();
    expect(s.problemPointsWithMultipleConcepts).toBeGreaterThan(0);
  });
});

describe('lookups', () => {
  it('listPlannedAssessmentConcepts returns non-empty array', () => {
    expect(listPlannedAssessmentConcepts().length).toBeGreaterThan(0);
  });

  it('getPlannedAssessmentConcept returns undefined for unknown / empty', () => {
    expect(getPlannedAssessmentConcept('nope')).toBeUndefined();
    expect(getPlannedAssessmentConcept(null)).toBeUndefined();
  });
});
