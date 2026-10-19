let getDetailMock: jest.Mock;
let getDeliveryMock: jest.Mock;
let getLatestVersionMock: jest.Mock;
let getSummaryMock: jest.Mock;
let listEnrollmentsMock: jest.Mock;
let resolvePersonMock: jest.Mock;
let requireAuthMock: jest.Mock;

jest.mock('@/lib/access/requireJournalAccess', () => {
  requireAuthMock = jest.fn();
  resolvePersonMock = jest.fn();
  return {
    requireJournalAuth: (...args: unknown[]) => requireAuthMock(...args),
    resolveJournalTargetPerson: (...args: unknown[]) => resolvePersonMock(...args),
  };
});
jest.mock('@/lib/programs/programLibraryServerService', () => {
  getDetailMock = jest.fn();
  return { getLibraryDetailForPerson: (...args: unknown[]) => getDetailMock(...args) };
});
jest.mock('@/lib/programs/deliveryModuleDeliveryServerService', () => {
  getDeliveryMock = jest.fn();
  return { getDeliveryModulesForProgramWithFallback: (...args: unknown[]) => getDeliveryMock(...args) };
});
jest.mock('@/lib/programs/programRuntimeServerService', () => {
  getLatestVersionMock = jest.fn();
  getSummaryMock = jest.fn();
  listEnrollmentsMock = jest.fn();
  return {
    getLatestPublishedProgramVersionForSlug: (...args: unknown[]) => getLatestVersionMock(...args),
    getProgramRuntimeSummaryForPerson: (...args: unknown[]) => getSummaryMock(...args),
    listEnrollmentsForPerson: (...args: unknown[]) => listEnrollmentsMock(...args),
  };
});

import handler from '../[slug]/delivery-modules';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from '@/lib/programs/baselineDay0To21Candidate';
import { resolveCanonicalMemberDelivery } from '@/lib/programs/canonicalMemberDelivery';
import {
  PROGRAM_BLUEPRINT_METADATA_KEY,
  toProgramBlueprintVersionFields,
} from '@/lib/programs/programBlueprint';
import type { ProgramDeliveryModuleDefinition } from '@/lib/programs/deliveryModuleTypes';
import type { ProgramEnrollmentStatus, ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';

const PERSON_ID = '10000000-0000-4000-8000-000000000001';
const VERSION_ID = 'f7d82542-b906-4f9a-b658-d076bf3b37fa';

function publishedModules(): ProgramDeliveryModuleDefinition[] {
  return BASELINE_DAY_0_TO_21_BLUEPRINT.modules.map((module) => ({
    ...module,
    body: `body:${module.id}`,
  }));
}

function summary(status: ProgramEnrollmentStatus, currentDay: number): ProgramRuntimeSummary {
  return {
    enrollment: {
      id: 'enrollment-1',
      person_id: PERSON_ID,
      program_id: '865c15ab-b781-4cab-9d24-c1c49a5f6513',
      program_slug: 'baseline',
      program_version_id: VERSION_ID,
      source_type: 'entitlement',
      source_ref: null,
      entitlement_key: 'program:baseline',
      assignment_id: null,
      purchase_date: null,
      selected_start_date: '2026-10-01',
      started_at: '2026-10-01T00:00:00.000Z',
      completed_at: status === 'completed' ? '2026-10-21T00:00:00.000Z' : null,
      status,
      timezone: 'America/Chicago',
      current_capacity: 'steady',
      paused_days_total: 0,
      pause_until: null,
      input_snapshot_json: {},
      computed_metrics_snapshot_json: {},
      metadata: {},
      created_by_user_id: null,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    },
    version: {
      id: VERSION_ID,
      program_id: '865c15ab-b781-4cab-9d24-c1c49a5f6513',
      version_key: 'v3-f738fb92',
      version_label: 'Baseline — Day 0–21 member draft',
      version_number: 3,
      status: 'published',
      duration_days: 21,
      default_unlock_day: 0,
      published_at: '2026-10-18T23:13:56.162Z',
      metadata: {
        [PROGRAM_BLUEPRINT_METADATA_KEY]: toProgramBlueprintVersionFields(BASELINE_DAY_0_TO_21_BLUEPRINT),
      },
      created_by_user_id: null,
      created_at: '2026-10-18T00:00:00.000Z',
      updated_at: '2026-10-18T00:00:00.000Z',
    },
    program: {
      id: '865c15ab-b781-4cab-9d24-c1c49a5f6513',
      slug: 'baseline',
      title: 'Baseline',
      tagline: null,
      description: null,
      storefront_href: null,
    },
    resolved_status: status,
    current_day: currentDay,
    timezone: 'America/Chicago',
    next_checkin_template: null,
    latest_checkin_response: null,
    latest_recommendation: null,
    resolved_at: '2026-10-18T00:00:00.000Z',
  };
}

function makeResponse() {
  const res: {
    statusCode: number;
    body: { modules?: ProgramDeliveryModuleDefinition[]; error?: string; source?: string };
    status: (code: number) => typeof res;
    json: (body: typeof res.body) => typeof res;
    setHeader: (name: string, value: string) => void;
  } = {
    statusCode: 200,
    body: {},
    status(code: number) { this.statusCode = code; return this; },
    json(body: typeof res.body) { this.body = body; return this; },
    setHeader() {},
  };
  return res;
}

async function deliver(status: ProgramEnrollmentStatus, currentDay: number, modules = publishedModules()) {
  const runtime = summary(status, currentDay);
  listEnrollmentsMock.mockResolvedValue([runtime.enrollment]);
  getSummaryMock.mockResolvedValue(runtime);
  getDeliveryMock.mockResolvedValue({ source: 'admin', modules });
  const res = makeResponse();
  await handler(
    { method: 'GET', query: { slug: 'baseline', version_id: VERSION_ID } } as never,
    res as never,
  );
  const presented = resolveCanonicalMemberDelivery({
    programSlug: 'baseline',
    summary: runtime,
    modules: res.body.modules ?? [],
    authorizedPersonId: PERSON_ID,
    response: {
      routeSlug: 'baseline',
      personId: PERSON_ID,
      versionId: VERSION_ID,
    },
  });
  return { res, presented, runtime };
}

describe('canonical Baseline member delivery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireAuthMock.mockResolvedValue({ userId: 'user-1' });
    resolvePersonMock.mockResolvedValue(PERSON_ID);
    getDetailMock.mockResolvedValue({ slug: 'baseline', has_entitlement: true });
    getLatestVersionMock.mockResolvedValue({ id: VERSION_ID, status: 'published' });
  });

  test('renders the five authorized Day 0 modules from the delivery response', async () => {
    const { res, presented } = await deliver('pre_start', 0);

    expect(res.statusCode).toBe(200);
    expect(res.body.modules?.map((module) => module.id)).toEqual([
      'baseline-candidate-day-0-orientation',
      'baseline-candidate-day-0-meal-map',
      'baseline-candidate-day-0-create-meals',
      'baseline-candidate-day-0-prepare-pantry',
      'baseline-candidate-day-0-roadmap',
    ]);
    expect(presented.binding.kind).toBe('published-blueprint');
    expect(presented.deliveryModules.map((module) => module.id)).toEqual(
      res.body.modules?.map((module) => module.id),
    );
    expect(JSON.stringify(presented.deliveryModules)).not.toContain('baseline-candidate-day-1-practice');
  });

  test.each([
    [1, 8, 'baseline-candidate-day-1-practice', 'baseline-candidate-day-2-practice', 'baseline-candidate-week-2-context'],
    [7, 20, 'baseline-candidate-day-7-reflection', 'baseline-candidate-day-8-practice', 'baseline-candidate-week-2-context'],
    [14, 35, 'baseline-candidate-day-14-practice', 'baseline-candidate-day-15-practice', 'baseline-candidate-week-3-context'],
    [21, 50, 'baseline-candidate-day-21-reflection', 'baseline-candidate-day-22-practice', 'missing-future-week'],
  ] as const)('authorizes day %s and withholds later lesson bodies', async (day, count, present, absent, alsoAbsent) => {
    const { res, presented } = await deliver('active', day);
    const ids = presented.deliveryModules.map((module) => module.id);

    expect(res.statusCode).toBe(200);
    expect(ids).toHaveLength(count);
    expect(ids).toContain(present);
    expect(ids).not.toContain(absent);
    expect(ids).not.toContain(alsoAbsent);
    expect(presented.binding.kind).toBe('published-blueprint');
    expect(JSON.stringify(res.body.modules)).not.toContain(`body:${absent}`);
    expect(JSON.stringify(res.body.modules)).not.toContain(`body:${alsoAbsent}`);
  });

  test('keeps paused and completed review inside the reached day', async () => {
    const paused = await deliver('paused', 14);
    const pausedIds = paused.presented.deliveryModules.map((module) => module.id);
    expect(paused.res.statusCode).toBe(200);
    expect(paused.presented.binding.kind).toBe('published-blueprint');
    expect(pausedIds).toHaveLength(35);
    expect(pausedIds).toContain('baseline-candidate-day-14-reflection');
    expect(pausedIds).not.toContain('baseline-candidate-day-15-practice');
    expect(paused.presented.deliveryModules.every((module) => module.cta == null)).toBe(true);

    const completed = await deliver('completed', 21);
    expect(completed.presented.binding.kind).toBe('published-blueprint');
    expect(completed.presented.deliveryModules).toHaveLength(50);
    expect(completed.presented.deliveryModules.every((module) => module.cta == null)).toBe(true);
    expect(JSON.stringify(completed.res.body.modules)).toContain('body:baseline-candidate-day-21-reflection');
  });

  test('fail-closes an incomplete source, a foreign module, malformed bounds, and a wrong person', async () => {
    const dayZeroOnly = publishedModules().filter((module) => module.dayStart === 0);
    const incomplete = await deliver('pre_start', 0, dayZeroOnly);
    expect(incomplete.res.statusCode).toBe(409);
    expect(incomplete.presented.binding).toEqual({ kind: 'unavailable', reason: 'incomplete-content' });
    expect(incomplete.presented.deliveryModules).toEqual([]);

    const foreign = publishedModules();
    foreign.push({
      ...foreign[0],
      id: 'baseline-v1-day-0-orientation',
      body: 'body:foreign',
    });
    const foreignDelivery = await deliver('pre_start', 0, foreign);
    expect(foreignDelivery.res.statusCode).toBe(409);
    const foreignPresented = resolveCanonicalMemberDelivery({
      programSlug: 'baseline',
      summary: foreignDelivery.runtime,
      modules: foreign,
      authorizedPersonId: PERSON_ID,
      response: { routeSlug: 'baseline', personId: PERSON_ID, versionId: VERSION_ID },
    });
    expect(foreignPresented.binding).toEqual({ kind: 'unavailable', reason: 'wrong-version-modules' });
    expect(foreignPresented.deliveryModules).toEqual([]);

    const malformed = publishedModules();
    malformed[8] = { ...malformed[8], dayEnd: 21, body: 'body:malformed-future' };
    const malformedDelivery = await deliver('active', 1, malformed);
    expect(malformedDelivery.res.statusCode).toBe(409);
    const malformedPresented = resolveCanonicalMemberDelivery({
      programSlug: 'baseline',
      summary: malformedDelivery.runtime,
      modules: malformed,
      authorizedPersonId: PERSON_ID,
      response: { routeSlug: 'baseline', personId: PERSON_ID, versionId: VERSION_ID },
    });
    expect(malformedPresented.binding).toEqual({ kind: 'unavailable', reason: 'malformed-content' });

    const valid = await deliver('active', 1);
    const wrongPerson = resolveCanonicalMemberDelivery({
      programSlug: 'baseline',
      summary: valid.runtime,
      modules: valid.res.body.modules ?? [],
      authorizedPersonId: 'someone-else',
      response: {
        routeSlug: 'baseline',
        personId: 'someone-else',
        versionId: VERSION_ID,
      },
    });
    expect(wrongPerson.binding).toEqual({ kind: 'unavailable', reason: 'wrong-person' });
    expect(wrongPerson.deliveryModules).toEqual([]);
    expect(JSON.stringify(wrongPerson.deliveryModules)).not.toContain('body:');
  });
});
