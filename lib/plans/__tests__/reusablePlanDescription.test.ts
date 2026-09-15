import {
  normalizeIncomingPlanDescription,
  normalizePlanDescription,
  normalizeTemplatePatchBody,
  normalizeWeekPatternPatchBody,
} from '../reusablePatchValidation';
import type { PlanDayTemplate, PlanWeekPattern } from '../types';

describe('reusable plan description normalization', () => {
  it('normalizes whitespace-only create input to null', () => {
    expect(normalizeIncomingPlanDescription('   ')).toBeNull();
    expect(normalizeIncomingPlanDescription('')).toBeNull();
    expect(normalizeIncomingPlanDescription(null)).toBeNull();
    expect(normalizeIncomingPlanDescription(undefined)).toBeNull();
  });

  it('trims non-empty create input', () => {
    expect(normalizeIncomingPlanDescription('  Busy week  ')).toBe('Busy week');
  });

  it('omits description from patch when not provided', () => {
    expect(normalizeTemplatePatchBody({ name: 'Renamed' }).description).toBeUndefined();
    expect(normalizeWeekPatternPatchBody({ name: 'Renamed' }).description).toBeUndefined();
  });

  it('clears description on explicit null patch', () => {
    expect(normalizeTemplatePatchBody({ description: null }).description).toBeNull();
    expect(normalizeWeekPatternPatchBody({ description: null }).description).toBeNull();
  });

  it('normalizes whitespace description patch to null', () => {
    expect(normalizeTemplatePatchBody({ description: '   ' }).description).toBeNull();
    expect(normalizeWeekPatternPatchBody({ description: ' \n ' }).description).toBeNull();
  });

  it('accepts trimmed description patch strings', () => {
    expect(normalizePlanDescription('  Notes  ')).toBe('Notes');
  });
});

describe('reusable plan description domain shape', () => {
  it('requires explicit null description on canonical day templates', () => {
    const template: PlanDayTemplate = {
      id: 'tmpl-1',
      person_id: 'person-1',
      name: 'Standard Breakfast',
      description: null,
      scope: 'day',
      source_plan_id: 'plan-1',
      source_plan_day_id: 'day-1',
      source_date_local: '2026-09-15',
      slots: [],
      unassigned_meals: [],
      apply_policy: 'append',
      created_at: '2026-09-15T00:00:00.000Z',
      updated_at: '2026-09-15T00:00:00.000Z',
    };
    expect(template.description).toBeNull();
  });

  it('requires explicit null description on canonical week patterns', () => {
    const pattern: PlanWeekPattern = {
      id: 'week-1',
      person_id: 'person-1',
      name: 'Standard Week',
      description: 'Saved week notes',
      scope: 'week_pattern',
      source_plan_id: 'plan-1',
      source_date_start: null,
      source_date_end: null,
      days: [],
      apply_policy: 'append',
      created_at: '2026-09-15T00:00:00.000Z',
      updated_at: '2026-09-15T00:00:00.000Z',
    };
    expect(pattern.description).toBe('Saved week notes');
  });
});
