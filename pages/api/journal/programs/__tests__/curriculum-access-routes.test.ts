const detailMock = jest.fn();
const deliveryMock = jest.fn();
const progressSummaryMock = jest.fn();
const libraryMock = jest.fn();
const requireAuthMock = jest.fn();
const resolvePersonMock = jest.fn();
const adminFromMock = jest.fn();

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => adminFromMock(...args) },
}));

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => requireAuthMock(...args),
  resolveJournalTargetPerson: (...args: unknown[]) => resolvePersonMock(...args),
}));

jest.mock('@/lib/programs/programLibraryServerService', () => ({
  getLibraryDetailForPerson: (...args: unknown[]) => detailMock(...args),
  listLibraryForPerson: (...args: unknown[]) => libraryMock(...args),
}));

jest.mock('@/lib/programs/deliveryModuleDeliveryServerService', () => ({
  getDeliveryModulesForProgramWithFallback: (...args: unknown[]) => deliveryMock(...args),
}));

jest.mock('@/lib/programs/programRuntimeServerService', () => ({
  getLatestPublishedProgramVersionForSlug: jest.fn(),
  getProgramRuntimeSummaryForPerson: jest.fn(),
  listEnrollmentsForPerson: jest.fn(),
}));

jest.mock('@/lib/programs/programProgressServerService', () => ({
  getProgramProgressSummary: (...args: unknown[]) => progressSummaryMock(...args),
}));

import detailHandler from '../[slug]';
import deliveryHandler from '../[slug]/delivery-modules';
import progressHandler from '../[slug]/progress';
import libraryHandler from '../library';
import {
  getProgramRuntimeSummaryForPerson,
  listEnrollmentsForPerson,
} from '@/lib/programs/programRuntimeServerService';

function response() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (body: unknown) => typeof res;
    setHeader: (name: string, value: string) => void;
  } = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader() {},
  };
  return res;
}

describe('journal program routes using service-role curriculum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireAuthMock.mockResolvedValue({ userId: 'user-b' });
    resolvePersonMock.mockResolvedValue('person-b');
  });

  it('returns 404 for program detail and does not query supabase when access is absent', async () => {
    detailMock.mockResolvedValue(null);
    const res = response();

    await detailHandler(
      { method: 'GET', query: { slug: 'guided' } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(404);
    expect(detailMock).toHaveBeenCalledWith('person-b', 'guided');
    expect(adminFromMock).not.toHaveBeenCalled();
  });

  it('does not call the service-role delivery query after a stale purchase denial', async () => {
    (listEnrollmentsForPerson as jest.Mock).mockResolvedValue([]);
    detailMock.mockResolvedValue(null);
    const res = response();

    await deliveryHandler(
      { method: 'GET', query: { slug: 'guided' } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(404);
    expect(detailMock).toHaveBeenCalledWith('person-b', 'guided');
    expect(deliveryMock).not.toHaveBeenCalled();
    expect(adminFromMock).not.toHaveBeenCalled();
  });

  it('does not deliver modules when an open enrollment has lost paid access', async () => {
    (listEnrollmentsForPerson as jest.Mock).mockResolvedValue([
      {
        id: 'enr-1',
        program_slug: 'guided',
        status: 'active',
        updated_at: '2026-11-01T00:00:00.000Z',
      },
    ]);
    (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue({
      enrollment: { id: 'enr-1', program_slug: 'guided', status: 'active' },
      resolved_status: 'cancelled',
      version: { id: 'ver-1', status: 'published' },
      current_day: 3,
      program: { slug: 'guided' },
    });
    const res = response();

    await deliveryHandler(
      { method: 'GET', query: { slug: 'guided' } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(403);
    expect(deliveryMock).not.toHaveBeenCalled();
    expect(detailMock).not.toHaveBeenCalled();
    expect(adminFromMock).not.toHaveBeenCalled();
  });

  it('does not load the progress summary when detail access is absent', async () => {
    detailMock.mockResolvedValue(null);
    const res = response();

    await progressHandler(
      { method: 'GET', query: { slug: 'guided' } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(404);
    expect(progressSummaryMock).not.toHaveBeenCalled();
    expect(adminFromMock).not.toHaveBeenCalled();
  });

  it('returns the library from the gated service without its own curriculum query', async () => {
    libraryMock.mockResolvedValue({
      person_id: 'person-b',
      entries: [],
      availability: [],
      resolved_at: '2026-11-09T18:00:00.000Z',
    });
    const res = response();

    await libraryHandler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(libraryMock).toHaveBeenCalledWith('person-b');
    expect(adminFromMock).not.toHaveBeenCalled();
  });
});
