/**
 * Program guidance payload boundary — dual-read schedule_override normalizes
 * to v2 occasion keys before domain/preview/admin write use.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { describe, expect, it } from '@jest/globals';
import { previewGuidancePayload } from '@/lib/plans/programGuidanceAdminServerService';
import {
  ProgramGuidanceAdminCreateSchema,
  ProgramGuidanceAdminUpdateSchema,
  ProgramPlanGuidancePayloadSchema,
  ProgramScheduleOverrideSchema,
} from '@/lib/plans/validators';

const basePayload = {
  emphasize: [] as string[],
  avoid: [] as string[],
  macro_targets: null,
  nds_targets: null,
  notes_md: null,
};

describe('ProgramPlanGuidancePayloadSchema schedule_override normalization', () => {
  it('accepts legacy Program keys and outputs deterministic v2 occasion keys', () => {
    const parsed = ProgramPlanGuidancePayloadSchema.parse({
      ...basePayload,
      schedule_override: {
        require_slots: ['breakfast', 'lunch'],
        disallow_slots: ['evening_snack'],
        constraints: null,
        rationale_md: null,
      },
    });
    expect(parsed.schedule_override?.require_slots).toEqual([
      'occasion_2',
      'occasion_4',
    ]);
    expect(parsed.schedule_override?.disallow_slots).toEqual(['occasion_8']);
  });

  it('leaves current v2 Program overrides unchanged', () => {
    const parsed = ProgramPlanGuidancePayloadSchema.parse({
      ...basePayload,
      schedule_override: {
        require_slots: ['occasion_2', 'occasion_7'],
        disallow_slots: ['occasion_1'],
        constraints: { no_earlier_than: '07:00' },
        rationale_md: 'keep evenings light',
      },
    });
    expect(parsed.schedule_override).toEqual({
      require_slots: ['occasion_2', 'occasion_7'],
      disallow_slots: ['occasion_1'],
      constraints: { no_earlier_than: '07:00' },
      rationale_md: 'keep evenings light',
    });
  });

  it('keeps dual-read ProgramScheduleOverrideSchema accepting legacy and v2', () => {
    expect(
      ProgramScheduleOverrideSchema.safeParse({
        require_slots: ['breakfast'],
        disallow_slots: [],
      }).success,
    ).toBe(true);
    expect(
      ProgramScheduleOverrideSchema.safeParse({
        require_slots: ['occasion_4'],
        disallow_slots: ['occasion_8'],
      }).success,
    ).toBe(true);
  });

  it('admin create/update schemas do not output legacy schedule_override keys', () => {
    const personId = '11111111-1111-4111-8111-111111111111';
    const created = ProgramGuidanceAdminCreateSchema.parse({
      person_id: personId,
      program_slug: 'test-program',
      guidance_payload_json: {
        ...basePayload,
        schedule_override: {
          require_slots: ['dinner'],
          disallow_slots: ['morning_snack'],
        },
      },
    });
    expect(created.guidance_payload_json.schedule_override?.require_slots).toEqual([
      'occasion_7',
    ]);
    expect(created.guidance_payload_json.schedule_override?.disallow_slots).toEqual([
      'occasion_3',
    ]);

    const updated = ProgramGuidanceAdminUpdateSchema.parse({
      guidance_payload_json: {
        ...basePayload,
        schedule_override: {
          require_slots: ['afternoon_snack'],
          disallow_slots: [],
        },
      },
    });
    expect(updated.guidance_payload_json?.schedule_override?.require_slots).toEqual([
      'occasion_5',
    ]);
  });

  it('preview path accepts legacy-compatible input after normalization', () => {
    const parsed = ProgramPlanGuidancePayloadSchema.parse({
      ...basePayload,
      schedule_override: {
        require_slots: ['breakfast'],
        disallow_slots: ['evening_snack'],
      },
    });
    const summary = previewGuidancePayload(parsed);
    expect(summary.toLowerCase()).toContain('breakfast');
    expect(summary.toLowerCase()).toContain('mini meal');
  });
});
