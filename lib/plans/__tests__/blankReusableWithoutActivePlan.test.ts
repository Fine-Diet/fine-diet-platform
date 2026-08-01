/**
 * Blank Day Template / Week Pattern creation must not require an active plan.
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

jest.mock('../reusablePlanningStore', () => ({
  saveReusablePlanDayTemplate: (...args: unknown[]) =>
    saveReusablePlanDayTemplate(...args),
  saveReusablePlanWeekPattern: (...args: unknown[]) =>
    saveReusablePlanWeekPattern(...args),
  listReusablePlanDayTemplates: jest.fn(),
  listReusablePlanWeekPatterns: jest.fn(),
  getReusablePlanDayTemplate: jest.fn(),
  getReusablePlanWeekPattern: jest.fn(),
  updateReusablePlanDayTemplate: jest.fn(),
  updateReusablePlanWeekPattern: jest.fn(),
  deleteReusablePlanDayTemplate: jest.fn(),
  deleteReusablePlanWeekPattern: jest.fn(),
}));

jest.mock('../personMetadataStore', () => ({
  readPersonMetadata: jest.fn(async () => ({})),
}));

jest.mock('@/lib/journal/journalServerService', () => ({
  getUserGoals: jest.fn(),
}));

import {
  createBlankPlanDayTemplate,
  createBlankPlanWeekPattern,
  savePlanDayAsTemplate,
} from '../planServerService';

describe('blank reusable creation without active plan', () => {
  beforeEach(() => {
    saveReusablePlanDayTemplate.mockClear();
    saveReusablePlanWeekPattern.mockClear();
    mockFrom.mockClear();
    maybeSingle.mockReset();
  });

  it('creates a blank day template without requiring an active plan', async () => {
    const template = await createBlankPlanDayTemplate({
      personId: 'person-1',
      name: 'Blank day',
    });

    expect(template.name).toBe('Blank day');
    expect(template.source_plan_id).toBe('00000000-0000-4000-8000-0000000000b1');
    expect(template.source_date_local).toBe('Blank');
    expect(template.slots.length).toBeGreaterThan(0);
    expect(saveReusablePlanDayTemplate).toHaveBeenCalledTimes(1);
    // Blank path uses person metadata only — never plan_days lookup.
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
    expect(pattern.source_plan_id).toBe('00000000-0000-4000-8000-0000000000b1');
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
