import {
  assertDayTemplateSourceDateContract,
  BLANK_DAY_TEMPLATE_SOURCE_DATE_LOCAL,
  BLANK_REUSABLE_SOURCE_PLAN_ID,
  formatDayTemplateSourceLabel,
  isBlankReusableSourcePlanId,
} from '../blankReusableProvenance';
import { toReusableDayTemplateInsertPayload } from '../reusablePlanningStore';
import type { PlanDayTemplate } from '../types';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: jest.fn(), rpc: jest.fn() },
}));

function template(overrides: Partial<PlanDayTemplate> = {}): PlanDayTemplate {
  return {
    id: 'tmpl-1',
    person_id: 'person-1',
    name: 'Blank day',
    scope: 'day',
    source_plan_id: BLANK_REUSABLE_SOURCE_PLAN_ID,
    source_plan_day_id: '00000000-0000-4000-8000-0000000000d1',
    source_date_local: BLANK_DAY_TEMPLATE_SOURCE_DATE_LOCAL,
    slots: [],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('blankReusableProvenance', () => {
  it('identifies blank provenance by source_plan_id sentinel', () => {
    expect(isBlankReusableSourcePlanId(BLANK_REUSABLE_SOURCE_PLAN_ID)).toBe(true);
    expect(isBlankReusableSourcePlanId('plan-real')).toBe(false);
  });

  it('renders blank provenance as blank template, never the sentinel date', () => {
    expect(
      formatDayTemplateSourceLabel({
        source_plan_id: BLANK_REUSABLE_SOURCE_PLAN_ID,
        source_date_local: BLANK_DAY_TEMPLATE_SOURCE_DATE_LOCAL,
      }),
    ).toBe('blank template');
    expect(
      formatDayTemplateSourceLabel({
        source_plan_id: 'plan-real',
        source_date_local: '2026-07-26',
      }),
    ).toBe('2026-07-26');
  });

  it('rejects non-calendar source_date_local values against the DATE contract', () => {
    expect(() => assertDayTemplateSourceDateContract('Blank')).toThrow(/YYYY-MM-DD/);
    expect(() => assertDayTemplateSourceDateContract(BLANK_DAY_TEMPLATE_SOURCE_DATE_LOCAL)).not.toThrow();
  });

  it('builds a persistence payload with a real YYYY-MM-DD calendar date', () => {
    const row = toReusableDayTemplateInsertPayload(template());
    expect(row.source_date_local).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.source_date_local).toBe('1970-01-01');
    expect(row.source_plan_id).toBe(BLANK_REUSABLE_SOURCE_PLAN_ID);
  });

  it('refuses to build a persistence payload with source_date_local Blank', () => {
    expect(() =>
      toReusableDayTemplateInsertPayload(template({ source_date_local: 'Blank' })),
    ).toThrow(/YYYY-MM-DD/);
  });
});
