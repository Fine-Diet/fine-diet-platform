const accessMock = jest.fn();
let mockFrom: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  return { supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) } };
});

jest.mock('../programCurriculumAccess', () => ({
  personHasCurrentProgramCurriculumAccess: (...args: unknown[]) => accessMock(...args),
}));

import { upsertItemStatus } from '../programProgressServerService';

function chain(result: { data?: unknown; error?: unknown }, mode: 'maybeSingle' | 'single') {
  const query: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'upsert']) {
    query[method] = jest.fn().mockReturnValue(query);
  }
  query.maybeSingle = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  query.single = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  if (mode === 'maybeSingle') {
    query.then = jest.fn();
  }
  return query;
}

const ITEM_CONTEXT = {
  id: 'item-1',
  module_id: 'module-1',
  program_modules: {
    program_id: 'program-1',
    programs: { slug: 'guided' },
  },
};

describe('progress curriculum access', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    accessMock.mockReset();
  });

  it('does not write progress or load a summary for a stale purchase', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'program_content_items') {
        return chain({ data: ITEM_CONTEXT }, 'maybeSingle');
      }
      return chain({ data: null }, 'single');
    });
    accessMock.mockResolvedValue(false);

    await expect(
      upsertItemStatus({
        personId: 'person-b',
        contentItemId: 'item-1',
        status: 'completed',
      }),
    ).rejects.toMatchObject({ code: 'PROGRAM_ACCESS_DENIED' });

    expect(accessMock).toHaveBeenCalledWith('person-b', 'guided');
    expect(mockFrom).toHaveBeenCalledWith('program_content_items');
    expect(mockFrom).not.toHaveBeenCalledWith('program_content_progress');
    expect(mockFrom).not.toHaveBeenCalledWith('program_modules');
  });

  it('writes progress when an independent grant is current', async () => {
    const progressRow = {
      id: 'progress-1',
      person_id: 'person-b',
      program_slug: 'guided',
      content_item_id: 'item-1',
      status: 'completed',
      started_at: '2026-11-09T18:00:00.000Z',
      completed_at: '2026-11-09T18:00:00.000Z',
      last_viewed_at: '2026-11-09T18:00:00.000Z',
      progress_percent: null,
      notes: null,
      created_at: '2026-11-09T18:00:00.000Z',
      updated_at: '2026-11-09T18:00:00.000Z',
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'program_content_items') {
        return chain({ data: ITEM_CONTEXT }, 'maybeSingle');
      }
      const progress = chain({ data: null }, 'maybeSingle');
      progress.single.mockResolvedValue({ data: progressRow, error: null });
      return progress;
    });
    accessMock.mockResolvedValue(true);

    const saved = await upsertItemStatus({
      personId: 'person-b',
      contentItemId: 'item-1',
      status: 'completed',
    });

    expect(saved.status).toBe('completed');
    expect(mockFrom).toHaveBeenCalledWith('program_content_progress');
  });
});
