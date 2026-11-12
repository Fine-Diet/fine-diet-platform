let mockHasEntitlement!: jest.Mock;
let mockListAssignments!: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock('@/lib/access/accessService', () => {
  mockHasEntitlement = jest.fn();
  return { hasEntitlement: mockHasEntitlement };
});

jest.mock('@/lib/plans/programAssignmentServerService', () => {
  mockListAssignments = jest.fn();
  return { listAssignments: mockListAssignments };
});

import { personHasCurrentProgramAccess } from '../programPaidAccessServer';

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    program_slug: 'guided',
    acquisition_source: 'purchase',
    status: 'active',
    active_from: '2026-01-01T00:00:00.000Z',
    active_to: null,
    source_ref: 'sub_123',
    ...overrides,
  };
}

describe('personHasCurrentProgramAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    mockHasEntitlement.mockResolvedValue(false);
    mockListAssignments.mockResolvedValue({ rows: [], total: 0, limit: 20, offset: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('authorizes a current entitlement without reading assignments', async () => {
    mockHasEntitlement.mockResolvedValue(true);
    await expect(personHasCurrentProgramAccess('person-1', 'guided')).resolves.toBe(true);
    expect(mockListAssignments).not.toHaveBeenCalled();
  });

  it('authorizes an active in-window independent grant', async () => {
    mockListAssignments.mockResolvedValue({
      rows: [assignment({ acquisition_source: 'admin_grant', source_ref: null })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    await expect(personHasCurrentProgramAccess('person-1', 'guided')).resolves.toBe(true);
  });

  it('denies a purchase assignment even when its source_ref is present', async () => {
    mockListAssignments.mockResolvedValue({
      rows: [assignment()],
      total: 1,
      limit: 20,
      offset: 0,
    });
    await expect(personHasCurrentProgramAccess('person-1', 'guided')).resolves.toBe(false);
  });

  it('denies a scheduled independent grant and a completed purchase', async () => {
    mockListAssignments.mockResolvedValue({
      rows: [
        assignment({
          acquisition_source: 'offer',
          active_from: '2026-12-01T00:00:00.000Z',
        }),
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    await expect(personHasCurrentProgramAccess('person-1', 'guided')).resolves.toBe(false);
  });
});
