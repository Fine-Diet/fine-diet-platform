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

  it.each([
    ['7', 7],
    ['10000', 10000],
  ])('returns the saved completion for GET day %s', async (dayQuery, day) => {
    const completion = { day };
    mockGetCompletion.mockResolvedValue(completion);
    const { res, out } = makeResponse();
    await completeDayHandler({
      method: 'GET',
      query: { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: dayQuery },
    } as any, res as any);
    expect(out.statusCode).toBe(200);
    expect(out.body).toEqual(completion);
    expect(mockGetCompletion).toHaveBeenCalledWith({
      personId: '32da6ab4-818e-467b-bd10-4ef7f184825b',
      enrollmentId: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2',
      day,
    });
    expect(mockCompleteDay).not.toHaveBeenCalled();
  });

  it('accepts Day 0 as the query string 0', async () => {
    const completion = { day: 0 };
    mockGetCompletion.mockResolvedValue(completion);
    const { res, out } = makeResponse();
    await completeDayHandler({
      method: 'GET',
      query: { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: '0' },
    } as any, res as any);
    expect(out.statusCode).toBe(200);
    expect(out.body).toEqual(completion);
    expect(mockGetCompletion).toHaveBeenCalledWith({
      personId: '32da6ab4-818e-467b-bd10-4ef7f184825b',
      enrollmentId: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2',
      day: 0,
    });
    expect(mockCompleteDay).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2' }],
    ['empty', { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: '' }],
    ['repeated', { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: ['1', '2'] }],
    ['malformed', { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: 'nope' }],
    ['leading zero', { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: '01' }],
    ['fractional', { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: '1.5' }],
    ['whole fractional', { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: '1.0' }],
    ['negative', { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: '-1' }],
    ['whitespace', { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: ' 7' }],
    ['trailing whitespace', { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: '7 ' }],
    ['out of range', { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2', day: '10001' }],
  ])('rejects %s GET day input with 400', async (_label, query) => {
    const { res, out } = makeResponse();
    await completeDayHandler({ method: 'GET', query } as any, res as any);
    expect(out.statusCode).toBe(400);
    expect(out.body).toMatchObject({ error: 'Invalid day completion payload.' });
    expect(mockGetCompletion).not.toHaveBeenCalled();
    expect(mockCompleteDay).not.toHaveBeenCalled();
  });

  it('accepts a numeric JSON day on POST', async () => {
    const completion = { day: 7 };
    mockCompleteDay.mockResolvedValue(completion);
    const { res, out } = makeResponse();
    await completeDayHandler({
      method: 'POST',
      query: { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2' },
      body: { day: 7 },
    } as any, res as any);
    expect(out.statusCode).toBe(200);
    expect(out.body).toEqual(completion);
    expect(mockCompleteDay).toHaveBeenCalledWith({
      personId: '32da6ab4-818e-467b-bd10-4ef7f184825b',
      enrollmentId: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2',
      day: 7,
    });
    expect(mockGetCompletion).not.toHaveBeenCalled();
  });

  it('rejects a string day on POST', async () => {
    const { res, out } = makeResponse();
    await completeDayHandler({
      method: 'POST',
      query: { id: 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2' },
      body: { day: '7' },
    } as any, res as any);
    expect(out.statusCode).toBe(400);
    expect(out.body).toMatchObject({ error: 'Invalid day completion payload.' });
    expect(mockCompleteDay).not.toHaveBeenCalled();
    expect(mockGetCompletion).not.toHaveBeenCalled();
  });
});
