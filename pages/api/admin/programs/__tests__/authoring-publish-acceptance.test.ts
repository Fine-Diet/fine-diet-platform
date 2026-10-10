const mockRequireRole = jest.fn();
const mockGetProgram = jest.fn();
const mockCreateDraft = jest.fn();
const mockListVersions = jest.fn();
const mockPublishVersion = jest.fn();
const mockListTemplates = jest.fn();
const mockSaveTemplate = jest.fn();

jest.mock('@/lib/authServer', () => ({
  requireRoleFromApi: (...args: unknown[]) => mockRequireRole(...args),
}));
jest.mock('@/lib/programs/programContentAdminServerService', () => ({
  getProgramById: (...args: unknown[]) => mockGetProgram(...args),
}));
jest.mock('@/lib/programs/deliveryModuleAdminServerService', () => ({
  createProgramVersionDraft: (...args: unknown[]) => mockCreateDraft(...args),
  listProgramVersionsForProgram: (...args: unknown[]) => mockListVersions(...args),
  publishProgramVersion: (...args: unknown[]) => mockPublishVersion(...args),
  listCheckinTemplatesForVersion: (...args: unknown[]) => mockListTemplates(...args),
  saveCheckinTemplateForDraft: (...args: unknown[]) => mockSaveTemplate(...args),
}));

import versionsHandler from '../[id]/versions';
import publishHandler from '../[id]/versions/[versionId]/publish';
import checkinTemplatesHandler from '../[id]/checkin-templates';

const programId = '10000000-0000-4000-8000-000000000001';
const versionId = '20000000-0000-4000-8000-000000000002';
const templateId = '30000000-0000-4000-8000-000000000003';

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

describe('admin program authoring and publishing HTTP acceptance', () => {
  let versions: Array<Record<string, unknown>>;
  let templates: Array<Record<string, unknown>>;

  beforeEach(() => {
    jest.clearAllMocks();
    versions = [];
    templates = [];
    mockRequireRole.mockResolvedValue({ id: 'editor-1', role: 'editor' });
    mockGetProgram.mockResolvedValue({ id: programId, slug: 'gut-reset' });
    mockCreateDraft.mockImplementation(async (input: Record<string, unknown>) => {
      const version = {
        id: versionId,
        program_id: input.programId,
        version_label: input.versionLabel,
        duration_days: input.durationDays,
        status: 'draft',
      };
      versions.push(version);
      return version;
    });
    mockListVersions.mockImplementation(async () => versions);
    mockSaveTemplate.mockImplementation(async (input: Record<string, unknown>) => {
      const template = {
        id: templateId,
        program_version_id: input.programVersionId,
        checkin_day: input.checkinDay,
        title: input.title,
        questions_json: input.questionsJson,
        status: 'draft',
      };
      templates.push(template);
      return template;
    });
    mockListTemplates.mockImplementation(async () => templates);
    mockPublishVersion.mockImplementation(async () => {
      const draft = versions.find((v) => v.id === versionId);
      if (!draft) throw new Error('Program version not found');
      const published = { ...draft, status: 'published', published_at: '2026-10-09T12:00:00.000Z' };
      versions = versions.map((v) => v.id === versionId ? published : v);
      return published;
    });
  });

  test('creates and reloads a draft, saves a versioned check-in, then publishes that same version', async () => {
    const createRes = response();
    await versionsHandler({
      method: 'POST', query: { id: programId },
      body: { source_version_id: null, version_label: 'Fall 2026', duration_days: 28 },
    } as any, createRes.res as any);
    expect(createRes.out.statusCode).toBe(201);
    expect((createRes.out.body as any).status).toBe('draft');

    const reloadRes = response();
    await versionsHandler({ method: 'GET', query: { id: programId } } as any, reloadRes.res as any);
    expect(reloadRes.out.body).toEqual([expect.objectContaining({ id: versionId, status: 'draft' })]);

    const saveRes = response();
    await checkinTemplatesHandler({
      method: 'POST', query: { id: programId },
      body: {
        version_id: versionId,
        checkin_day: 7,
        title: 'Week one check-in',
        questions_json: [{ id: 'energy', type: 'scale', required: true }],
      },
    } as any, saveRes.res as any);
    expect(saveRes.out.statusCode).toBe(201);

    const templateReloadRes = response();
    await checkinTemplatesHandler({ method: 'GET', query: { id: programId, version_id: versionId } } as any, templateReloadRes.res as any);
    expect(templateReloadRes.out.body).toEqual([expect.objectContaining({
      program_version_id: versionId,
      checkin_day: 7,
      title: 'Week one check-in',
    })]);

    const publishRes = response();
    await publishHandler({ method: 'POST', query: { id: programId, versionId }, body: {} } as any, publishRes.res as any);
    expect(publishRes.out.statusCode).toBe(200);
    expect((publishRes.out.body as any).status).toBe('published');

    const finalReloadRes = response();
    await versionsHandler({ method: 'GET', query: { id: programId } } as any, finalReloadRes.res as any);
    expect((finalReloadRes.out.body as any)[0].status).toBe('published');
    expect(mockPublishVersion).toHaveBeenCalledWith({ programId, programVersionId: versionId });
  });

  test('blocks unauthorized authors, invalid templates, and rejected publication without leaking state', async () => {
    mockRequireRole.mockResolvedValueOnce(null);
    const unauthorizedRes = response();
    await versionsHandler({ method: 'POST', query: { id: programId }, body: {} } as any, unauthorizedRes.res as any);
    expect(mockCreateDraft).not.toHaveBeenCalled();

    const invalidRes = response();
    await checkinTemplatesHandler({ method: 'POST', query: { id: programId }, body: {
      version_id: 'not-a-uuid', checkin_day: 0, title: '', questions_json: [],
    } } as any, invalidRes.res as any);
    expect(invalidRes.out.statusCode).toBe(400);

    mockPublishVersion.mockRejectedValueOnce(new Error('A version with open enrollments cannot be published or replaced.'));
    const blockedRes = response();
    await publishHandler({ method: 'POST', query: { id: programId, versionId }, body: {} } as any, blockedRes.res as any);
    expect(blockedRes.out.statusCode).toBe(409);
    expect(blockedRes.out.body).toEqual({ error: 'A version with open enrollments cannot be published or replaced.' });
  });
});
