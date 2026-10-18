const mockRequireRole = jest.fn();
const mockGetProgram = jest.fn();
const mockSaveBlueprint = jest.fn();

jest.mock('@/lib/authServer', () => ({
  requireRoleFromApi: (...args: unknown[]) => mockRequireRole(...args),
}));
jest.mock('@/lib/programs/programContentAdminServerService', () => ({
  getProgramById: (...args: unknown[]) => mockGetProgram(...args),
}));
jest.mock('@/lib/programs/deliveryModuleAdminServerService', () => ({
  saveProgramBlueprintMetadataForDraft: (...args: unknown[]) => mockSaveBlueprint(...args),
}));

import handler from '../[id]/versions/[versionId]/blueprint';

const programId = '10000000-0000-4000-8000-000000000010';
const versionId = '30000000-0000-4000-8000-000000000033';

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

describe('admin blueprint metadata route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProgram.mockResolvedValue({ id: programId, slug: 'baseline' });
    mockSaveBlueprint.mockResolvedValue({
      id: versionId,
      program_id: programId,
      status: 'draft',
      version_key: 'v3-a1b2c3d4',
    });
  });

  it('requires an admin or editor and saves only the addressed draft', async () => {
    mockRequireRole.mockImplementation(async (_req, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
      res.status(401).json({ error: 'Unauthorized' });
      return null;
    });
    const denied = response();
    await handler({ method: 'PUT', query: { id: programId, versionId }, body: {} } as any, denied.res as any);
    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), expect.anything(), ['admin', 'editor']);
    expect(mockSaveBlueprint).not.toHaveBeenCalled();
    expect(denied.out.statusCode).toBe(401);

    mockRequireRole.mockResolvedValue({ id: 'editor-1', role: 'editor' });
    const saved = response();
    await handler({
      method: 'PUT',
      query: { id: programId, versionId },
      body: { programBlueprintV1: { schemaVersion: 1 } },
    } as any, saved.res as any);
    expect(saved.out.statusCode).toBe(200);
    expect(mockSaveBlueprint).toHaveBeenCalledWith({
      programId,
      programVersionId: versionId,
      blueprint: { schemaVersion: 1 },
    });
  });

  it('rejects published and wrong-version writes', async () => {
    mockRequireRole.mockResolvedValue({ id: 'editor-1', role: 'editor' });
    mockSaveBlueprint.mockRejectedValueOnce(Object.assign(
      new Error('Published program versions are immutable. Create a new draft version to make changes.'),
      { code: 'COMPOSITION_WRITE_REJECTED' },
    ));
    const published = response();
    await handler({ method: 'PUT', query: { id: programId, versionId }, body: {} } as any, published.res as any);
    expect(published.out.statusCode).toBe(409);

    mockSaveBlueprint.mockRejectedValueOnce(Object.assign(
      new Error('program_version_id does not belong to this program.'),
      { code: 'VERSION_PROGRAM_MISMATCH' },
    ));
    const wrongVersion = response();
    await handler({ method: 'PUT', query: { id: programId, versionId }, body: {} } as any, wrongVersion.res as any);
    expect(wrongVersion.out.statusCode).toBe(404);
  });
});
