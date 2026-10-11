let mockFrom!: jest.Mock;
let mockRpc!: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  mockRpc = jest.fn();
  return { supabaseAdmin: { from: mockFrom, rpc: mockRpc } };
});

import {
  createDeliveryModule,
  updateDeliveryModule,
  reorderDeliveryModules,
  createProgramVersionDraft,
  publishProgramVersion,
  saveCheckinTemplateForDraft,
  type ProgramDeliveryModuleRow,
} from '../deliveryModuleAdminServerService';

function query(result: { data?: unknown; error?: unknown }) {
  const q: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'is', 'update', 'insert']) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  q.maybeSingle = jest.fn().mockResolvedValue(result);
  q.single = jest.fn().mockResolvedValue(result);
  q.then = jest.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject));
  return q;
}

const existing: ProgramDeliveryModuleRow = {
  id: 'row-1', program_id: 'program-1', program_version_id: 'version-1',
  module_key: 'guide-1', module_type: 'guide', title: 'Guide', eyebrow: null,
  body: 'Body', day_start: 1, day_end: 7,
  status_visibility: ['active'], capacity_variants_json: {}, cta_json: {},
  anchor_json: {}, display_order: 0, status: 'draft', safety_notes: [],
  no_claims_notes: [],
  metadata: { composition: { contract: 'programs-delivery-composition-v1' }, blocks: [] },
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

describe('published program version immutability', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  test('does not create composition content on a published version', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'program_versions') {
        return query({ data: { id: 'version-1', program_id: 'program-1', duration_days: 7, status: 'published' } });
      }
      return query({ data: null });
    });

    await expect(createDeliveryModule('program-1', {
      module_key: 'guide-2', module_type: 'guide', title: 'New guide',
      eyebrow: null, body: 'Body', day_start: 1, day_end: 7,
      program_version_id: 'version-1', status: 'draft',
      status_visibility: ['active'], capacity_variants_json: {}, cta_json: {},
      anchor_json: {}, display_order: 1, safety_notes: [], no_claims_notes: [],
      metadata: { composition: { contract: 'programs-delivery-composition-v1' }, blocks: [] },
    })).rejects.toThrow('Published program versions are immutable');
  });

  test('rejects edits to a draft row after its version is published', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'program_delivery_modules') return query({ data: existing });
      if (table === 'program_versions') {
        return query({ data: { id: 'version-1', program_id: 'program-1', duration_days: 7, status: 'published' } });
      }
      return query({ data: null });
    });

    await expect(updateDeliveryModule('row-1', { title: 'Changed' })).rejects.toThrow(
      'Published program versions are immutable',
    );
  });

  test('rejects reorder writes to a published version before touching module rows', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'program_versions') {
        return query({ data: { id: 'version-1', program_id: 'program-1', duration_days: 7, status: 'published' } });
      }
      return query({ data: [] });
    });

    await expect(reorderDeliveryModules('program-1', ['row-1'], 'version-1')).rejects.toThrow(
      'Published program versions are immutable',
    );
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('creates a draft through the transactional clone RPC', async () => {
    const created = { id: 'version-2', status: 'draft' };
    mockRpc.mockResolvedValue({ data: created, error: null });
    await expect(createProgramVersionDraft({
      programId: 'program-1',
      sourceVersionId: 'version-1',
      versionLabel: 'Fall refresh',
      durationDays: 14,
    })).resolves.toEqual(created);
    expect(mockRpc).toHaveBeenCalledWith('create_program_version_draft', {
      p_program_id: 'program-1',
      p_source_version_id: 'version-1',
      p_version_label: 'Fall refresh',
      p_duration_days: 14,
    });
  });

  test('publishes only after versioned draft rows validate, through one RPC', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'program_versions') {
        return query({ data: { id: 'version-1', program_id: 'program-1', duration_days: 7, status: 'draft' } });
      }
      if (table === 'program_delivery_modules') {
        return query({ data: [{ ...existing, program_version_id: 'version-1', status: 'draft' }] });
      }
      return query({ data: [] });
    });
    const published = { id: 'version-1', status: 'published' };
    mockRpc.mockResolvedValue({ data: published, error: null });

    await expect(publishProgramVersion({
      programId: 'program-1',
      programVersionId: 'version-1',
    })).resolves.toEqual(published);
    expect(mockRpc).toHaveBeenCalledWith('publish_program_version', {
      p_program_id: 'program-1',
      p_program_version_id: 'version-1',
    });
  });

  test('refuses to publish malformed composition before invoking the database transaction', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'program_versions') {
        return query({ data: { id: 'version-1', program_id: 'program-1', duration_days: 7, status: 'draft' } });
      }
      if (table === 'program_delivery_modules') {
        return query({ data: [{
          ...existing,
          program_version_id: 'version-1',
          status: 'draft',
          day_start: 8,
          day_end: 9,
          metadata: { composition: { contract: 'programs-delivery-composition-v1' }, blocks: [] },
        }] });
      }
      return query({ data: [] });
    });

    await expect(publishProgramVersion({
      programId: 'program-1',
      programVersionId: 'version-1',
    })).rejects.toThrow('outside the selected version duration');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('passes explicit duration for a blank draft and clone overrides', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'new-draft', status: 'draft' }, error: null });
    await createProgramVersionDraft({ programId: 'program-1', durationDays: 2 });
    expect(mockRpc).toHaveBeenLastCalledWith('create_program_version_draft', {
      p_program_id: 'program-1',
      p_source_version_id: null,
      p_version_label: null,
      p_duration_days: 2,
    });
    await createProgramVersionDraft({ programId: 'program-1', sourceVersionId: 'published-version', durationDays: 2 });
    expect(mockRpc).toHaveBeenLastCalledWith('create_program_version_draft', {
      p_program_id: 'program-1',
      p_source_version_id: 'published-version',
      p_version_label: null,
      p_duration_days: 2,
    });
  });

  test('rejects check-in creation when draft duration is missing', async () => {
    mockFrom.mockImplementation((table: string) => table === 'program_versions'
      ? query({ data: { id: 'version-1', program_id: 'program-1', duration_days: null, status: 'draft' } })
      : query({ data: null }));
    await expect(saveCheckinTemplateForDraft({
      programId: 'program-1', programVersionId: 'version-1', checkinDay: 1,
      title: 'Day one', questionsJson: [],
    })).rejects.toThrow('Set a program version duration');
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('rejects a check-in day exceeding the configured duration', async () => {
    mockFrom.mockImplementation((table: string) => table === 'program_versions'
      ? query({ data: { id: 'version-1', program_id: 'program-1', duration_days: 2, status: 'draft' } })
      : query({ data: null }));
    await expect(saveCheckinTemplateForDraft({
      programId: 'program-1', programVersionId: 'version-1', checkinDay: 3,
      title: 'Beyond end', questionsJson: [],
    })).rejects.toThrow('between 1 and 2');
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('persists Day 1 check-in for a draft with a two-day duration', async () => {
    const insert = query({ data: { id: 'qa-day-1' } });
    mockFrom.mockImplementation((table: string) => table === 'program_versions'
      ? query({ data: { id: 'version-1', program_id: 'program-1', duration_days: 2, status: 'draft' } })
      : insert);
    await expect(saveCheckinTemplateForDraft({
      programId: 'program-1', programVersionId: 'version-1', checkinDay: 1,
      title: 'Day one', questionsJson: [],
    })).resolves.toEqual({ id: 'qa-day-1' });
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      checkin_day: 1, title: 'Day one', status: 'draft',
    }));
  });

  test('persists check-in templates only on draft versions and within duration', async () => {
    const template = { id: 'template-1', checkin_day: 7, title: 'Weekly check-in' };
    const insert = query({ data: template });
    mockFrom.mockImplementation((table: string) => table === 'program_versions'
      ? query({ data: { id: 'version-1', program_id: 'program-1', duration_days: 7, status: 'draft' } })
      : insert);

    await expect(saveCheckinTemplateForDraft({
      programId: 'program-1', programVersionId: 'version-1', checkinDay: 7,
      title: ' Weekly check-in ', questionsJson: [],
    })).resolves.toEqual(template);
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      program_version_id: 'version-1', checkin_day: 7, title: 'Weekly check-in', status: 'draft',
    }));

    mockFrom.mockImplementation((table: string) => table === 'program_versions'
      ? query({ data: { id: 'version-1', program_id: 'program-1', duration_days: 7, status: 'published' } })
      : query({ data: null }));
    await expect(saveCheckinTemplateForDraft({
      programId: 'program-1', programVersionId: 'version-1', checkinDay: 8,
      title: 'Too late', questionsJson: [],
    })).rejects.toThrow('only be edited on a draft version');
  });
});
