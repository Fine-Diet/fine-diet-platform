let mockFrom!: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  return {
    supabaseAdmin: {
      from: mockFrom,
    },
  };
});

import {
  ProgramDeliveryModuleCreateSchema,
  ProgramDeliveryModuleUpdateSchema,
  type ProgramDeliveryModuleRow,
} from '../deliveryModuleAdminServerService';
import {
  getDeliveryModulesForProgramWithFallback,
  mapDeliveryModuleRowToDefinition,
} from '../deliveryModuleDeliveryServerService';

function query(result: { data?: unknown; error?: unknown }) {
  const q: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  q.then = jest.fn((resolve, reject) =>
    Promise.resolve({
      data: result.data ?? null,
      error: result.error ?? null,
    }).then(resolve, reject),
  );
  return q;
}

function deliveryRow(
  overrides: Partial<ProgramDeliveryModuleRow> = {},
): ProgramDeliveryModuleRow {
  return {
    id: 'row-1',
    program_id: 'program-1',
    program_version_id: null,
    module_key: 'baseline-db-guide',
    module_type: 'guide',
    title: 'DB-authored guide',
    eyebrow: 'Admin authored',
    body: 'Delivered from a published DB row.',
    day_start: 1,
    day_end: 7,
    status_visibility: ['active'],
    capacity_variants_json: {
      low: {
        title: 'Low capacity copy',
        body: 'Use the smallest version.',
      },
    },
    cta_json: {
      label: 'Jump to check-in',
      anchorKey: 'checkin',
      tone: 'emerald',
    },
    anchor_json: {
      anchorId: 'db-guide',
      groupId: 'db-week-1',
    },
    display_order: 0,
    status: 'published',
    safety_notes: ['Stay within the program scope.'],
    no_claims_notes: ['No treatment claims.'],
    metadata: {
      groupTitle: 'DB Week 1',
      showWhen: 'checkin_due',
      blocks: [
        {
          type: 'list',
          items: ['One small step'],
        },
      ],
    },
    created_at: '2026-05-27T00:00:00.000Z',
    updated_at: '2026-05-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('delivery module DB mapper', () => {
  test('maps a published row into ProgramDeliveryModuleDefinition', () => {
    const mapped = mapDeliveryModuleRowToDefinition(deliveryRow(), 'baseline');

    expect(mapped).toMatchObject({
      id: 'baseline-db-guide',
      programSlug: 'baseline',
      moduleType: 'guide',
      groupId: 'db-week-1',
      groupTitle: 'DB Week 1',
      title: 'DB-authored guide',
      eyebrow: 'Admin authored',
      body: 'Delivered from a published DB row.',
      dayStart: 1,
      dayEnd: 7,
      statusVisibility: ['active'],
      showWhen: 'checkin_due',
      anchorId: 'db-guide',
      cta: {
        label: 'Jump to check-in',
        anchorKey: 'checkin',
        tone: 'emerald',
      },
      safetyNotes: ['Stay within the program scope.'],
      noClaimsNotes: ['No treatment claims.'],
    });
    expect(mapped.capacityVariants?.low?.title).toBe('Low capacity copy');
    expect(mapped.blocks?.[0]).toMatchObject({ type: 'list' });
  });
});

describe('delivery module runtime fallback', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  test('prefers published DB modules when present', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'programs') {
        return query({
          data: [{ id: 'program-1', slug: 'baseline', status: 'published' }],
        });
      }
      if (table === 'program_delivery_modules') {
        return query({ data: [deliveryRow()] });
      }
      return query({ data: [] });
    });

    const result = await getDeliveryModulesForProgramWithFallback({
      programSlug: 'baseline',
      programVersionId: 'version-1',
    });

    expect(result.source).toBe('admin');
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].id).toBe('baseline-db-guide');
  });

  test('falls back to code-owned Baseline config when no DB modules exist', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'programs') {
        return query({
          data: [{ id: 'program-1', slug: 'baseline', status: 'published' }],
        });
      }
      if (table === 'program_delivery_modules') {
        return query({ data: [] });
      }
      return query({ data: [] });
    });

    const result = await getDeliveryModulesForProgramWithFallback({
      programSlug: 'baseline',
      programVersionId: 'version-1',
    });

    expect(result.source).toBe('baseline_code');
    expect(result.modules.map((module) => module.id)).toContain(
      'baseline-prep-overview',
    );
    expect(result.modules.map((module) => module.id)).toContain(
      'baseline-week-1-focus',
    );
  });
});

describe('delivery module admin validation', () => {
  const validPayload = {
    module_key: 'baseline-week-1-focus',
    module_type: 'week',
    title: 'Week 1 focus',
    eyebrow: 'Week 1',
    body: 'A safe delivery module body.',
    day_start: 1,
    day_end: 7,
    status: 'published',
    capacity_variants_json: {},
    cta_json: {},
    anchor_json: {},
    metadata: {},
  };

  test('accepts a valid minimal payload', () => {
    expect(ProgramDeliveryModuleCreateSchema.safeParse(validPayload).success).toBe(
      true,
    );
  });

  test('rejects unknown module types', () => {
    expect(
      ProgramDeliveryModuleCreateSchema.safeParse({
        ...validPayload,
        module_type: 'unknown',
      }).success,
    ).toBe(false);
  });

  test('rejects inverted day ranges', () => {
    expect(
      ProgramDeliveryModuleCreateSchema.safeParse({
        ...validPayload,
        day_start: 8,
        day_end: 7,
      }).success,
    ).toBe(false);
  });

  test('rejects JSON fields that are not objects', () => {
    expect(
      ProgramDeliveryModuleCreateSchema.safeParse({
        ...validPayload,
        cta_json: [],
      }).success,
    ).toBe(false);
  });

  test('allows partial update payloads without defaulting omitted fields', () => {
    const parsed = ProgramDeliveryModuleUpdateSchema.safeParse({
      title: 'Updated title',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data : {}).toEqual({ title: 'Updated title' });
  });
});
