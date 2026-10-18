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
  applyProgramEnrollmentLifecycleAction,
  calculateCurrentProgramDay,
  createOrUpdateBaselineRecommendationForEnrollment,
  createProgramEnrollment,
  createProgramEnrollmentFromAccess,
  getProgramRuntimeSummary,
  reconcileElapsedOpenEnrollment,
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
    'update',
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
  q.then = jest.fn((resolve, reject) =>
    Promise.resolve({
      data: result.data ?? null,
      error: result.error ?? null,
    }).then(resolve, reject),
  );
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

function publishedVersionRow(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function programHeaderRow() {
  return {
    id: 'program-1',
    slug: 'baseline',
    title: 'Baseline',
    tagline: null,
    description: null,
    storefront_href: null,
  };
}

describe('program runtime enrollment writes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns an existing open enrollment instead of duplicating it', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const existing = baseEnrollment({
      status: 'active',
      selected_start_date: '2026-05-20',
    });
    mockHasEntitlement.mockResolvedValue(true);
    mockFrom
      // getActiveEnrollmentForPersonProgram
      .mockReturnValueOnce(query({ data: existing }))
      // reconcile -> getVersionById (still in window)
      .mockReturnValueOnce(query({ data: publishedVersionRow() }));

    const out = await createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'baseline',
      selectedStartDate: '2026-05-20',
      timezone: 'UTC',
    });

    expect(out.id).toBe(existing.id);
    expect(out.program_version_id).toBe('version-1');
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  test('selects a generated published version for a member without an open enrollment', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const latestPublished = publishedVersionRow({
      id: '30000000-0000-4000-8000-000000000003',
      version_key: 'v3-a1b2c3d4',
      version_number: 3,
    });
    const created = baseEnrollment({
      id: 'enrollment-new',
      status: 'active',
      selected_start_date: '2026-05-22',
      program_version_id: '30000000-0000-4000-8000-000000000003',
      started_at: '2026-05-22T12:00:00.000Z',
    });
    const insertQuery = query({ singleData: created });
    mockHasEntitlement.mockResolvedValue(true);
    mockFrom
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      .mockReturnValueOnce(query({ data: latestPublished }))
      .mockReturnValueOnce(insertQuery);

    const out = await createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'baseline',
      selectedStartDate: '2026-05-22',
      timezone: 'UTC',
    });

    expect(out.program_version_id).toBe('30000000-0000-4000-8000-000000000003');
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      program_version_id: '30000000-0000-4000-8000-000000000003',
    }));
  });

  test('refuses a fresh ordinary enrollment when the catalogue prerequisite is unmet', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mockHasEntitlement.mockResolvedValue(true);
    mockFrom
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: { ...programHeaderRow(), slug: 'digestive-foundations', id: 'program-digestive' } }))
      .mockReturnValueOnce(query({ data: publishedVersionRow({ program_id: 'program-digestive', metadata: {} }) }))
      .mockReturnValueOnce(query({ data: [] }));

    await expect(createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'digestive-foundations',
      selectedStartDate: '2026-05-22',
      timezone: 'UTC',
    })).rejects.toMatchObject({ code: 'PROGRAM_PREREQUISITE_UNMET' });
    expect(mockFrom).toHaveBeenCalledTimes(4);
  });

  test('enrolls after the same person has a completed prerequisite, including by assignment', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const created = baseEnrollment({
      id: 'enrollment-digestive',
      program_slug: 'digestive-foundations',
      program_id: 'program-digestive',
      source_type: 'assignment',
      entitlement_key: null,
      assignment_id: 'assignment-1',
    });
    const insertQuery = query({ singleData: created });
    mockHasEntitlement.mockResolvedValue(false);
    mockListAssignments.mockResolvedValue({
      rows: [{ id: 'assignment-1' }],
      total: 1,
      limit: 1,
      offset: 0,
    });
    mockFrom
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: { ...programHeaderRow(), id: 'program-digestive', slug: 'digestive-foundations' } }))
      .mockReturnValueOnce(query({ data: publishedVersionRow({ id: 'version-digestive', program_id: 'program-digestive' }) }))
      .mockReturnValueOnce(query({ data: [baseEnrollment({ status: 'completed', program_slug: 'baseline', completed_at: '2026-05-01T00:00:00.000Z' })] }))
      .mockReturnValueOnce(query({ data: { id: 'assignment-1' } }))
      .mockReturnValueOnce(insertQuery);

    const out = await createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'digestive-foundations',
      selectedStartDate: '2026-05-22',
      timezone: 'UTC',
    });

    expect(out.id).toBe('enrollment-digestive');
    expect(insertQuery.insert).toHaveBeenCalled();
  });

  test('does not treat a cancelled Baseline enrollment with completed_at as a completed prerequisite', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mockHasEntitlement.mockResolvedValue(true);
    mockFrom
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: { ...programHeaderRow(), slug: 'digestive-foundations', id: 'program-digestive' } }))
      .mockReturnValueOnce(query({ data: publishedVersionRow({ program_id: 'program-digestive', metadata: {} }) }))
      .mockReturnValueOnce(query({
        data: [baseEnrollment({
          status: 'cancelled',
          program_slug: 'baseline',
          completed_at: '2026-05-01T00:00:00.000Z',
        })],
      }));

    await expect(createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'digestive-foundations',
      selectedStartDate: '2026-05-22',
      timezone: 'UTC',
    })).rejects.toMatchObject({ code: 'PROGRAM_PREREQUISITE_UNMET' });
    expect(mockFrom).toHaveBeenCalledTimes(4);
  });

  test('still enrolls when a genuine Baseline completion follows a cancelled completed_at row', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const created = baseEnrollment({
      id: 'enrollment-digestive',
      program_slug: 'digestive-foundations',
      program_id: 'program-digestive',
      source_type: 'assignment',
      entitlement_key: null,
      assignment_id: 'assignment-1',
    });
    const insertQuery = query({ singleData: created });
    mockHasEntitlement.mockResolvedValue(false);
    mockListAssignments.mockResolvedValue({
      rows: [{ id: 'assignment-1' }],
      total: 1,
      limit: 1,
      offset: 0,
    });
    mockFrom
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: { ...programHeaderRow(), id: 'program-digestive', slug: 'digestive-foundations' } }))
      .mockReturnValueOnce(query({ data: publishedVersionRow({ id: 'version-digestive', program_id: 'program-digestive' }) }))
      .mockReturnValueOnce(query({
        data: [
          baseEnrollment({
            id: 'baseline-cancelled',
            status: 'cancelled',
            program_slug: 'baseline',
            completed_at: '2026-04-01T00:00:00.000Z',
          }),
          baseEnrollment({
            id: 'baseline-completed',
            status: 'completed',
            program_slug: 'baseline',
            completed_at: '2026-05-01T00:00:00.000Z',
          }),
        ],
      }))
      .mockReturnValueOnce(query({ data: { id: 'assignment-1' } }))
      .mockReturnValueOnce(insertQuery);

    const out = await createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'digestive-foundations',
      selectedStartDate: '2026-05-22',
      timezone: 'UTC',
    });

    expect(out.id).toBe('enrollment-digestive');
    expect(insertQuery.insert).toHaveBeenCalled();
  });

  test('does not treat another person completion row as this person prerequisite', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mockHasEntitlement.mockResolvedValue(true);
    mockFrom
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: { ...programHeaderRow(), id: 'program-digestive', slug: 'digestive-foundations' } }))
      .mockReturnValueOnce(query({ data: publishedVersionRow({ program_id: 'program-digestive' }) }))
      .mockReturnValueOnce(query({ data: [baseEnrollment({ person_id: 'person-2', status: 'completed', program_slug: 'baseline', completed_at: '2026-05-01T00:00:00.000Z' })] }));

    await expect(createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'digestive-foundations',
      selectedStartDate: '2026-05-22',
      timezone: 'UTC',
    })).rejects.toMatchObject({ code: 'PROGRAM_PREREQUISITE_UNMET' });
  });

  test('refuses ordinary enrollment into a validation-only published version', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mockHasEntitlement.mockResolvedValue(true);
    mockListAssignments.mockResolvedValue({ rows: [{ id: 'assignment-1' }], total: 1, limit: 1, offset: 0 });
    mockFrom
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      .mockReturnValueOnce(query({ data: publishedVersionRow({ metadata: { content_status: 'validation_only' } }) }));

    await expect(createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'digestive-foundations',
      selectedStartDate: '2026-05-22',
      timezone: 'UTC',
    })).rejects.toMatchObject({ code: 'PROGRAM_VALIDATION_ONLY' });
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });

  test('keeps an existing open validation-only enrollment idempotent', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const existing = baseEnrollment({
      program_slug: 'digestive-foundations',
      status: 'active',
    });
    mockHasEntitlement.mockResolvedValue(true);
    mockFrom
      .mockReturnValueOnce(query({ data: existing }))
      .mockReturnValueOnce(query({ data: publishedVersionRow() }));

    const out = await createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'digestive-foundations',
      selectedStartDate: '2026-05-22',
      timezone: 'UTC',
    });

    expect(out.id).toBe(existing.id);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  test('lets a verified admin grant bypass prerequisite and validation-only gates', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const created = baseEnrollment({ id: 'qa-enrollment', program_slug: 'digestive-foundations' });
    const insertQuery = query({ singleData: created });
    mockHasEntitlement.mockResolvedValue(true);
    mockFrom
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: { ...programHeaderRow(), id: 'program-digestive', slug: 'digestive-foundations' } }))
      .mockReturnValueOnce(query({ data: publishedVersionRow({
        program_id: 'program-digestive',
        metadata: { content_status: 'validation_only' },
      }) }))
      .mockReturnValueOnce(insertQuery);

    const out = await createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'digestive-foundations',
      selectedStartDate: '2026-05-22',
      timezone: 'UTC',
      authorization: 'verified_admin_grant',
    });

    expect(out.id).toBe('qa-enrollment');
    expect(insertQuery.insert).toHaveBeenCalled();
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

  test('reconciles overdue open enrollment to durable completed with completed_at', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const open = baseEnrollment({
      status: 'active',
      selected_start_date: '2026-05-01',
      completed_at: null,
    });
    const completedRow = {
      ...open,
      status: 'completed',
      completed_at: '2026-05-22T12:00:00.000Z',
      updated_at: '2026-05-22T12:00:00.000Z',
    };
    const updateQuery = query({ data: completedRow });

    mockFrom.mockReturnValueOnce(updateQuery);

    const out = await reconcileElapsedOpenEnrollment(open, {
      now: new Date('2026-05-22T12:00:00.000Z'),
      durationDays: 21,
    });

    expect(out.status).toBe('completed');
    expect(out.completed_at).toBe('2026-05-22T12:00:00.000Z');
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        completed_at: '2026-05-22T12:00:00.000Z',
      }),
    );
    expect(updateQuery.eq).toHaveBeenCalledWith('id', open.id);
    expect(updateQuery.eq).toHaveBeenCalledWith('person_id', open.person_id);
    expect(updateQuery.in).toHaveBeenCalledWith('status', [
      'pre_start',
      'active',
      'paused',
    ]);
  });

  test('reconciliation is idempotent and preserves existing completed_at', async () => {
    const already = baseEnrollment({
      status: 'completed',
      selected_start_date: '2026-05-01',
      completed_at: '2026-05-21T00:00:00.000Z',
    });

    const out = await reconcileElapsedOpenEnrollment(already, {
      now: new Date('2026-05-30T12:00:00.000Z'),
      durationDays: 21,
    });

    expect(out).toEqual(already);
    expect(mockFrom).not.toHaveBeenCalled();

    const openWithStamp = baseEnrollment({
      status: 'active',
      selected_start_date: '2026-05-01',
      completed_at: '2026-05-21T00:00:00.000Z',
    });
    const preserved = {
      ...openWithStamp,
      status: 'completed',
      completed_at: '2026-05-21T00:00:00.000Z',
      updated_at: '2026-05-30T12:00:00.000Z',
    };
    mockFrom.mockReturnValueOnce(query({ data: preserved }));

    const second = await reconcileElapsedOpenEnrollment(openWithStamp, {
      now: new Date('2026-05-30T12:00:00.000Z'),
      durationDays: 21,
    });
    expect(second.completed_at).toBe('2026-05-21T00:00:00.000Z');
  });

  test('concurrent reconcile that updates zero rows re-reads the winner', async () => {
    const open = baseEnrollment({
      status: 'active',
      selected_start_date: '2026-05-01',
    });
    const winner = {
      ...open,
      status: 'completed',
      completed_at: '2026-05-22T11:00:00.000Z',
      updated_at: '2026-05-22T11:00:00.000Z',
    };
    mockFrom
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: winner }));

    const out = await reconcileElapsedOpenEnrollment(open, {
      now: new Date('2026-05-22T12:00:00.000Z'),
      durationDays: 21,
    });
    expect(out.status).toBe('completed');
    expect(out.completed_at).toBe('2026-05-22T11:00:00.000Z');
  });

  test('elapsed open enrollment does not block restart; creates on latest published', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const elapsed = baseEnrollment({
      id: 'enrollment-old',
      status: 'active',
      selected_start_date: '2026-05-01',
      program_version_id: 'version-1',
    });
    const completedRow = {
      ...elapsed,
      status: 'completed',
      completed_at: '2026-05-22T12:00:00.000Z',
      updated_at: '2026-05-22T12:00:00.000Z',
    };
    const latestPublished = publishedVersionRow({
      id: 'version-2',
      version_key: 'baseline-v2',
      version_number: 2,
    });
    const created = baseEnrollment({
      id: 'enrollment-new',
      status: 'active',
      selected_start_date: '2026-05-22',
      program_version_id: 'version-2',
      started_at: '2026-05-22T12:00:00.000Z',
    });

    mockHasEntitlement.mockResolvedValue(true);
    mockFrom
      // getActiveEnrollmentForPersonProgram
      .mockReturnValueOnce(query({ data: elapsed }))
      // reconcile getVersionById
      .mockReturnValueOnce(query({ data: publishedVersionRow() }))
      // reconcile update
      .mockReturnValueOnce(query({ data: completedRow }))
      // getProgramBySlug
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      // getLatestPublishedVersion
      .mockReturnValueOnce(query({ data: latestPublished }))
      // insert
      .mockReturnValueOnce(query({ singleData: created }));

    const out = await createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'baseline',
      selectedStartDate: '2026-05-22',
      timezone: 'UTC',
    });

    expect(out.id).toBe('enrollment-new');
    expect(out.program_version_id).toBe('version-2');
  });

  test('rejects explicitly supplied draft or archived program versions', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));

    for (const status of ['draft', 'archived'] as const) {
      mockFrom
        .mockReturnValueOnce(query({ data: null }))
        .mockReturnValueOnce(query({ data: programHeaderRow() }))
        .mockReturnValueOnce(
          query({
            data: publishedVersionRow({ id: `version-${status}`, status }),
          }),
        );

      await expect(
        createProgramEnrollment({
          personId: 'person-1',
          programSlug: 'baseline',
          selectedStartDate: '2026-05-22',
          timezone: 'UTC',
          sourceType: 'admin_grant',
          programVersionId: `version-${status}`,
        }),
      ).rejects.toMatchObject({ code: 'PROGRAM_VERSION_NOT_PUBLISHED' });
    }
  });

  test('unique constraint race still resolves to the open enrollment', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const raced = baseEnrollment({
      id: 'enrollment-raced',
      status: 'active',
      selected_start_date: '2026-05-22',
    });

    mockHasEntitlement.mockResolvedValue(true);
    mockFrom
      // getActiveEnrollment — none
      .mockReturnValueOnce(query({ data: null }))
      // getProgramBySlug
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      // getLatestPublishedVersion
      .mockReturnValueOnce(query({ data: publishedVersionRow() }))
      // insert unique violation
      .mockReturnValueOnce(
        query({
          singleData: null,
          singleError: { code: '23505', message: 'duplicate key' },
        }),
      )
      // raced getActiveEnrollmentForPersonProgram
      .mockReturnValueOnce(query({ data: raced }))
      // reconcile version lookup (still in window)
      .mockReturnValueOnce(query({ data: publishedVersionRow() }));

    const out = await createProgramEnrollmentFromAccess({
      personId: 'person-1',
      programSlug: 'baseline',
      selectedStartDate: '2026-05-22',
      timezone: 'UTC',
    });

    expect(out.id).toBe('enrollment-raced');
  });

  test('runtime summary reconciles elapsed open enrollment before returning', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const open = baseEnrollment({
      status: 'active',
      selected_start_date: '2026-05-01',
    });
    const completedRow = {
      ...open,
      status: 'completed',
      completed_at: '2026-05-22T12:00:00.000Z',
      updated_at: '2026-05-22T12:00:00.000Z',
    };
    const version = publishedVersionRow();

    mockFrom
      // load enrollment
      .mockReturnValueOnce(query({ data: open }))
      // getVersionById for reconcile
      .mockReturnValueOnce(query({ data: version }))
      // reconcile update
      .mockReturnValueOnce(query({ data: completedRow }))
      // getProgramBySlug
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      // getLatestCheckinResponse
      .mockReturnValueOnce(query({ data: null }))
      // getLatestRecommendation
      .mockReturnValueOnce(query({ data: null }))
      // getCheckinTemplateForDay
      .mockReturnValueOnce(query({ data: null }));

    const summary = await getProgramRuntimeSummary(open.id);
    expect(summary?.enrollment.status).toBe('completed');
    expect(summary?.resolved_status).toBe('completed');
    expect(summary?.enrollment.completed_at).toBe('2026-05-22T12:00:00.000Z');
  });

  test('lifecycle pause remains available for in-window active enrollments', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    const open = baseEnrollment({
      status: 'active',
      selected_start_date: '2026-05-20',
    });
    const pausedRow = {
      ...open,
      status: 'paused',
      metadata: { pause_started_at: '2026-05-22' },
      updated_at: '2026-05-22T12:00:00.000Z',
    };
    const version = publishedVersionRow();

    mockFrom
      // loadOwnedEnrollment
      .mockReturnValueOnce(query({ data: open }))
      // reconcile getVersionById
      .mockReturnValueOnce(query({ data: version }))
      // resolveEnrollmentDurationDays after reconcile
      .mockReturnValueOnce(query({ data: version }))
      // applyEnrollmentUpdate
      .mockReturnValueOnce(query({ data: pausedRow }))
      // summaryAfterLifecycle ownership
      .mockReturnValueOnce(query({ data: { id: open.id } }))
      // getProgramRuntimeSummary enrollment
      .mockReturnValueOnce(query({ data: pausedRow }))
      // getVersionById for reconcile in summary
      .mockReturnValueOnce(query({ data: version }))
      // getProgramBySlug
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      // latest checkin
      .mockReturnValueOnce(query({ data: null }))
      // latest recommendation
      .mockReturnValueOnce(query({ data: null }))
      // checkin template
      .mockReturnValueOnce(query({ data: null }));

    const summary = await applyProgramEnrollmentLifecycleAction({
      personId: 'person-1',
      enrollmentId: open.id,
      action: 'pause',
      now: new Date('2026-05-22T12:00:00.000Z'),
    });

    expect(summary.resolved_status).toBe('paused');
  });

  test('runtime summary freezes the accessible day at pause start', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T12:00:00.000Z'));
    const paused = baseEnrollment({
      status: 'paused',
      selected_start_date: '2026-05-20',
      metadata: { pause_started_at: '2026-05-22' },
    });
    const version = publishedVersionRow();
    mockFrom
      .mockReturnValueOnce(query({ data: paused }))
      .mockReturnValueOnce(query({ data: version }))
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: null }));

    const summary = await getProgramRuntimeSummary(paused.id);
    expect(summary?.resolved_status).toBe('paused');
    expect(summary?.current_day).toBe(3);
  });

  test('fail-closes paused historical access at Day 0 when pause_started_at is missing or invalid', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T12:00:00.000Z'));
    const todayDay = calculateCurrentProgramDay({
      selectedStartDate: '2026-05-20',
      timezone: 'UTC',
      now: new Date('2026-05-27T12:00:00.000Z'),
    });
    expect(todayDay).toBe(8);

    const untrustedPauseMetadata = [
      {},
      { pause_started_at: null },
      { pause_started_at: '' },
      { pause_started_at: 'not-a-date' },
      { pause_started_at: '2026-02-31' },
      { pause_started_at: '2026-05-22T12:00:00.000Z' },
      { pause_started_at: 20260522 },
    ];

    for (const metadata of untrustedPauseMetadata) {
      mockFrom.mockReset();
      const paused = baseEnrollment({
        status: 'paused',
        selected_start_date: '2026-05-20',
        metadata: metadata as ProgramEnrollment['metadata'],
      });
      const version = publishedVersionRow();
      // Day 0 does not query a check-in template.
      mockFrom
        .mockReturnValueOnce(query({ data: paused }))
        .mockReturnValueOnce(query({ data: version }))
        .mockReturnValueOnce(query({ data: programHeaderRow() }))
        .mockReturnValueOnce(query({ data: null }))
        .mockReturnValueOnce(query({ data: null }));

      const summary = await getProgramRuntimeSummary(paused.id);
      expect(summary?.resolved_status).toBe('paused');
      expect(summary?.current_day).toBe(0);
    }

    mockFrom.mockReset();
    const pauseUntilOnly = baseEnrollment({
      status: 'active',
      selected_start_date: '2026-05-20',
      pause_until: '2026-06-01',
      metadata: {},
    });
    mockFrom
      .mockReturnValueOnce(query({ data: pauseUntilOnly }))
      .mockReturnValueOnce(query({ data: publishedVersionRow() }))
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: null }));
    const derivedPause = await getProgramRuntimeSummary(pauseUntilOnly.id);
    expect(derivedPause?.resolved_status).toBe('paused');
    expect(derivedPause?.current_day).toBe(0);
  });

  test('keeps calendar days for active and pre-start enrollments without pause metadata', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T12:00:00.000Z'));
    const active = baseEnrollment({
      status: 'active',
      selected_start_date: '2026-05-20',
      metadata: {},
    });
    mockFrom
      .mockReturnValueOnce(query({ data: active }))
      .mockReturnValueOnce(query({ data: publishedVersionRow() }))
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: null }));

    const activeSummary = await getProgramRuntimeSummary(active.id);
    expect(activeSummary?.resolved_status).toBe('active');
    expect(activeSummary?.current_day).toBe(8);

    const preStart = baseEnrollment({
      id: 'enrollment-pre-start',
      status: 'pre_start',
      selected_start_date: '2026-06-01',
      metadata: {},
    });
    mockFrom
      .mockReturnValueOnce(query({ data: preStart }))
      .mockReturnValueOnce(query({ data: publishedVersionRow() }))
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: null }));

    const preStartSummary = await getProgramRuntimeSummary(preStart.id);
    expect(preStartSummary?.resolved_status).toBe('pre_start');
    expect(preStartSummary?.current_day).toBe(0);
  });

  test('runtime summary freezes completed historical access at completion day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T12:00:00.000Z'));
    const completed = baseEnrollment({
      status: 'completed',
      selected_start_date: '2026-05-20',
      completed_at: '2026-05-22T12:00:00.000Z',
    });
    const version = publishedVersionRow();
    mockFrom
      .mockReturnValueOnce(query({ data: completed }))
      .mockReturnValueOnce(query({ data: version }))
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: null }))
      .mockReturnValueOnce(query({ data: null }));

    const summary = await getProgramRuntimeSummary(completed.id);
    expect(summary?.resolved_status).toBe('completed');
    expect(summary?.current_day).toBe(3);
  });

  test('future/pre-start and in-window active enrollments are not auto-completed', async () => {
    const preStart = baseEnrollment({
      status: 'pre_start',
      selected_start_date: '2026-06-01',
    });
    const outPre = await reconcileElapsedOpenEnrollment(preStart, {
      now: new Date('2026-05-22T12:00:00.000Z'),
      durationDays: 21,
    });
    expect(outPre.status).toBe('pre_start');
    expect(mockFrom).not.toHaveBeenCalled();

    const active = baseEnrollment({
      status: 'active',
      selected_start_date: '2026-05-10',
    });
    const outActive = await reconcileElapsedOpenEnrollment(active, {
      now: new Date('2026-05-22T12:00:00.000Z'),
      durationDays: 21,
    });
    expect(outActive.status).toBe('active');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('paused enrollments are not duration-auto-completed while paused', async () => {
    const paused = baseEnrollment({
      status: 'paused',
      selected_start_date: '2026-05-01',
    });
    const out = await reconcileElapsedOpenEnrollment(paused, {
      now: new Date('2026-05-30T12:00:00.000Z'),
      durationDays: 21,
    });
    expect(out.status).toBe('paused');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('program runtime check-in responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('upserts a skipped check-in row explicitly', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T00:00:00.000Z'));
    const enrollment = baseEnrollment({
      selected_start_date: '2026-05-20',
      status: 'active',
    });
    const responseRow = {
      id: 'response-1',
      enrollment_id: enrollment.id,
      checkin_template_id: 'template-7',
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
    const template = {
      id: 'template-7',
      program_version_id: enrollment.program_version_id,
      checkin_day: 7,
      title: 'Day 7',
      description: null,
      prompt_md: null,
      questions_json: [],
      status: 'published',
      metadata: {},
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    };

    const upsertQuery = query({ singleData: responseRow });
    const version = publishedVersionRow();

    mockFrom
      // getEnrollmentForPerson
      .mockReturnValueOnce(query({ data: enrollment }))
      // enrolled version must remain published
      .mockReturnValueOnce(query({ data: version }))
      // a matching published template is required
      .mockReturnValueOnce(query({ data: template }))
      // program_checkin_responses upsert
      .mockReturnValueOnce(upsertQuery)
      // getProgramRuntimeSummaryForPerson ownership lookup
      .mockReturnValueOnce(query({ data: { id: enrollment.id } }))
      // getProgramRuntimeSummary enrollment
      .mockReturnValueOnce(query({ data: enrollment }))
      // getVersionById (reconcile / summary)
      .mockReturnValueOnce(query({ data: version }))
      // getProgramBySlug
      .mockReturnValueOnce(query({ data: programHeaderRow() }))
      // getLatestCheckinResponse
      .mockReturnValueOnce(query({ data: responseRow }))
      // getLatestRecommendation
      .mockReturnValueOnce(query({ data: null }))
      // getCheckinTemplateForDay for summary
      .mockReturnValueOnce(query({ data: template }));

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
        checkin_template_id: template.id,
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

  test('refuses a response when that version has no published template for the day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T00:00:00.000Z'));
    const enrollment = baseEnrollment({ selected_start_date: '2026-05-20', status: 'active' });
    mockFrom
      .mockReturnValueOnce(query({ data: enrollment }))
      .mockReturnValueOnce(query({ data: publishedVersionRow() }))
      .mockReturnValueOnce(query({ data: null }));

    await expect(respondToProgramCheckin({
      personId: 'person-1', enrollmentId: enrollment.id, checkinDay: 7,
      responseStatus: 'skipped', skippedReason: 'No template available',
    })).rejects.toMatchObject({ code: 'PROGRAM_CHECKIN_TEMPLATE_DENIED' });
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });

  test('refuses new check-in writes for paused and completed enrollments', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T00:00:00.000Z'));
    for (const status of ['paused', 'completed'] as const) {
      mockFrom
        .mockReturnValueOnce(query({ data: baseEnrollment({ status, selected_start_date: '2026-05-20' }) }))
        .mockReturnValueOnce(query({ data: publishedVersionRow() }));
      await expect(respondToProgramCheckin({
        personId: 'person-1',
        enrollmentId: 'enrollment-1',
        checkinDay: 7,
        responseStatus: 'completed',
        responsesJson: { energy: 3 },
      })).rejects.toMatchObject({ code: 'PROGRAM_CHECKIN_NOT_AVAILABLE' });
    }
  });

  test('refuses check-in responses for future program days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T00:00:00.000Z'));
    const enrollment = baseEnrollment({ selected_start_date: '2026-05-20', status: 'active' });
    mockFrom
      .mockReturnValueOnce(query({ data: enrollment }))
      .mockReturnValueOnce(query({ data: publishedVersionRow() }))
      .mockReturnValueOnce(query({ data: {
        id: 'template-9',
        program_version_id: enrollment.program_version_id,
        checkin_day: 9,
        title: 'Day 9',
        description: null,
        prompt_md: null,
        questions_json: [],
        status: 'published',
        metadata: {},
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      } }));

    await expect(respondToProgramCheckin({
      personId: 'person-1', enrollmentId: enrollment.id, checkinDay: 9,
      responseStatus: 'completed', responsesJson: { test: true },
    })).rejects.toMatchObject({ code: 'PROGRAM_CHECKIN_NOT_AVAILABLE' });
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });
});

describe('baseline recommendation persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('updates an existing generated Day 21 recommendation idempotently', async () => {
    const enrollment = baseEnrollment();
    const responseRows = [7, 14, 21].map((day) => ({
      id: `response-${day}`,
      enrollment_id: enrollment.id,
      checkin_template_id: `template-${day}`,
      checkin_day: day,
      response_status: 'completed',
      response_payload_json: {
        digestion_score: 4,
        digestion_modifier: 'same',
        bm_frequency: 'daily',
        meals_per_day: '3',
        protein_consistency: 'steady',
        hunger_pattern: 'steady',
        energy_score: 4,
        sleep_score: 4,
        gi_red_flags: [],
        stability_delta: day === 21 ? 1 : undefined,
      },
      skipped_reason: null,
      responded_at: '2026-05-27T00:00:00.000Z',
      skipped_at: null,
      input_snapshot_json: {},
      computed_metrics_snapshot_json: {},
      metadata: {},
      created_at: '2026-05-27T00:00:00.000Z',
      updated_at: '2026-05-27T00:00:00.000Z',
    }));
    const existingRecommendation = {
      id: 'recommendation-1',
      enrollment_id: enrollment.id,
      based_on_checkin_response_id: 'response-21',
      recommendation_type: 'baseline_day_21_v1',
      program_day: 21,
      status: 'generated',
      recommendation_payload_json: {},
      input_snapshot_json: {},
      computed_metrics_snapshot_json: {},
      metadata: {},
      generated_at: '2026-05-27T00:00:00.000Z',
      acted_at: null,
      created_at: '2026-05-27T00:00:00.000Z',
      updated_at: '2026-05-27T00:00:00.000Z',
    };
    const updatedRecommendation = {
      ...existingRecommendation,
      recommendation_payload_json: {
        action_type: 'guided_program',
        recommended_step: 'INFLAMMATION_REGULATION',
        reason_snippet:
          'Baseline signals look stable enough to review a general inflammation regulation path next.',
        rule_version: 'baseline_recommendation_engine_v1',
      },
    };
    const updateQuery = query({ singleData: updatedRecommendation });

    mockFrom
      // listBaselineCheckinResponses
      .mockReturnValueOnce(query({ data: responseRows }))
      // getBaselineDay21Recommendation
      .mockReturnValueOnce(query({ data: existingRecommendation }))
      // update existing generated recommendation
      .mockReturnValueOnce(updateQuery);

    const result =
      await createOrUpdateBaselineRecommendationForEnrollment(enrollment);

    expect(result?.id).toBe(existingRecommendation.id);
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollment_id: enrollment.id,
        based_on_checkin_response_id: 'response-21',
        recommendation_type: 'baseline_day_21_v1',
        program_day: 21,
        status: 'generated',
        recommendation_payload_json: expect.objectContaining({
          action_type: 'guided_program',
          recommended_step: 'INFLAMMATION_REGULATION',
        }),
        computed_metrics_snapshot_json: expect.objectContaining({
          completed_checkin_count: 3,
        }),
      }),
    );
  });
});
