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
  const q: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'update']) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  q.maybeSingle = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  q.single = jest.fn().mockResolvedValue({
    data: result.singleData ?? result.data ?? null,
    error: result.error ?? null,
  });
  return q;
}

describe('draft programBlueprintV1 metadata writer', () => {
  const blueprint = toProgramBlueprintVersionFields(BASELINE_DAY_0_TO_21_BLUEPRINT);

  beforeEach(() => {
    jest.clearAllMocks();
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
});
