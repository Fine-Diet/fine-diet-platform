const mockRequireJournalAuth = jest.fn();
const mockResolvePerson = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  resolveJournalTargetPerson: (...args: unknown[]) => mockResolvePerson(...args),
}));

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import handler from '../runtime-summary';

function query(data: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'update']) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  q.maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
  q.then = jest.fn((resolve, reject) =>
    Promise.resolve({ data, error: null }).then(resolve, reject),
  );
  return q;
}

function response() {
  const out: { statusCode: number; body?: unknown } = { statusCode: 200 };
  const res = {
    status(code: number) { out.statusCode = code; return res; },
    json(body: unknown) { out.body = body; return res; },
    setHeader() { return res; },
  };
  return { res, out };
}

const personId = 'person-1';
const template = {
  id: 'template-8',
  program_version_id: 'version-1',
  checkin_day: 8,
  title: 'Day 8',
  description: null,
  prompt_md: 'How do you feel today?',
  questions_json: [{ id: 'q8', kind: 'text' }],
  status: 'published',
  metadata: {},
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
};
const submitted = {
  id: 'response-7',
  enrollment_id: 'enrollment-1',
  checkin_template_id: 'template-7',
  checkin_day: 7,
  response_status: 'completed',
  response_payload_json: { energy: 4 },
  skipped_reason: null,
  responded_at: '2026-05-26T12:00:00.000Z',
  skipped_at: null,
  input_snapshot_json: {},
  computed_metrics_snapshot_json: {},
  metadata: {},
  created_at: '2026-05-26T12:00:00.000Z',
  updated_at: '2026-05-26T12:00:00.000Z',
};

function enrollment(overrides: Record<string, unknown>) {
  return {
    id: 'enrollment-1',
    person_id: personId,
    program_id: 'program-1',
    program_slug: 'baseline',
    program_version_id: 'version-1',
    source_type: 'entitlement',
    source_ref: null,
    entitlement_key: 'program:baseline',
    assignment_id: null,
    purchase_date: null,
    selected_start_date: '2026-05-20',
    started_at: '2026-05-20T00:00:00.000Z',
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
    updated_at: '2026-05-27T12:00:00.000Z',
    ...overrides,
  };
}

function installReads(row: Record<string, unknown>, options: { template?: boolean; reconcile?: Record<string, unknown> } = {}) {
  let enrollmentReads = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === 'program_enrollments') {
      enrollmentReads += 1;
      if (enrollmentReads === 1) return query([row]);
      if (enrollmentReads === 2) return query(row);
      return query(options.reconcile ?? row);
    }
    if (table === 'program_versions') {
      return query({
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
      });
    }
    if (table === 'programs') {
      return query({
        id: 'program-1',
        slug: 'baseline',
        title: 'Baseline',
        tagline: null,
        description: null,
        storefront_href: null,
      });
    }
    if (table === 'program_checkin_responses') return query(submitted);
    if (table === 'program_recommendations') return query(null);
    if (table === 'program_checkin_templates') return query(options.template ? template : null);
    throw new Error(`unexpected table ${table}`);
  });
}

async function getSummaryJson() {
  const { res, out } = response();
  await handler({ method: 'GET', query: {} } as never, res as never);
  expect(out.statusCode).toBe(200);
  const body = out.body as { summaries: Array<Record<string, unknown>> };
  expect(body.summaries).toHaveLength(1);
  return body.summaries[0];
}

describe('runtime summary API historical prompts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T12:00:00.000Z'));
    mockRequireJournalAuth.mockResolvedValue({
      personId,
      user: { id: 'user-1', role: 'member' },
    });
    mockResolvePerson.mockResolvedValue(personId);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns the active check-in prompt and the submitted response', async () => {
    installReads(enrollment({ status: 'active', metadata: {} }), { template: true });
    const summary = await getSummaryJson();
    expect(summary.resolved_status).toBe('active');
    expect(summary.current_day).toBe(8);
    expect(summary.next_checkin_template).toMatchObject({
      prompt_md: 'How do you feel today?',
      questions_json: [{ id: 'q8', kind: 'text' }],
    });
    expect(summary.latest_checkin_response).toMatchObject({
      checkin_day: 7,
      response_payload_json: { energy: 4 },
    });
  });

  test('omits paused and completed prompts while returning the submitted response', async () => {
    installReads(enrollment({
      status: 'paused',
      metadata: { pause_started_at: '2026-05-27' },
    }), { template: true });
    const paused = await getSummaryJson();
    expect(paused.resolved_status).toBe('paused');
    expect(paused.current_day).toBe(8);
    expect(paused.next_checkin_template).toBeNull();
    expect(paused.latest_checkin_response).toMatchObject({ checkin_day: 7 });
    expect(mockFrom.mock.calls.map((call) => call[0])).not.toContain('program_checkin_templates');

    installReads(enrollment({
      status: 'completed',
      completed_at: '2026-05-22T18:00:00.000Z',
    }), { template: true });
    const completed = await getSummaryJson();
    expect(completed.resolved_status).toBe('completed');
    expect(completed.next_checkin_template).toBeNull();
    expect(completed.latest_checkin_response).toMatchObject({
      response_payload_json: { energy: 4 },
    });

    installReads(enrollment({
      status: 'active',
      completed_at: '2026-05-22T18:00:00.000Z',
    }), {
      template: true,
      reconcile: enrollment({
        status: 'completed',
        completed_at: '2026-05-22T18:00:00.000Z',
      }),
    });
    const completedByTimestamp = await getSummaryJson();
    expect(completedByTimestamp.resolved_status).toBe('completed');
    expect(completedByTimestamp.next_checkin_template).toBeNull();
  });

  test('keeps Day 0 pre-start responses without a check-in prompt', async () => {
    installReads(enrollment({
      status: 'pre_start',
      selected_start_date: '2026-06-01',
      metadata: {},
    }), { template: true });
    const summary = await getSummaryJson();
    expect(summary.resolved_status).toBe('pre_start');
    expect(summary.current_day).toBe(0);
    expect(summary.next_checkin_template).toBeNull();
    expect(summary.latest_checkin_response).toMatchObject({ checkin_day: 7 });
    expect(mockFrom.mock.calls.map((call) => call[0])).not.toContain('program_checkin_templates');
  });
});
