/**
 * Blank Day Template / Week Pattern creation must not require an active plan.
 * Day templates must persist a real DATE for source_date_local.
 * From-plan helpers still require a real plan day.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const maybeSingle = jest.fn();
const mockFrom = jest.fn(() => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle,
  single: jest.fn(),
}));

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: jest.fn(),
  },
}));

const saveReusablePlanDayTemplate = jest.fn(async (template: unknown) => template);
const saveReusablePlanWeekPattern = jest.fn(async (pattern: unknown) => pattern);

jest.mock('../reusablePlanningStore', () => {
  const actual = jest.requireActual('../reusablePlanningStore') as typeof import('../reusablePlanningStore');
  return {
    ...actual,
    saveReusablePlanDayTemplate: (...args: unknown[]) =>
      saveReusablePlanDayTemplate(...args),
    saveReusablePlanWeekPattern: (...args: unknown[]) =>
      saveReusablePlanWeekPattern(...args),
  };
});

jest.mock('../personMetadataStore', () => ({
  readPersonMetadata: jest.fn(async () => ({})),
}));

jest.mock('@/lib/journal/journalServerService', () => ({
  getUserGoals: jest.fn(),
}));

import {
  BLANK_DAY_TEMPLATE_SOURCE_DATE_LOCAL,
  BLANK_REUSABLE_SOURCE_PLAN_ID,
  formatDayTemplateSourceLabel,
} from '../blankReusableProvenance';
import {
  createBlankPlanDayTemplate,
  createBlankPlanWeekPattern,
  savePlanDayAsTemplate,
} from '../planServerService';
import { toReusableDayTemplateInsertPayload } from '../reusablePlanningStore';
import type { PlanDayTemplate } from '../types';

describe('blank reusable creation without active plan', () => {
  beforeEach(() => {
    saveReusablePlanDayTemplate.mockClear();
    saveReusablePlanWeekPattern.mockClear();
    mockFrom.mockClear();
    maybeSingle.mockReset();
  });

  it('creates a blank day template with DATE-compatible persistence payload', async () => {
    const template = await createBlankPlanDayTemplate({
      personId: 'person-1',
      name: 'Blank day',
    });

    expect(template.source_plan_id).toBe(BLANK_REUSABLE_SOURCE_PLAN_ID);
    expect(template.source_date_local).toBe(BLANK_DAY_TEMPLATE_SOURCE_DATE_LOCAL);
    expect(template.source_date_local).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatDayTemplateSourceLabel(template)).toBe('blank template');
    expect(formatDayTemplateSourceLabel(template)).not.toBe('1970-01-01');

    expect(saveReusablePlanDayTemplate).toHaveBeenCalledTimes(1);
    const persisted = saveReusablePlanDayTemplate.mock.calls[0]![0] as PlanDayTemplate;
    const row = toReusableDayTemplateInsertPayload(persisted);
    expect(row.source_date_local).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.source_date_local).toBe('1970-01-01');

    expect(mockFrom).not.toHaveBeenCalledWith('plan_days');
    expect(mockFrom).not.toHaveBeenCalledWith('plans');
  });

  it('creates a blank week pattern without requiring an active plan', async () => {
    const pattern = await createBlankPlanWeekPattern({
      personId: 'person-1',
      name: 'Blank week',
      dayCount: 3,
    });

    expect(pattern.name).toBe('Blank week');
    expect(pattern.days).toHaveLength(3);
    expect(pattern.source_plan_id).toBe(BLANK_REUSABLE_SOURCE_PLAN_ID);
    expect(pattern.source_date_start).toBeNull();
    expect(pattern.source_date_end).toBeNull();
    expect(saveReusablePlanWeekPattern).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalledWith('plan_days');
    expect(mockFrom).not.toHaveBeenCalledWith('plans');
  });

  it('keeps from-plan day template creation gated on a real plan day', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      savePlanDayAsTemplate({
        personId: 'person-1',
        planId: 'missing-plan',
        planDayId: 'missing-day',
        name: null,
        includeMeals: true,
      }),
    ).rejects.toThrow(/Source plan day not found/);
  });
});
