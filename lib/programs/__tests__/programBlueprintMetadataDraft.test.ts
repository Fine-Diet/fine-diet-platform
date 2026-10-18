let mockFrom!: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  return { supabaseAdmin: { from: mockFrom } };
});

import { UNTOUCHED_BASELINE_DRAFT } from '../baselineMemberBinding';
import { saveProgramBlueprintMetadataForDraft } from '../deliveryModuleAdminServerService';
import { toProgramBlueprintVersionFields } from '../programBlueprint';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from '../baselineDay0To21Candidate';

const PROGRAM_ID = '10000000-0000-4000-8000-000000000010';
const DRAFT_ID = '30000000-0000-4000-8000-000000000033';

function chain(result: { data?: unknown; error?: unknown; singleData?: unknown }) {
  const resolved = result.singleData ?? result.data ?? null;
  const q: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'update']) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  q.maybeSingle = jest.fn().mockResolvedValue({
    data: resolved,
    error: result.error ?? null,
  });
  q.single = jest.fn().mockResolvedValue({
    data: resolved,
    error: result.error ?? null,
  });
  return q;
}

describe('draft programBlueprintV1 metadata writer', () => {
  const blueprint = toProgramBlueprintVersionFields(BASELINE_DAY_0_TO_21_BLUEPRINT);

  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('merges validated blueprint metadata into a draft and keeps existing keys', async () => {
    const write = chain({
      singleData: {
        id: DRAFT_ID,
        program_id: PROGRAM_ID,
        status: 'draft',
        metadata: { authoringNote: 'keep', programBlueprintV1: blueprint },
        version_key: 'v3-a1b2c3d4',
      },
    });
    mockFrom
      .mockReturnValueOnce(chain({
        data: {
          id: DRAFT_ID,
          program_id: PROGRAM_ID,
          status: 'draft',
          duration_days: 21,
          metadata: { authoringNote: 'keep' },
          updated_at: '2026-10-17T00:00:00.000Z',
        },
      }))
      .mockReturnValueOnce(write);

    const saved = await saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint,
    });

    expect(saved.version_key).toBe('v3-a1b2c3d4');
    expect(write.update).toHaveBeenCalledWith({
      metadata: {
        authoringNote: 'keep',
        programBlueprintV1: blueprint,
      },
    });
    expect(write.eq).toHaveBeenCalledWith('status', 'draft');
    expect(write.eq).toHaveBeenCalledWith('program_id', PROGRAM_ID);
    expect(write.eq).toHaveBeenCalledWith('updated_at', '2026-10-17T00:00:00.000Z');
  });

  it('rejects published versions, other programs, protected drafts, and invalid metadata', async () => {
    mockFrom.mockReturnValueOnce(chain({
      data: {
        id: DRAFT_ID,
        program_id: PROGRAM_ID,
        status: 'published',
        duration_days: 21,
        metadata: {},
      },
    }));
    await expect(saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint,
    })).rejects.toThrow(/immutable/);

    mockFrom.mockReturnValueOnce(chain({
      data: {
        id: DRAFT_ID,
        program_id: '99999999-0000-4000-8000-000000000099',
        status: 'draft',
        duration_days: 21,
        metadata: {},
      },
    }));
    await expect(saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint,
    })).rejects.toMatchObject({ code: 'VERSION_PROGRAM_MISMATCH' });

    await expect(saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: UNTOUCHED_BASELINE_DRAFT.versionId,
      blueprint,
    })).rejects.toThrow(/protected Baseline version/);

    mockFrom.mockReturnValueOnce(chain({
      data: {
        id: DRAFT_ID,
        program_id: PROGRAM_ID,
        status: 'draft',
        duration_days: 21,
        metadata: { authoringNote: 'keep' },
      },
    }));
    await expect(saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint: { schemaVersion: 1 },
    })).rejects.toThrow();
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });

  it('keeps unrelated metadata when two draft writes overlap', async () => {
    const updates: Array<Record<string, unknown>> = [];
    let row = {
      id: DRAFT_ID,
      program_id: PROGRAM_ID,
      status: 'draft',
      duration_days: 21,
      metadata: { authoringNote: 'keep' } as Record<string, unknown>,
      updated_at: '2026-10-17T00:00:00.000Z',
      version_key: 'v3-a1b2c3d4',
    };
    let overlapped = false;

    mockFrom.mockImplementation(() => {
      const filters: Record<string, unknown> = {};
      let pendingUpdate: { metadata?: Record<string, unknown> } | null = null;
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      };
      query.update = (value: { metadata?: Record<string, unknown> }) => {
        pendingUpdate = value;
        updates.push(value);
        return query;
      };
      query.maybeSingle = async () => {
        if (!pendingUpdate) {
          return { data: { ...row, metadata: { ...row.metadata } }, error: null };
        }
        const matches = filters.id === row.id
          && filters.program_id === row.program_id
          && filters.status === row.status
          && filters.updated_at === row.updated_at;
        if (!matches) return { data: null, error: null };
        if (!overlapped) {
          overlapped = true;
          row = {
            ...row,
            metadata: { ...row.metadata, auditNote: 'from-overlapping-writer' },
            updated_at: '2026-10-17T00:00:01.000Z',
          };
          return { data: null, error: null };
        }
        row = {
          ...row,
          metadata: pendingUpdate.metadata ?? {},
          updated_at: '2026-10-17T00:00:02.000Z',
        };
        return { data: { ...row, metadata: { ...row.metadata } }, error: null };
      };
      return query;
    });

    const saved = await saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint,
    });

    expect(updates).toHaveLength(2);
    expect((updates[0].metadata as Record<string, unknown>).auditNote).toBeUndefined();
    expect(updates[1].metadata).toMatchObject({
      authoringNote: 'keep',
      auditNote: 'from-overlapping-writer',
      programBlueprintV1: blueprint,
    });
    expect(saved.metadata).toMatchObject({
      authoringNote: 'keep',
      auditNote: 'from-overlapping-writer',
      programBlueprintV1: blueprint,
    });
  });

  it('refuses a stale merge when every overlapping write loses', async () => {
    let row = {
      id: DRAFT_ID,
      program_id: PROGRAM_ID,
      status: 'draft',
      duration_days: 21,
      metadata: { authoringNote: 'keep' } as Record<string, unknown>,
      updated_at: '2026-10-17T00:00:00.000Z',
      version_key: 'v3-a1b2c3d4',
    };
    let tick = 0;
    mockFrom.mockImplementation(() => {
      const filters: Record<string, unknown> = {};
      let pendingUpdate: Record<string, unknown> | null = null;
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      };
      query.update = (value: Record<string, unknown>) => {
        pendingUpdate = value;
        return query;
      };
      query.maybeSingle = async () => {
        if (!pendingUpdate) {
          return { data: { ...row, metadata: { ...row.metadata } }, error: null };
        }
        const matches = filters.updated_at === row.updated_at;
        if (!matches) return { data: null, error: null };
        tick += 1;
        row = {
          ...row,
          metadata: { ...row.metadata, auditNote: 'kept' },
          updated_at: `2026-10-17T00:00:0${tick}.000Z`,
        };
        return { data: null, error: null };
      };
      return query;
    });

    await expect(saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint,
    })).rejects.toThrow(/Unrelated metadata was not overwritten/);
    expect(row.metadata).toEqual({ authoringNote: 'keep', auditNote: 'kept' });
  });
});
