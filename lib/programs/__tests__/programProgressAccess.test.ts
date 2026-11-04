let mockAssignments: Array<Record<string, unknown>> = [];
let mockFrom: jest.Mock;

jest.mock('@/lib/plans/programAssignmentServerService', () => ({
  listActiveAssignmentsForPerson: jest.fn(async () => mockAssignments),
}));

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn((table: string) => {
    const query: any = {
      select: () => query,
      eq: () => query,
      lte: () => query,
      or: () => query,
      limit: () => query,
      maybeSingle: async () => table === 'program_content_items'
        ? {
            data: {
              id: 'item-1', module_id: 'module-1',
              program_modules: { program_id: 'program-1', programs: { slug: 'gut-reset' } },
            },
            error: null,
          }
        : { data: null, error: null },
      upsert: (payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => ({ data: { id: 'progress-1', ...payload }, error: null }),
        }),
      }),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    return query;
  });
  return { supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) } };
});

import { upsertItemStatus } from '../programProgressServerService';

describe('program progress current-access enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssignments = [];
  });

  test('denies progress writes when no current assignment or entitlement exists', async () => {
    await expect(upsertItemStatus({
      personId: 'person-1', contentItemId: 'item-1', status: 'in_progress',
    })).rejects.toMatchObject({ code: 'PROGRAM_ACCESS_DENIED' });
    expect(mockFrom).not.toHaveBeenCalledWith('program_content_progress');
  });

  test('permits progress writes for an authorized active assignment', async () => {
    mockAssignments = [{ person_id: 'person-1', program_slug: 'gut-reset', status: 'active' }];
    const result = await upsertItemStatus({
      personId: 'person-1', contentItemId: 'item-1', status: 'in_progress',
    });
    expect(result).toMatchObject({ program_slug: 'gut-reset', person_id: 'person-1' });
    expect(mockFrom).toHaveBeenCalledWith('program_content_progress');
  });
});
