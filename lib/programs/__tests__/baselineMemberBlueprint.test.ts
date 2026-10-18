jest.mock('@/lib/supabaseServerClient', () => ({ supabaseAdmin: {} }));

import { ProgramDeliveryModuleCreateSchema } from '../deliveryModuleAdminServerService';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from '../baselineDay0To21Candidate';
import {
  PROTECTED_BASELINE_V1,
  UNTOUCHED_BASELINE_DRAFT,
  resolveMemberBlueprintBinding,
} from '../baselineMemberBinding';
import {
  assessBaselineMemberPublication,
  baselineMemberDraftVersionRecord,
  toBaselineMemberDraftImportPayloads,
} from '../baselineMemberDraftImport';
import {
  BASELINE_MEMBER_MODULE_KEYS,
  GENERATED_PROGRAM_VERSION_KEY,
} from '../baselineMemberModuleIdentity';
import { PROGRAM_BLUEPRINT_METADATA_KEY } from '../programBlueprint';
import type { ProgramDeliveryModuleDefinition } from '../deliveryModuleTypes';
import type { ProgramRuntimeSummary } from '../runtimeTypes';

const PERSON_ID = '10000000-0000-4000-8000-000000000001';
const MEMBER_VERSION_ID = '20000000-0000-4000-8000-000000000021';
const GENERATED_VERSION_KEY = 'v3-a1b2c3d4';

function trustedModules(): ProgramDeliveryModuleDefinition[] {
  return BASELINE_DAY_0_TO_21_BLUEPRINT.modules.map((module) => ({ ...module }));
}

function baseSummary(): ProgramRuntimeSummary {
  const draft = baselineMemberDraftVersionRecord();
  return {
    enrollment: {
      id: 'enrollment-1',
      person_id: PERSON_ID,
      program_id: 'program-1',
      program_slug: 'baseline',
      program_version_id: MEMBER_VERSION_ID,
      source_type: 'entitlement',
      source_ref: null,
      entitlement_key: null,
      assignment_id: null,
      purchase_date: null,
      selected_start_date: '2026-10-01',
      started_at: '2026-10-01T00:00:00.000Z',
      completed_at: null,
      status: 'active',
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
      id: MEMBER_VERSION_ID,
      program_id: 'program-1',
      version_key: GENERATED_VERSION_KEY,
      version_label: draft.versionLabel,
      version_number: 3,
      status: 'published',
      duration_days: draft.durationDays,
      default_unlock_day: 0,
      published_at: '2026-10-16T00:00:00.000Z',
      metadata: draft.metadata,
      created_by_user_id: null,
      created_at: '2026-10-16T00:00:00.000Z',
      updated_at: '2026-10-16T00:00:00.000Z',
    },
    program: {
      id: 'program-1',
      slug: 'baseline',
      title: 'Baseline',
      tagline: null,
      description: null,
      storefront_href: null,
    },
    resolved_status: 'active',
    current_day: 3,
    timezone: 'America/Chicago',
    next_checkin_template: null,
    latest_checkin_response: null,
    latest_recommendation: null,
    resolved_at: '2026-10-16T00:00:00.000Z',
  };
}

function summary(overrides: Partial<ProgramRuntimeSummary> = {}): ProgramRuntimeSummary {
  const base = baseSummary();
  return {
    ...base,
    ...overrides,
    enrollment: { ...base.enrollment, ...overrides.enrollment },
    version: { ...base.version, ...overrides.version },
    program: { ...base.program, ...overrides.program },
  };
}

describe('Baseline member blueprint binding', () => {
  const serverModules = trustedModules();

  it('binds a published, owned, version-pinned Blueprint and gates future modules', () => {
    const binding = resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary(),
      modules: serverModules,
      authorizedPersonId: PERSON_ID,
      requestedDay: 21,
      response: {
        routeSlug: 'baseline',
        personId: PERSON_ID,
        versionId: MEMBER_VERSION_ID,
      },
    });

    expect(binding.kind).toBe('published-blueprint');
    if (binding.kind !== 'published-blueprint') return;
    expect(binding.versionKey).toBe(GENERATED_VERSION_KEY);
    expect(GENERATED_PROGRAM_VERSION_KEY.test(binding.versionKey)).toBe(true);
    expect(binding.versionId).toBe(MEMBER_VERSION_ID);
    expect(binding.modules.some((module) => module.id === 'baseline-candidate-day-3-practice')).toBe(true);
    expect(binding.modules.some((module) => module.id === 'baseline-candidate-day-21-practice')).toBe(false);
    expect(binding.config).not.toHaveProperty('modules');
    expect(binding.dayRail.find((item) => item.day === 4)?.accessible).toBe(false);
    expect(binding.dayRail.find((item) => item.day === 3)?.accessible).toBe(true);
    expect(binding.dayRail).toHaveLength(22);
  });

  it('keeps published Baseline v1 on the existing member path', () => {
    const binding = resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary({
        enrollment: {
          program_version_id: PROTECTED_BASELINE_V1.versionId,
        },
        version: {
          id: PROTECTED_BASELINE_V1.versionId,
          version_key: PROTECTED_BASELINE_V1.versionKey,
          metadata: baselineMemberDraftVersionRecord().metadata,
        },
      }),
      modules: serverModules,
      authorizedPersonId: PERSON_ID,
      response: {
        routeSlug: 'baseline',
        personId: PERSON_ID,
        versionId: PROTECTED_BASELINE_V1.versionId,
      },
    });

    expect(binding).toEqual({ kind: 'legacy-member', reason: 'protected-version' });
  });

  it('refuses an unpinned, unpublished, wrong-person, or non-baseline runtime', () => {
    const matched = {
      routeSlug: 'baseline',
      personId: PERSON_ID,
      versionId: MEMBER_VERSION_ID,
    };
    expect(resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary({
        enrollment: { program_version_id: 'other-version' },
      }),
      modules: serverModules,
      authorizedPersonId: PERSON_ID,
      response: matched,
    })).toEqual({ kind: 'unavailable', reason: 'version-unpinned' });

    expect(resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary({
        version: { status: 'draft' },
      }),
      modules: serverModules,
      authorizedPersonId: PERSON_ID,
      response: matched,
    })).toEqual({ kind: 'unavailable', reason: 'unpublished' });

    expect(resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary(),
      modules: serverModules,
      authorizedPersonId: 'someone-else',
      response: { ...matched, personId: 'someone-else' },
    })).toEqual({ kind: 'unavailable', reason: 'wrong-person' });

    expect(resolveMemberBlueprintBinding({
      programSlug: 'digestive-foundations',
      summary: summary(),
      modules: serverModules,
      authorizedPersonId: PERSON_ID,
      response: { ...matched, routeSlug: 'digestive-foundations' },
    })).toEqual({ kind: 'unavailable', reason: 'identity-mismatch' });
  });

  it('rejects a late response from another version instead of mixing lessons', () => {
    expect(resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary(),
      modules: serverModules,
      authorizedPersonId: PERSON_ID,
      response: {
        routeSlug: 'baseline',
        personId: PERSON_ID,
        versionId: PROTECTED_BASELINE_V1.versionId,
      },
    })).toEqual({ kind: 'unavailable', reason: 'stale-response' });
  });

  it('limits pre-start delivery to Day 0', () => {
    const binding = resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary({
        resolved_status: 'pre_start',
        current_day: 0,
        enrollment: { status: 'pre_start' },
      }),
      modules: serverModules,
      authorizedPersonId: PERSON_ID,
      requestedDay: 14,
      response: {
        routeSlug: 'baseline',
        personId: PERSON_ID,
        versionId: MEMBER_VERSION_ID,
      },
    });

    expect(binding.kind).toBe('published-blueprint');
    if (binding.kind !== 'published-blueprint') return;
    expect(binding.modules.every((module) => (module.dayStart ?? 0) === 0)).toBe(true);
    expect(binding.dayRail.filter((item) => item.day > 0).every((item) => !item.accessible)).toBe(true);
  });

  it('keeps the unrelated v2 draft on the legacy path even with the 50 module keys', () => {
    const binding = resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary({
        enrollment: { program_version_id: UNTOUCHED_BASELINE_DRAFT.versionId },
        version: {
          id: UNTOUCHED_BASELINE_DRAFT.versionId,
          version_key: UNTOUCHED_BASELINE_DRAFT.versionKey,
        },
      }),
      modules: serverModules,
      authorizedPersonId: PERSON_ID,
      response: {
        routeSlug: 'baseline',
        personId: PERSON_ID,
        versionId: UNTOUCHED_BASELINE_DRAFT.versionId,
      },
    });
    expect(binding).toEqual({ kind: 'legacy-member', reason: 'protected-version' });
  });

  it('does not authorize a fixed version key without the published module set', () => {
    const binding = resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary({
        version: {
          version_key: 'baseline-day-0-21-member-draft',
          metadata: {},
        },
      }),
      modules: [0, 3].map((day) => ({
        id: `server-day-${day}`,
        programSlug: 'baseline',
        moduleType: 'practice_card' as const,
        title: `Server day ${day}`,
        body: 'Unrelated module',
        dayStart: day,
        dayEnd: day,
        statusVisibility: ['active' as const],
      })),
      authorizedPersonId: PERSON_ID,
      response: {
        routeSlug: 'baseline',
        personId: PERSON_ID,
        versionId: MEMBER_VERSION_ID,
      },
    });
    expect(binding).toEqual({ kind: 'legacy-member', reason: 'slug-mismatch' });
  });

  it('fail-closes wrong-version and incomplete published modules', () => {
    const matched = {
      routeSlug: 'baseline',
      personId: PERSON_ID,
      versionId: MEMBER_VERSION_ID,
    };
    const foreign = trustedModules();
    foreign.push({
      id: 'baseline-v1-day-3-practice',
      programSlug: 'baseline',
      moduleType: 'practice_card',
      title: 'Wrong version',
      body: 'This module belongs to another version.',
      dayStart: 3,
      dayEnd: 3,
      statusVisibility: ['active'],
    });
    expect(resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary(),
      modules: foreign,
      authorizedPersonId: PERSON_ID,
      response: matched,
    })).toEqual({ kind: 'unavailable', reason: 'wrong-version-modules' });

    expect(resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary(),
      modules: trustedModules().slice(0, 10),
      authorizedPersonId: PERSON_ID,
      response: matched,
    })).toEqual({ kind: 'unavailable', reason: 'incomplete-content' });

    expect(resolveMemberBlueprintBinding({
      programSlug: 'baseline',
      summary: summary(),
      modules: [],
      authorizedPersonId: PERSON_ID,
      response: {
        routeSlug: 'baseline',
        personId: PERSON_ID,
        versionId: MEMBER_VERSION_ID,
      },
    })).toEqual({ kind: 'unavailable', reason: 'incomplete-content' });
  });

  it('keeps paused and completed enrollments readable on the published version', () => {
    for (const status of ['paused', 'completed'] as const) {
      const binding = resolveMemberBlueprintBinding({
        programSlug: 'baseline',
        summary: summary({
          resolved_status: status,
          enrollment: { status },
        }),
        modules: serverModules,
        authorizedPersonId: PERSON_ID,
        response: {
          routeSlug: 'baseline',
          personId: PERSON_ID,
          versionId: MEMBER_VERSION_ID,
        },
      });
      expect(binding.kind).toBe('published-blueprint');
    }
  });
});

describe('Baseline member draft import', () => {
  it('maps 50 modules and 22 day positions through the existing draft DTO', () => {
    const versionId = '30000000-0000-4000-8000-000000000099';
    const record = baselineMemberDraftVersionRecord();
    const payloads = toBaselineMemberDraftImportPayloads(versionId);

    expect(record).not.toHaveProperty('versionKey');
    expect(record.status).toBe('draft');
    expect(GENERATED_PROGRAM_VERSION_KEY.test(GENERATED_VERSION_KEY)).toBe(true);
    expect(GENERATED_PROGRAM_VERSION_KEY.test('baseline-day-0-21-member-draft')).toBe(false);
    expect(BASELINE_MEMBER_MODULE_KEYS).toEqual(
      BASELINE_DAY_0_TO_21_BLUEPRINT.modules.map((module) => module.id),
    );
    const publication = assessBaselineMemberPublication();
    expect(publication.draftApiAccepts).toEqual([
      'source_version_id',
      'version_label',
      'duration_days',
    ]);
    expect(publication.gaps).toEqual([]);
    expect(publication.checkinSourceVersionId).toBe(PROTECTED_BASELINE_V1.versionId);
    expect(publication.metadataWriter).toBe('saveProgramBlueprintMetadataForDraft');
    expect(publication.checkInDays).toEqual([7, 14, 21]);
    expect(payloads.every((payload) => (
      payload.day_end == null || payload.day_end <= publication.durationDays
    ))).toBe(true);
    expect(record.metadata[PROGRAM_BLUEPRINT_METADATA_KEY].days).toHaveLength(22);
    expect(payloads).toHaveLength(50);
    expect(payloads).toHaveLength(BASELINE_DAY_0_TO_21_BLUEPRINT.modules.length);
    expect(payloads.every((payload) => payload.status === 'draft')).toBe(true);
    expect(payloads.every((payload) => payload.program_version_id === versionId)).toBe(true);
    expect(payloads.map((payload) => ProgramDeliveryModuleCreateSchema.safeParse(payload).success))
      .toEqual(payloads.map(() => true));
    expect(toBaselineMemberDraftImportPayloads.bind(null, PROTECTED_BASELINE_V1.versionId))
      .toThrow(/protected Baseline version/);
    expect(toBaselineMemberDraftImportPayloads.bind(null, UNTOUCHED_BASELINE_DRAFT.versionId))
      .toThrow(/protected Baseline version/);
  });
});
