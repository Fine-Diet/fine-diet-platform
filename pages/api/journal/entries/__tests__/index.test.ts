const mockRequireJournalAuth = jest.fn();
const mockResolveJournalTargetPerson = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockCreateEntry = jest.fn();
const mockListEntriesByDay = jest.fn();
const mockListEntriesByDayAndBlock = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  resolveJournalTargetPerson: (...args: unknown[]) => mockResolveJournalTargetPerson(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));

jest.mock('@/lib/journal/journalServerService', () => ({
  createEntry: (...args: unknown[]) => mockCreateEntry(...args),
  listEntriesByDay: (...args: unknown[]) => mockListEntriesByDay(...args),
  listEntriesByDayAndBlock: (...args: unknown[]) => mockListEntriesByDayAndBlock(...args),
}));

import handler from '../index';

function createResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
    setHeader: jest.fn((name: string, value: unknown) => {
      res.headers[name] = value;
      return res;
    }),
  };
  return res;
}

describe('/api/journal/entries member boundary', () => {
  const memberContext = {
    user: { id: 'auth-a', email: 'a@example.test', role: 'user' },
    personId: 'person-a',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireJournalAuth.mockResolvedValue(memberContext);
    mockResolveJournalTargetPerson.mockResolvedValue('person-a');
    mockRequireCallerJournalAccess.mockResolvedValue(true);
    mockListEntriesByDay.mockResolvedValue([{ id: 'entry-a' }]);
    mockListEntriesByDayAndBlock.mockResolvedValue([{ id: 'entry-a' }]);
    mockCreateEntry.mockResolvedValue({ id: 'entry-a' });
  });

  it('reads only the authenticated member person resolved by the access guard', async () => {
    const req = { method: 'GET', query: { date: '2026-11-03' }, headers: {} } as any;
    const res = createResponse();

    await handler(req, res);

    expect(mockResolveJournalTargetPerson).toHaveBeenCalledWith(req, res, memberContext);
    expect(mockListEntriesByDay).toHaveBeenCalledWith('person-a', '2026-11-03');
    expect(res.body.entries).toEqual([{ id: 'entry-a' }]);
  });

  it('does not write when the member no longer has Journal access', async () => {
    mockRequireCallerJournalAccess.mockImplementation(async (res) => {
      res.status(403).json({ error: 'Journal access required' });
      return false;
    });
    const req = {
      method: 'POST',
      query: {},
      headers: {},
      body: { occurredAt: '2026-11-03T18:00:00.000Z', person_id: 'person-b', payload: {} },
    } as any;
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(mockCreateEntry).not.toHaveBeenCalled();
  });

  it('derives the write owner from the authenticated context, ignoring another person id', async () => {
    const req = {
      method: 'POST',
      query: {},
      headers: {},
      body: {
        occurredAt: '2026-11-03T18:00:00.000Z',
        person_id: 'person-b',
        payload: { name: 'Member entry' },
      },
    } as any;
    const res = createResponse();

    await handler(req, res);

    expect(mockCreateEntry).toHaveBeenCalledWith(expect.objectContaining({
      personId: 'person-a',
      payload: { name: 'Member entry' },
    }));
    expect(mockCreateEntry.mock.calls[0][0].personId).not.toBe('person-b');
    expect(res.statusCode).toBe(201);
  });

  it('stops a read when the target-person guard rejects a different account', async () => {
    mockResolveJournalTargetPerson.mockImplementation(async (_req, res) => {
      res.status(403).json({ error: 'Access denied' });
      return null;
    });
    const req = {
      method: 'GET',
      query: { date: '2026-11-03', person_id: 'person-b' },
      headers: {},
    } as any;
    const res = createResponse();

    await handler(req, res);

    expect(mockListEntriesByDay).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
