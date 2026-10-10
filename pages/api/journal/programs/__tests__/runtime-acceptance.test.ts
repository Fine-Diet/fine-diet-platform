const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockCanActOnClient = jest.fn();
const mockHasJournalAccess = jest.fn();
const mockCreateEnrollment = jest.fn();
const mockGetSummary = jest.fn();
const mockLifecycle = jest.fn();
const mockRespondCheckin = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));
jest.mock('@/lib/access/accessLinkService', () => ({
  canActOnClient: (...args: unknown[]) => mockCanActOnClient(...args),
}));
jest.mock('@/lib/access/accessService', () => ({
  hasJournalAccess: (...args: unknown[]) => mockHasJournalAccess(...args),
}));
jest.mock('@/lib/programs/programRuntimeServerService', () => ({
  PROGRAM_LIFECYCLE_TRANSITION_DENIED: 'PROGRAM_LIFECYCLE_TRANSITION_DENIED',
  createProgramEnrollmentFromAccess: (...args: unknown[]) => mockCreateEnrollment(...args),
  getProgramRuntimeSummaryForPerson: (...args: unknown[]) => mockGetSummary(...args),
  applyProgramEnrollmentLifecycleAction: (...args: unknown[]) => mockLifecycle(...args),
  respondToProgramCheckin: (...args: unknown[]) => mockRespondCheckin(...args),
}));

import enrollHandler from '../enroll';
import lifecycleHandler from '../enrollments/[id]/lifecycle';
import checkinHandler from '../checkins/respond';

const personId = '10000000-0000-4000-8000-000000000001';
const enrollmentId = '20000000-0000-4000-8000-000000000002';

function response() {
  const out: { statusCode: number; body?: unknown; headers: Record<string, unknown> } = {
    statusCode: 200,
    headers: {},
  };
  const res = {
    status(code: number) { out.statusCode = code; return res; },
    json(body: unknown) { out.body = body; return res; },
    setHeader(name: string, value: unknown) { out.headers[name] = value; return res; },
  };
  return { res, out };
}

describe('journal program runtime HTTP acceptance', () => {
  const enrollment = {
    id: enrollmentId,
    person_id: personId,
    program_slug: 'gut-reset',
    program_version_id: '30000000-0000-4000-8000-000000000003',
    status: 'active',
  };
  let summary: Record<string, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    summary = { enrollment: { ...enrollment }, resolved_status: 'active', day_number: 1 };
    mockRequireJournalAuth.mockResolvedValue({ personId, user: { role: 'member' } });
    mockRequireCallerJournalAccess.mockResolvedValue(true);
    mockCanActOnClient.mockResolvedValue(false);
    mockHasJournalAccess.mockResolvedValue(true);
    mockCreateEnrollment.mockResolvedValue(enrollment);
    mockGetSummary.mockImplementation(async () => summary);
    mockLifecycle.mockImplementation(async ({ action }: { action: string }) => {
      const current = summary.resolved_status as string;
      const allowedFrom: Record<string, string[]> = {
        pause: ['active'],
        resume: ['paused'],
        cancel: ['pre_start', 'active', 'paused'],
        complete: ['active', 'paused'],
      };
      if (!allowedFrom[action]?.includes(current)) {
        throw Object.assign(new Error(`Cannot ${action} an enrollment in '${current}' state.`), {
          code: 'PROGRAM_LIFECYCLE_TRANSITION_DENIED',
        });
      }
      const next = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : action === 'complete' ? 'completed' : 'cancelled';
      summary = { ...summary, resolved_status: next, enrollment: { ...enrollment, status: next } };
      return summary;
    });
    mockRespondCheckin.mockImplementation(async (input: Record<string, unknown>) => ({
      response: { enrollment_id: input.enrollmentId, checkin_day: input.checkinDay, response_status: input.responseStatus },
      summary,
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('enrolls, delivers lifecycle transitions, and persists a check-in through authenticated route boundaries', async () => {
    const enrollRes = response();
    await enrollHandler({
      method: 'POST', body: { program_slug: 'gut-reset', selected_start_date: '2026-10-09', timezone: 'America/Chicago' },
    } as any, enrollRes.res as any);
    expect(enrollRes.out.statusCode).toBe(201);
    expect(mockCreateEnrollment).toHaveBeenCalledWith(expect.objectContaining({ personId, programSlug: 'gut-reset' }));
    expect(mockGetSummary).toHaveBeenCalledWith(personId, enrollmentId);

    const pauseRes = response();
    await lifecycleHandler({ method: 'POST', query: { id: enrollmentId }, body: { action: 'pause' } } as any, pauseRes.res as any);
    expect(pauseRes.out.statusCode).toBe(200);
    expect((pauseRes.out.body as any).resolved_status).toBe('paused');

    const resumeRes = response();
    await lifecycleHandler({ method: 'POST', query: { id: enrollmentId }, body: { action: 'resume' } } as any, resumeRes.res as any);
    expect((resumeRes.out.body as any).resolved_status).toBe('active');

    const checkinRes = response();
    await checkinHandler({
      method: 'POST', body: {
        enrollment_id: enrollmentId,
        checkin_day: 1,
        response_status: 'completed',
        responses_json: { energy: 4 },
      },
    } as any, checkinRes.res as any);
    expect(checkinRes.out.statusCode).toBe(200);
    expect(mockRespondCheckin).toHaveBeenCalledWith(expect.objectContaining({
      personId,
      enrollmentId,
      checkinDay: 1,
      responseStatus: 'completed',
      responsesJson: { energy: 4 },
    }));

    const completeRes = response();
    await lifecycleHandler({ method: 'POST', query: { id: enrollmentId }, body: { action: 'complete' } } as any, completeRes.res as any);
    expect((completeRes.out.body as any).resolved_status).toBe('completed');
  });

  test('rejects unauthenticated callers, invalid requests, and service-level ownership denials', async () => {
    mockRequireJournalAuth.mockResolvedValueOnce(null);
    const unauthRes = response();
    await enrollHandler({ method: 'POST', body: {} } as any, unauthRes.res as any);
    expect(mockCreateEnrollment).not.toHaveBeenCalled();

    const invalidRes = response();
    await enrollHandler({ method: 'POST', body: { program_slug: 'Bad Slug', selected_start_date: 'yesterday' } } as any, invalidRes.res as any);
    expect(invalidRes.out.statusCode).toBe(400);

    mockRespondCheckin.mockRejectedValueOnce(Object.assign(new Error('Enrollment not found for person.'), { code: 'PROGRAM_ENROLLMENT_NOT_FOUND' }));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const deniedRes = response();
    await checkinHandler({ method: 'POST', body: {
      enrollment_id: enrollmentId,
      checkin_day: 1,
      response_status: 'skipped',
    } } as any, deniedRes.res as any);
    expect(deniedRes.out.statusCode).toBe(404);
    expect(deniedRes.out.body).toEqual({ error: 'Enrollment not found for person.' });
  });

  test('persists cancellation state and rejects a repeated terminal transition', async () => {
    const cancelRes = response();
    await lifecycleHandler({ method: 'POST', query: { id: enrollmentId }, body: { action: 'cancel' } } as any, cancelRes.res as any);
    expect(cancelRes.out.statusCode).toBe(200);
    expect((cancelRes.out.body as any).resolved_status).toBe('cancelled');

    jest.spyOn(console, 'error').mockImplementation(() => {});
    const repeatedRes = response();
    await lifecycleHandler({ method: 'POST', query: { id: enrollmentId }, body: { action: 'cancel' } } as any, repeatedRes.res as any);
    expect(repeatedRes.out.statusCode).toBe(409);
    expect(repeatedRes.out.body).toEqual({ error: "Cannot cancel an enrollment in 'cancelled' state." });
  });
});
