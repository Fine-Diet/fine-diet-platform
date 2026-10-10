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

  test('returns only exact-version published modules and excludes unversioned and other versions', async () => {
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
      if (table === 'program_versions') {
        return query({ data: [{ id: 'v2', program_id: 'program-2', version_key: 'second-v2', status: 'published' }] });
      }
      return query({ data: [] });
    });

    const result = await getDeliveryModulesForProgramWithFallback({
      programSlug: 'second-program',
      programVersionId: 'v2',
    });

    const expectedSource: DeliveryModuleSource = 'admin';
    expect(result.source).toBe(expectedSource);
    expect(result.modules.map((m) => m.id)).toEqual(['m-v2']);
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

  test('preserves code-owned Baseline modules for the exact seeded baseline-v1 only', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'programs') {
        return query({
          data: [{ id: 'program-1', slug: 'baseline', status: 'published' }],
        });
      }
      if (table === 'program_versions') {
        return query({ data: [{ id: 'version-1', program_id: 'program-1', version_key: 'baseline-v1', status: 'published' }] });
      }
      return query({ data: [] });
    });

    const result = await getDeliveryModulesForProgramWithFallback({
      programSlug: 'baseline',
      programVersionId: 'version-1',
    });

    expect(result.source).toBe('baseline_code');
    expect(result.modules.length).toBeGreaterThan(0);
    expect(result.modules.some((module) => module.moduleType === 'prep')).toBe(true);
  });

  test('does not apply the Baseline fallback to later or unpublished versions', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'programs') {
        return query({ data: [{ id: 'program-1', slug: 'baseline', status: 'published' }] });
      }
      if (table === 'program_versions') {
        return query({ data: [{ id: 'version-2', program_id: 'program-1', version_key: 'v2-1234', status: 'published' }] });
      }
      return query({ data: [] });
    });
    const laterVersion = await getDeliveryModulesForProgramWithFallback({
      programSlug: 'baseline', programVersionId: 'version-2',
    });
    expect(laterVersion).toEqual({ source: 'none', modules: [] });

    mockFrom.mockImplementation((table: string) => table === 'programs'
      ? query({ data: [{ id: 'program-1', slug: 'baseline', status: 'published' }] })
      : table === 'program_versions'
        ? query({ data: [{ id: 'version-1', program_id: 'program-1', version_key: 'baseline-v1', status: 'draft' }] })
        : query({ data: [] }));
    const draft = await getDeliveryModulesForProgramWithFallback({
      programSlug: 'baseline', programVersionId: 'version-1',
    });
    expect(draft).toEqual({ source: 'none', modules: [] });
  });

  test('a database read error fails closed instead of returning fallback content', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'programs') {
        return query({
          data: [{ id: 'program-1', slug: 'baseline', status: 'published' }],
        });
      }
      if (table === 'program_versions') {
        return query({ data: [{ id: 'version-1', program_id: 'program-1', version_key: 'baseline-v1', status: 'published' }] });
      }
      if (table === 'program_delivery_modules') {
        return query({ error: { message: 'read denied' } });
      }
      return query({ data: [] });
    });

    await expect(
      getDeliveryModulesForProgramWithFallback({
        programSlug: 'baseline',
        programVersionId: 'version-1',
      }),
    ).rejects.toThrow('delivery modules lookup failed: read denied');
  });
});
