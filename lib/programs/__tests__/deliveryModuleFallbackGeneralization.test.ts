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
  getDeliveryModulesForProgramWithFallback,
  type DeliveryModuleSource,
} from '../deliveryModuleDeliveryServerService';
import type { ProgramDeliveryModuleRow } from '../deliveryModuleAdminServerService';

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
    program_id: 'program-2',
    program_version_id: null,
    module_key: 'second-db-guide',
    module_type: 'guide',
    title: 'DB-authored guide',
    eyebrow: 'Admin authored',
    body: 'Delivered from a published DB row.',
    day_start: 1,
    day_end: 7,
    status_visibility: ['active'],
    capacity_variants_json: {},
    cta_json: {},
    anchor_json: {},
    display_order: 0,
    status: 'published',
    safety_notes: [],
    no_claims_notes: [],
    metadata: {},
    created_at: '2026-05-27T00:00:00.000Z',
    updated_at: '2026-05-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('delivery fallback generalizes beyond Baseline', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  test('a non-Baseline program with published DB modules uses source "admin" and version filtering', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'programs') {
        return query({
          data: [
            { id: 'program-2', slug: 'second-program', status: 'published' },
          ],
        });
      }
      if (table === 'program_delivery_modules') {
        return query({
          data: [
            deliveryRow({ id: 'r-null', module_key: 'm-null', program_version_id: null }),
            deliveryRow({ id: 'r-v2', module_key: 'm-v2', program_version_id: 'v2' }),
            deliveryRow({ id: 'r-v9', module_key: 'm-v9', program_version_id: 'v9' }),
          ],
        });
      }
      return query({ data: [] });
    });

    const result = await getDeliveryModulesForProgramWithFallback({
      programSlug: 'second-program',
      programVersionId: 'v2',
    });

    const expectedSource: DeliveryModuleSource = 'admin';
    expect(result.source).toBe(expectedSource);
    // null-version (shared) + matching v2; v9 filtered out
    expect(result.modules.map((m) => m.id)).toEqual(['m-null', 'm-v2']);
  });

  test('an unregistered program with no DB modules returns source "none" (no Baseline leakage)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'programs') {
        return query({
          data: [
            {
              id: 'program-3',
              slug: 'digestive-foundations',
              status: 'published',
            },
          ],
        });
      }
      return query({ data: [] });
    });

    const result = await getDeliveryModulesForProgramWithFallback({
      programSlug: 'digestive-foundations',
      programVersionId: 'v1',
    });

    expect(result.source).toBe('none');
    expect(result.modules).toHaveLength(0);
  });

  test('Baseline still falls back to the code-owned set when DB is empty', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'programs') {
        return query({
          data: [{ id: 'program-1', slug: 'baseline', status: 'published' }],
        });
      }
      return query({ data: [] });
    });

    const result = await getDeliveryModulesForProgramWithFallback({
      programSlug: 'baseline',
      programVersionId: 'version-1',
    });

    expect(result.source).toBe('baseline_code');
    expect(result.modules.map((m) => m.id)).toContain('baseline-prep-overview');
  });
});
