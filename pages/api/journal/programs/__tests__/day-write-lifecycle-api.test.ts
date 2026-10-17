const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockGetObservation = jest.fn();
const mockWriteObservation = jest.fn();
const mockCompleteDay = jest.fn();
const mockGetCompletion = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));
jest.mock('@/lib/programs/programDayInteractionServerService', () => ({
  getProgramDayObservation: (...args: unknown[]) => mockGetObservation(...args),
  writeProgramDayObservation: (...args: unknown[]) => mockWriteObservation(...args),
  completeProgramDay: (...args: unknown[]) => mockCompleteDay(...args),
  getProgramDayCompletion: (...args: unknown[]) => mockGetCompletion(...args),
  PROGRAM_DAY_READ_ONLY: 'PROGRAM_DAY_READ_ONLY',
}));

import observationsHandler from '../enrollments/[id]/observations';
import completeDayHandler from '../enrollments/[id]/complete-day';

function makeResponse() {
  const out: { statusCode: number; body?: unknown; headers: Record<string, unknown> } = { statusCode: 200, headers: {} };
  const res = {
    status(code: number) { out.statusCode = code; return res; },
    json(body: unknown) { out.body = body; return res; },
    setHeader(name: string, value: unknown) { out.headers[name] = value; },
  };
  return { res, out };
}

function lifecycleError() {
  return Object.assign(new Error('This enrollment is read-only and cannot accept new day responses or completion.'), {
    code: 'PROGRAM_DAY_READ_ONLY',
  });
}

describe('day interaction lifecycle API responses', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRequireJournalAuth.mockResolvedValue({ personId: '32da6ab4-818e-467b-bd10-4ef7f184825b' });
    mockRequireCallerJournalAccess.mockResolvedValue(true);
    mockWriteObservation.mockRejectedValue(lifecycleError());
    mockCompleteDay.mockRejectedValue(lifecycleError());
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns a stable conflict response for observation draft and save requests', async () => {
    for (const action of ['draft', 'save']) {
      const { res, out } = makeResponse();
      await observationsHandler({
        method: 'PUT',
        query: { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2' },
        body: { day: 7, content_key: 'baseline-day-7-reflection', text: 'response', action },
      } as any, res as any);
      expect(out.statusCode).toBe(409);
      expect(out.body).toMatchObject({ code: 'PROGRAM_DAY_READ_ONLY' });
    }
  });

  it('returns a stable conflict response for day-completion requests', async () => {
    const { res, out } = makeResponse();
    await completeDayHandler({
      method: 'POST',
      query: { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2' },
      body: { day: 7 },
    } as any, res as any);
    expect(out.statusCode).toBe(409);
    expect(out.body).toMatchObject({ code: 'PROGRAM_DAY_READ_ONLY' });
  });
});
