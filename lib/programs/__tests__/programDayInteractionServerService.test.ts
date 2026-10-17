jest.mock('@/lib/supabaseServerClient', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('../programRuntimeServerService', () => ({ getProgramRuntimeSummaryForPerson: jest.fn() }));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { getProgramRuntimeSummaryForPerson } from '../programRuntimeServerService';
import {
  completeProgramDay,
  getProgramDayCompletion,
  getProgramDayObservation,
  PROGRAM_DAY_NOT_UNLOCKED,
  PROGRAM_DAY_READ_ONLY,
  PROGRAM_DAY_REQUIREMENTS_UNMET,
  writeProgramDayObservation,
} from '../programDayInteractionServerService';

const VERSION_ID = 'f5c52fd9-b8a0-48bc-a7bb-2100d21b0021';
const OTHER_VERSION_ID = '11111111-1111-4111-8111-111111111111';
const PROGRAM_ID = 'c6c3bc25-5778-4a43-92f5-13b6136d2b6b';
const ENROLLMENT_ID = 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2';
const PERSON_ID = '32da6ab4-818e-467b-bd10-4ef7f184825b';

function publishedModule(overrides: Record<string, unknown> = {}) {
  return {
    module_key: 'baseline-candidate-day-7-reflection',
    metadata: { completionRequired: true },
    program_id: PROGRAM_ID,
    program_version_id: VERSION_ID,
    status: 'published',
    day_start: 7,
    day_end: 7,
    status_visibility: ['active'],
    ...overrides,
  };
}

type QueryState = { table: string; filters: Record<string, unknown>; write: Record<string, unknown> | null };
let states: QueryState[];
let rows: Record<string, unknown[]>;
let singleRows: Record<string, unknown>;
let ignoredDuplicateCompletionUpsert = false;

function makeQuery(table: string) {
  const state: QueryState = { table, filters: {}, write: null };
  states.push(state);
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'order', 'limit', 'eq', 'lte', 'gte', 'is', 'contains']) {
    query[method] = (...args: unknown[]) => {
      if (method === 'eq' || method === 'lte' || method === 'gte' || method === 'is' || method === 'contains') {
        state.filters[String(args[0])] = args[1];
      }
      return query;
    };
  }
  query.upsert = (value: Record<string, unknown>) => { state.write = value; return query; };
  query.maybeSingle = async () => ({
    data: ignoredDuplicateCompletionUpsert && table === 'program_day_completions' && state.write
      ? null
      : singleRows[table] ?? null,
    error: null,
  });
  query.single = async () => ({ data: state.write ?? singleRows[table] ?? null, error: null });
  query.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject);
  return query;
}

const activeSummary = {
  enrollment: { id: ENROLLMENT_ID, person_id: PERSON_ID },
  version: { id: VERSION_ID, program_id: PROGRAM_ID, duration_days: 21 },
  resolved_status: 'active',
  current_day: 7,
};

beforeEach(() => {
  states = [];
  rows = {};
  singleRows = {};
  ignoredDuplicateCompletionUpsert = false;
  jest.clearAllMocks();
  (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue(activeSummary);
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => makeQuery(table));
});

describe('versioned day observations', () => {
  it('saves an explicit response and reloads it under the same enrollment/version/day/module identity', async () => {
    const key = 'baseline-candidate-day-7-reflection';
    singleRows.program_delivery_modules = { id: 'module-row', module_key: key, day_start: 7, day_end: 7, metadata: { completionRequired: true } };
    singleRows.program_day_observations = { draft_text: 'My note', response_text: 'My note', saved_at: '2026-10-13T12:00:00.000Z' };

    const saved = await writeProgramDayObservation({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7, contentKey: key, text: 'My note', commit: true });
    expect(saved.response_text).toBe('My note');
    const observationWrite = states.find((state) => state.table === 'program_day_observations' && state.write);
    expect(observationWrite?.write).toMatchObject({ enrollment_id: ENROLLMENT_ID, program_version_id: VERSION_ID, program_day: 7, content_key: key, response_text: 'My note' });
    expect(states.find((state) => state.table === 'program_delivery_modules')?.filters.program_version_id).toBe(VERSION_ID);

    const reloaded = await getProgramDayObservation({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7, contentKey: key });
    expect(reloaded.response_text).toBe('My note');
  });

  it('rejects version mismatch and future-day saves', async () => {
    singleRows.program_delivery_modules = null;
    await expect(getProgramDayObservation({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7, contentKey: 'old-version-module' }))
      .rejects.toMatchObject({ code: 'PROGRAM_DAY_MODULE_NOT_FOUND' });

    (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue({ ...activeSummary, current_day: 6 });
    await expect(writeProgramDayObservation({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7, contentKey: 'baseline-candidate-day-7-reflection', text: 'x', commit: true }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_NOT_UNLOCKED });
  });
});

describe('true day completion', () => {
  it('requires saved authored modules and a completed or skipped check-in, then writes one versioned completion', async () => {
    rows.program_delivery_modules = [publishedModule()];
    rows.program_day_observations = [{ content_key: 'baseline-candidate-day-7-reflection', response_text: 'Saved' }];
    rows.program_checkin_templates = [{ id: 'template' }];
    singleRows.program_checkin_responses = { response_status: 'skipped', checkin_template_id: 'template' };
    singleRows.program_day_completions = { id: 'completion', enrollment_id: ENROLLMENT_ID, program_version_id: VERSION_ID, program_day: 7, completed_at: '2026-10-13T12:00:00.000Z' };

    const completion = await completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 });
    expect(completion).toMatchObject({ enrollment_id: ENROLLMENT_ID, program_version_id: VERSION_ID, program_day: 7 });
    expect(states.find((state) => state.table === 'program_delivery_modules')?.filters).toMatchObject({
      program_id: PROGRAM_ID,
      program_version_id: VERSION_ID,
      status: 'published',
      day_start: 7,
      day_end: 7,
      status_visibility: ['active'],
    });
    expect(states.find((state) => state.table === 'program_day_completions')?.write).toMatchObject({ enrollment_id: ENROLLMENT_ID, program_version_id: VERSION_ID, program_day: 7 });

    const loaded = await getProgramDayCompletion({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 });
    expect(loaded?.id).toBe('completion');
  });

  it('blocks an unhandled check-in without writing a completion record', async () => {
    rows.program_delivery_modules = [publishedModule()];
    rows.program_day_observations = [{ content_key: 'baseline-candidate-day-7-reflection', response_text: 'Saved' }];
    rows.program_checkin_templates = [{ id: 'template' }];
    singleRows.program_checkin_responses = { response_status: 'skipped', checkin_template_id: 'other-version-template' };
    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_REQUIREMENTS_UNMET });
    expect(states.some((state) => state.table === 'program_day_completions' && state.write)).toBe(false);
  });
});

describe('published delivery content guard', () => {
  function expectNoCompletionWrite() {
    expect(states.some((state) => state.table === 'program_day_completions' && state.write)).toBe(false);
  }

  it('rejects an empty day when only a check-in or code fallback is available', async () => {
    rows.program_delivery_modules = [];
    rows.program_checkin_templates = [{ id: 'template' }];
    singleRows.program_checkin_responses = { response_status: 'completed', checkin_template_id: 'template' };

    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_REQUIREMENTS_UNMET });
    expectNoCompletionWrite();
    expect(states.some((state) => state.table === 'program_checkin_templates')).toBe(false);
  });

  it('rejects unpublished delivery content', async () => {
    rows.program_delivery_modules = [publishedModule({ status: 'draft', metadata: { source: 'baseline_code' } })];
    rows.program_checkin_templates = [{ id: 'template' }];
    singleRows.program_checkin_responses = { response_status: 'completed', checkin_template_id: 'template' };

    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_REQUIREMENTS_UNMET });
    expectNoCompletionWrite();
  });

  it('rejects a published module from another program version', async () => {
    rows.program_delivery_modules = [publishedModule({ program_version_id: OTHER_VERSION_ID })];
    rows.program_day_observations = [{ content_key: 'baseline-candidate-day-7-reflection', response_text: 'Saved' }];

    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_REQUIREMENTS_UNMET });
    expectNoCompletionWrite();
  });

  it('rejects a published module from another program', async () => {
    rows.program_delivery_modules = [publishedModule({ program_id: '99999999-9999-4999-8999-999999999999' })];

    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_REQUIREMENTS_UNMET });
    expectNoCompletionWrite();
  });

  it('rejects a published module outside the requested day', async () => {
    rows.program_delivery_modules = [publishedModule({ day_start: 8, day_end: 8 })];

    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_REQUIREMENTS_UNMET });
    expectNoCompletionWrite();
  });

  it('rejects a published module that is not visible for the active lifecycle', async () => {
    rows.program_delivery_modules = [publishedModule({ status_visibility: ['paused', 'completed'] })];
    rows.program_day_observations = [{ content_key: 'baseline-candidate-day-7-reflection', response_text: 'Saved' }];
    rows.program_checkin_templates = [{ id: 'template' }];
    singleRows.program_checkin_responses = { response_status: 'completed', checkin_template_id: 'template' };

    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_REQUIREMENTS_UNMET });
    expectNoCompletionWrite();
  });

  it('rejects Day 0 completion when no published Day 0 content is visible before start', async () => {
    (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue({ ...activeSummary, resolved_status: 'pre_start', current_day: 0 });
    rows.program_delivery_modules = [publishedModule({ status_visibility: ['active'], day_start: 0, day_end: 0 })];
    rows.program_checkin_templates = [{ id: 'template' }];
    singleRows.program_checkin_responses = { response_status: 'completed', checkin_template_id: 'template' };

    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 0 }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_REQUIREMENTS_UNMET });
    expect(states.find((state) => state.table === 'program_delivery_modules')?.filters.status_visibility).toEqual(['pre_start']);
    expectNoCompletionWrite();
  });

  it('returns an existing active completion when published content is no longer available', async () => {
    const existing = { id: 'completion', enrollment_id: ENROLLMENT_ID, program_version_id: VERSION_ID, program_day: 7, completed_at: '2026-10-13T12:00:00.000Z' };
    rows.program_delivery_modules = [];
    singleRows.program_day_completions = existing;

    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 })).resolves.toEqual(existing);
    expectNoCompletionWrite();
  });
});

describe('enrollment lifecycle write authorization', () => {
  const deniedStatuses = ['paused', 'completed', 'cancelled', 'not_started'] as const;

  it.each(deniedStatuses)('denies observation draft and save writes for %s enrollments without database mutations', async (status) => {
    (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue({ ...activeSummary, resolved_status: status });
    for (const commit of [false, true]) {
      await expect(writeProgramDayObservation({
        personId: PERSON_ID,
        enrollmentId: ENROLLMENT_ID,
        day: 7,
        contentKey: 'baseline-candidate-day-7-reflection',
        text: 'unsaved or saved response',
        commit,
      })).rejects.toMatchObject({ code: PROGRAM_DAY_READ_ONLY });
    }
    expect(states.some((state) => state.write)).toBe(false);
  });

  it.each(deniedStatuses.filter((status) => status !== 'completed'))('denies new day completion for %s enrollments without database mutations', async (status) => {
    (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue({ ...activeSummary, resolved_status: status });
    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_READ_ONLY });
    expect(states.some((state) => state.write)).toBe(false);
  });

  it('allows Day 0 observation and completion for a legitimate pre-start enrollment', async () => {
    (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue({ ...activeSummary, resolved_status: 'pre_start', current_day: 0 });
    singleRows.program_delivery_modules = { id: 'setup', module_key: 'baseline-day-0-reflection', day_start: 0, day_end: 0, metadata: {} };
    await writeProgramDayObservation({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 0, contentKey: 'baseline-day-0-reflection', text: 'Ready', commit: false });
    expect(states.some((state) => state.table === 'program_day_observations' && state.write)).toBe(true);

    states = [];
    rows = {
      program_delivery_modules: [publishedModule({
        module_key: 'baseline-day-0-reflection',
        metadata: {},
        day_start: 0,
        day_end: 0,
        status_visibility: ['pre_start'],
      })],
      program_checkin_templates: [],
    };
    singleRows = {};
    await completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 0 });
    expect(states.find((state) => state.table === 'program_delivery_modules')?.filters.status_visibility).toEqual(['pre_start']);
    expect(states.some((state) => state.table === 'program_day_completions' && state.write)).toBe(true);
  });

  it('returns an existing completed-day record through the read path without upserting', async () => {
    const existing = { id: 'completion', enrollment_id: ENROLLMENT_ID, program_version_id: VERSION_ID, program_day: 7, completed_at: '2026-10-13T12:00:00.000Z' };
    (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue({ ...activeSummary, resolved_status: 'completed' });
    singleRows.program_day_completions = existing;

    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 })).resolves.toEqual(existing);
    expect(states.some((state) => state.table === 'program_day_completions' && state.write)).toBe(false);
  });

  it('preserves historical observation and completion reads for read-only lifecycle states', async () => {
    const key = 'baseline-candidate-day-7-reflection';
    const completion = { id: 'completion', enrollment_id: ENROLLMENT_ID, program_version_id: VERSION_ID, program_day: 7, completed_at: '2026-10-13T12:00:00.000Z' };
    (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue({ ...activeSummary, resolved_status: 'paused' });
    singleRows.program_delivery_modules = { id: 'module-row', module_key: key, day_start: 7, day_end: 7, metadata: {} };
    singleRows.program_day_observations = { draft_text: 'Draft', response_text: 'Saved', saved_at: '2026-10-13T12:00:00.000Z' };
    singleRows.program_day_completions = completion;

    await expect(getProgramDayObservation({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7, contentKey: key }))
      .resolves.toMatchObject({ response_text: 'Saved' });
    await expect(getProgramDayCompletion({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 }))
      .resolves.toEqual(completion);
    expect(states.some((state) => state.write)).toBe(false);
  });

  it('keeps active completion retries idempotent when the unique row already exists', async () => {
    const existing = { id: 'completion', enrollment_id: ENROLLMENT_ID, program_version_id: VERSION_ID, program_day: 7, completed_at: '2026-10-13T12:00:00.000Z' };
    rows.program_delivery_modules = [publishedModule({ metadata: {} })];
    rows.program_day_observations = [];
    rows.program_checkin_templates = [];
    singleRows.program_checkin_responses = null;
    singleRows.program_day_completions = existing;
    ignoredDuplicateCompletionUpsert = true;

    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 })).resolves.toEqual(existing);
    const completionQueries = states.filter((state) => state.table === 'program_day_completions');
    expect(completionQueries).toHaveLength(2);
    expect(completionQueries[0].write).toMatchObject({ enrollment_id: ENROLLMENT_ID, program_version_id: VERSION_ID, program_day: 7 });
    expect(completionQueries[1].write).toBeNull();
  });

  it('denies a new completion for completed enrollment when no existing completion can be read', async () => {
    (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue({ ...activeSummary, resolved_status: 'completed' });
    await expect(completeProgramDay({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 7 }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_READ_ONLY });
    expect(states.some((state) => state.write)).toBe(false);
  });

  it('preserves enrollment ownership, version identity and future-day denial without writes', async () => {
    (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue(null);
    await expect(writeProgramDayObservation({ personId: 'wrong-person', enrollmentId: ENROLLMENT_ID, day: 7, contentKey: 'reflection', text: 'x', commit: true }))
      .rejects.toMatchObject({ code: 'PROGRAM_ENROLLMENT_NOT_FOUND' });
    expect(states.some((state) => state.write)).toBe(false);

    (getProgramRuntimeSummaryForPerson as jest.Mock).mockResolvedValue(activeSummary);
    await expect(writeProgramDayObservation({ personId: PERSON_ID, enrollmentId: ENROLLMENT_ID, day: 8, contentKey: 'reflection', text: 'x', commit: true }))
      .rejects.toMatchObject({ code: PROGRAM_DAY_NOT_UNLOCKED });
    expect(states.some((state) => state.write)).toBe(false);
  });
});
