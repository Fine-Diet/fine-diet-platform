import type { ProgramEnrollment } from '../runtimeTypes';

let mockFrom!: jest.Mock;
let mockHasEntitlement!: jest.Mock;
let mockListAssignments!: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  return {
    supabaseAdmin: {
      from: mockFrom,
    },
  };
});

jest.mock('@/lib/access/accessService', () => {
  mockHasEntitlement = jest.fn();
  return {
    hasEntitlement: mockHasEntitlement,
  };
});

jest.mock('@/lib/plans/programAssignmentServerService', () => {
  mockListAssignments = jest.fn();
  return {
    listAssignments: mockListAssignments,
  };
});

import {
  calculateCurrentProgramDay,
  createProgramEnrollmentFromAccess,
  respondToProgramCheckin,
  resolveEnrollmentStatus,
} from '../programRuntimeServerService';

function baseEnrollment(
  overrides: Partial<ProgramEnrollment> = {},
): ProgramEnrollment {
  return {
    id: 'enrollment-1',
    person_id: 'person-1',
    program_id: 'program-1',
    program_slug: 'baseline',
    program_version_id: 'version-1',
    source_type: 'entitlement',
    source_ref: null,
    entitlement_key: 'program:baseline',
    assignment_id: null,
    purchase_date: null,
    selected_start_date: '2026-05-20',
    started_at: null,
    completed_at: null,
    status: 'active',
    timezone: 'UTC',
    current_capacity: 'steady',
    paused_days_total: 0,
    pause_until: null,
    input_snapshot_json: {},
    computed_metrics_snapshot_json: {},
    metadata: {},
    created_by_user_id: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function query(result: {
  data?: unknown;
  error?: unknown;
  singleData?: unknown;
  singleError?: unknown;
}) {
  const q: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'eq',
    'in',
    'order',
    'limit',
    'insert',
    'upsert',
  ]) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  q.maybeSingle = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  q.single = jest.fn().mockResolvedValue({
    data: result.singleData ?? result.data ?? null,
    error: result.singleError ?? result.error ?? null,
  });
  return q;
}

describe('program runtime date/status helpers', () => {
  test('calculates current_day with day 1 on selected_start_date', () => {
    expect(
      calculateCurrentProgramDay({
        selectedStartDate: '2026-05-20',
        timezone: 'UTC',
        now: new Date('2026-05-20T12:00:00.000Z'),
      }),
    ).toBe(1);

    expect(
      calculateCurrentProgramDay({
        selectedStartDate: '2026-05-20',
        timezone: 'UTC',
        now: new Date('2026-05-22T12:00:00.000Z'),
      }),
    ).toBe(3);
  });

  test('resolves pre_start before selected_start_date and active on start date', () => {
    const enrollment = baseEnrollment({
      selected_start_date: '2026-05-20',
      status: 'pre_start',
    });

    expect(
      resolveEnrollmentStatus(
        enrollment,
        new Date('2026-05-19T12:00:00.000Z'),
      ),
    ).toBe('pre_start');

    expect(
      resolveEnrollmentStatus(
        enrollment,
        new Date('2026-05-20T12:00:00.000Z'),
      ),
    ).toBe('active');
  });

  test('resolves paused when status is paused or pause_until is still active', () => {
    expect(
      resolveEnrollmentStatus(
        baseEnrollment({ status: 'paused' }),
        new Date('2026-05-22T12:00:00.000Z'),
      ),
    ).toBe('paused');

    expect(
      resolveEnrollmentStatus(
        baseEnrollment({ status: 'active', pause_until: '2026-05-23' }),
        new Date('2026-05-22T12:00:00.000Z'),
      ),
    ).toBe('paused');
  });
});

describe('program runtime enrollment writes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns an existing open enrollment instead of duplicating it', async () => {
    const existing = baseEnrollment({ status: 'active' });
    mockHasEntitlement.mockResolvedValue(true);
    mockFrom.mockReturnValueOnce(query({ data: existing }));

    const out = await createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'baseline',
      selectedStartDate: '2026-05-20',
      timezone: 'UTC',
    });

    expect(out.id).toBe(existing.id);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('throws when the person has no entitlement or assignment access', async () => {
    mockHasEntitlement.mockResolvedValue(false);
    mockListAssignments.mockResolvedValue({ rows: [], total: 0, limit: 1, offset: 0 });

    await expect(
      createProgramEnrollmentFromAccess({
        personId: 'person-1',
        programSlug: 'baseline',
        selectedStartDate: '2026-05-20',
        timezone: 'UTC',
      }),
    ).rejects.toMatchObject({ code: 'PROGRAM_ACCESS_DENIED' });

    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('program runtime check-in responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('upserts a skipped check-in row explicitly', async () => {
    const enrollment = baseEnrollment();
    const responseRow = {
      id: 'response-1',
      enrollment_id: enrollment.id,
      checkin_template_id: null,
      checkin_day: 7,
      response_status: 'skipped',
      response_payload_json: {},
      skipped_reason: 'Travel day',
      responded_at: null,
      skipped_at: '2026-05-27T00:00:00.000Z',
      input_snapshot_json: {},
      computed_metrics_snapshot_json: {},
      metadata: {},
      created_at: '2026-05-27T00:00:00.000Z',
      updated_at: '2026-05-27T00:00:00.000Z',
    };

    const upsertQuery = query({ singleData: responseRow });

    mockFrom
      // getEnrollmentForPerson
      .mockReturnValueOnce(query({ data: enrollment }))
      // getCheckinTemplateForDay (optional day lookup)
      .mockReturnValueOnce(query({ data: null }))
      // program_checkin_responses upsert
      .mockReturnValueOnce(upsertQuery)
      // getProgramRuntimeSummaryForPerson ownership lookup
      .mockReturnValueOnce(query({ data: { id: enrollment.id } }))
      // getProgramRuntimeSummary enrollment
      .mockReturnValueOnce(query({ data: enrollment }))
      // getProgramBySlug
      .mockReturnValueOnce(
        query({
          data: {
            id: 'program-1',
            slug: 'baseline',
            title: 'Baseline',
            tagline: null,
            description: null,
            storefront_href: null,
          },
        }),
      )
      // getVersionById
      .mockReturnValueOnce(
        query({
          data: {
            id: 'version-1',
            program_id: 'program-1',
            version_key: 'baseline-v1',
            version_label: 'Baseline v1',
            version_number: 1,
            status: 'published',
            duration_days: 21,
            default_unlock_day: 1,
            published_at: '2026-05-01T00:00:00.000Z',
            metadata: {},
            created_by_user_id: null,
            created_at: '2026-05-01T00:00:00.000Z',
            updated_at: '2026-05-01T00:00:00.000Z',
          },
        }),
      )
      // getLatestCheckinResponse
      .mockReturnValueOnce(query({ data: responseRow }))
      // getLatestRecommendation
      .mockReturnValueOnce(query({ data: null }))
      // getCheckinTemplateForDay for summary
      .mockReturnValueOnce(query({ data: null }));

    const result = await respondToProgramCheckin({
      personId: 'person-1',
      enrollmentId: enrollment.id,
      checkinDay: 7,
      responseStatus: 'skipped',
      skippedReason: 'Travel day',
    });

    expect(result.response.response_status).toBe('skipped');
    expect(result.response.skipped_reason).toBe('Travel day');
    expect(upsertQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollment_id: enrollment.id,
        checkin_day: 7,
        response_status: 'skipped',
        response_payload_json: {},
        skipped_reason: 'Travel day',
        responded_at: null,
      }),
      { onConflict: 'enrollment_id,checkin_day' },
    );
    expect(result.summary.enrollment.id).toBe(enrollment.id);
  });
});
