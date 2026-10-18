let mockFrom!: jest.Mock;
let mockRpc!: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  mockRpc = jest.fn();
  return { supabaseAdmin: { from: mockFrom, rpc: mockRpc } };
});

import { UNTOUCHED_BASELINE_DRAFT } from '../baselineMemberBinding';
import { saveProgramBlueprintMetadataForDraft } from '../deliveryModuleAdminServerService';
import { toProgramBlueprintVersionFields } from '../programBlueprint';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from '../baselineDay0To21Candidate';

const PROGRAM_ID = '10000000-0000-4000-8000-000000000010';
const DRAFT_ID = '30000000-0000-4000-8000-000000000033';

function chain(result: { data?: unknown; error?: unknown }) {
  const q: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'update']) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  q.maybeSingle = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  return q;
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    program_id: PROGRAM_ID,
    status: 'draft',
    duration_days: 21,
    ...overrides,
  };
}

describe('draft programBlueprintV1 metadata writer', () => {
  const blueprint = toProgramBlueprintVersionFields(BASELINE_DAY_0_TO_21_BLUEPRINT);

  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it('sends only the validated blueprint to the atomic merge RPC', async () => {
    const read = chain({ data: draftRow() });
    mockFrom.mockReturnValueOnce(read);
    mockRpc.mockResolvedValueOnce({
      data: {
        ...draftRow(),
        metadata: { authoringNote: 'keep', programBlueprintV1: blueprint },
        version_key: 'v3-a1b2c3d4',
      },
      error: null,
    });

    const saved = await saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint,
    });

    expect(saved.version_key).toBe('v3-a1b2c3d4');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('merge_program_blueprint_v1_metadata', {
      p_program_id: PROGRAM_ID,
      p_program_version_id: DRAFT_ID,
      p_program_blueprint_v1: blueprint,
    });
    expect(JSON.stringify(mockRpc.mock.calls[0][1])).not.toContain('authoringNote');
    expect(read.update).not.toHaveBeenCalled();
    expect(read.eq).not.toHaveBeenCalledWith('updated_at', expect.anything());
  });

  it('rejects published versions, other programs, protected drafts, invalid metadata, and duration mismatches before any write', async () => {
    mockFrom.mockReturnValueOnce(chain({
      data: draftRow({ status: 'published' }),
    }));
    await expect(saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint,
    })).rejects.toThrow(/immutable/);

    mockFrom.mockReturnValueOnce(chain({
      data: draftRow({ program_id: '99999999-0000-4000-8000-000000000099' }),
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

    mockFrom.mockReturnValueOnce(chain({ data: draftRow() }));
    await expect(saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint: { schemaVersion: 1 },
    })).rejects.toThrow();

    mockFrom.mockReturnValueOnce(chain({
      data: draftRow({ duration_days: 20 }),
    }));
    await expect(saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint,
    })).rejects.toThrow(/duration/);

    expect(mockFrom).toHaveBeenCalledTimes(4);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not report success when the RPC returns no persisted row', async () => {
    mockFrom.mockReturnValue(chain({ data: draftRow() }));
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint,
    })).rejects.toThrow(/was not saved/);

    mockRpc.mockResolvedValueOnce({
      data: {
        ...draftRow(),
        metadata: { authoringNote: 'keep' },
      },
      error: null,
    });
    await expect(saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint,
    })).rejects.toThrow(/was not saved/);

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Program version not found.' },
    });
    await expect(saveProgramBlueprintMetadataForDraft({
      programId: PROGRAM_ID,
      programVersionId: DRAFT_ID,
      blueprint,
    })).rejects.toMatchObject({
      message: 'Program version not found.',
      code: 'VERSION_PROGRAM_MISMATCH',
    });
  });
});
