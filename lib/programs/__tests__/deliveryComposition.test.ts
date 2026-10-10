jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  ProgramDeliveryModuleCreateSchema,
  reorderDeliveryModules,
  updateDeliveryModule,
} from '../deliveryModuleAdminServerService';
import {
  DELIVERY_COMPOSITION_CONTRACT,
  PROGRAM_PREVIEW_TEST_AUDIO_PATH,
  authoredModuleOrder,
  buildCompositionSavePayload,
  checkinPromptWithoutTemplate,
  composedPreviewBindings,
  compositionIssues,
  definitionFromCompositionPayload,
  evaluateCompositionWrite,
  heroForViewedDay,
  mediaForViewedDay,
  mergeDeliveryMetadata,
  overlayEditedDefinition,
  selectPreviewCheckinTemplate,
  shouldPreserveAuthoredOrder,
  versionBelongsToProgram,
  withLocalPreviewCheckin,
} from '../deliveryComposition';
import {
  isDeliveryModuleVisible,
  type ProgramDeliveryModuleDefinition,
} from '../deliveryModuleTypes';
import type { ProgramRuntimeSummary } from '../runtimeTypes';

const HARBOR_VERSION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM_VERSION_ID = '22222222-2222-4222-8222-222222222222';

const legacyPublishedPayload = {
  module_key: 'baseline-week-1-focus',
  module_type: 'week',
  title: 'Week 1 focus',
  eyebrow: 'Week 1',
  body: 'A safe delivery module body.',
  day_start: 1,
  day_end: 7,
  status: 'published',
  capacity_variants_json: {},
  cta_json: {},
  anchor_json: {},
  metadata: {},
};

function summary(
  status: ProgramRuntimeSummary['resolved_status'],
  currentDay: number,
): ProgramRuntimeSummary {
  return {
    enrollment: {
      current_capacity: 'steady',
    } as ProgramRuntimeSummary['enrollment'],
    version: {} as ProgramRuntimeSummary['version'],
    program: {
      id: 'program-1',
      slug: 'harbor-reset',
      title: 'Harbor Reset',
      tagline: null,
      description: null,
      storefront_href: null,
    },
    resolved_status: status,
    current_day: currentDay,
    timezone: 'UTC',
    next_checkin_template: null,
    latest_checkin_response: null,
    latest_recommendation: null,
    resolved_at: '2026-10-07T00:00:00.000Z',
  };
}

function moduleDef(
  overrides: Partial<ProgramDeliveryModuleDefinition> &
    Pick<ProgramDeliveryModuleDefinition, 'id' | 'moduleType'>,
): ProgramDeliveryModuleDefinition {
  return {
    programSlug: 'harbor-reset',
    title: overrides.id,
    body: 'Body',
    statusVisibility: ['not_started', 'pre_start', 'active'],
    ...overrides,
  };
}

function harborPayload(input: {
  key: string;
  moduleType: 'prep' | 'guide' | 'checkin_prompt';
  title: string;
  dayStart: number;
  dayEnd: number;
  mediaUrl?: string;
  groupId: string;
}) {
  return buildCompositionSavePayload({
    moduleKey: input.key,
    moduleType: input.moduleType,
    title: input.title,
    eyebrow: '',
    body: `${input.title} body`,
    dayStart: input.dayStart,
    dayEnd: input.dayEnd,
    status: 'published',
    programVersionId: HARBOR_VERSION_ID,
    displayOrder: null,
    compositionEnabled: true,
    mediaBlocks: input.mediaUrl
      ? [
          {
            id: `${input.key}-video`,
            type: 'video',
            url: input.mediaUrl,
            title: input.title,
            description: '',
          },
        ]
      : [],
    heroTitle: '',
    heroEyebrow: '',
    heroImageUrl: '',
    metadata: { groupId: input.groupId, legacyNote: 'keep-me' },
    capacityVariants: {},
    cta: {},
    anchor: {},
  }).payload;
}

describe('delivery composition authoring', () => {
  test('accepts a legacy published payload with no composition contract', () => {
    expect(
      ProgramDeliveryModuleCreateSchema.safeParse(legacyPublishedPayload).success,
    ).toBe(true);
    expect(
      compositionIssues({
        metadata: {},
        programVersionId: null,
        status: 'published',
        dayStart: 1,
        dayEnd: 7,
      }),
    ).toEqual([]);
  });

  test('rejects composition without a version, a published composition, a bad media URL, and the test audio file', () => {
    const contract = {
      composition: { contract: 'programs-delivery-composition-v1' },
    };
    expect(
      ProgramDeliveryModuleCreateSchema.safeParse({
        ...legacyPublishedPayload,
        module_key: 'harbor-day-4',
        status: 'draft',
        metadata: contract,
      }).success,
    ).toBe(false);
    expect(
      ProgramDeliveryModuleCreateSchema.safeParse({
        ...legacyPublishedPayload,
        module_key: 'harbor-day-4',
        program_version_id: HARBOR_VERSION_ID,
        metadata: contract,
      }).success,
    ).toBe(false);
    expect(
      compositionIssues({
        metadata: {
          ...contract,
          blocks: [
            {
              type: 'video',
              id: 'day-4',
              url: 'javascript:alert(1)',
              title: 'Day 4',
            },
          ],
        },
        programVersionId: HARBOR_VERSION_ID,
        status: 'draft',
        dayStart: 4,
        dayEnd: 4,
      }).join(' '),
    ).toMatch(/site path or https URL/);
    expect(
      compositionIssues({
        metadata: {
          ...contract,
          blocks: [
            {
              type: 'audio',
              id: 'day-0',
              url: PROGRAM_PREVIEW_TEST_AUDIO_PATH,
              title: 'Intro',
            },
          ],
        },
        programVersionId: HARBOR_VERSION_ID,
        status: 'draft',
        dayStart: 0,
        dayEnd: 0,
      }).join(' '),
    ).toMatch(/cannot be saved as authored program media/);
  });

  test('rejects a version that belongs to another program', () => {
    expect(
      versionBelongsToProgram({
        programId: 'program-harbor',
        version: {
          id: OTHER_PROGRAM_VERSION_ID,
          program_id: 'program-other',
        },
      }).ok,
    ).toBe(false);
    expect(
      versionBelongsToProgram({
        programId: 'program-harbor',
        version: { id: HARBOR_VERSION_ID, program_id: 'program-harbor' },
      }).ok,
    ).toBe(true);
  });

  test('preserves unrelated metadata and refuses to attach or re-version published legacy rows', () => {
    expect(
      mergeDeliveryMetadata(
        { legacyNote: 'keep-me', blocks: [] },
        { composition: { contract: 'programs-delivery-composition-v1' } },
      ).legacyNote,
    ).toBe('keep-me');
    expect(
      evaluateCompositionWrite({
        existingStatus: 'published',
        existingVersionId: null,
        existingMetadata: { legacyNote: 'keep-me' },
        nextStatus: 'published',
        nextVersionId: null,
        nextMetadata: {
          legacyNote: 'keep-me',
          composition: { contract: 'programs-delivery-composition-v1' },
        },
      }).ok,
    ).toBe(false);
    expect(
      evaluateCompositionWrite({
        existingStatus: 'published',
        existingVersionId: null,
        existingMetadata: {},
        nextStatus: 'published',
        nextVersionId: HARBOR_VERSION_ID,
        nextMetadata: {},
      }).ok,
    ).toBe(false);
  });

  test('keeps interleaved authored order instead of pulling a later shared group forward', () => {
    const modules = [
      moduleDef({
        id: 'prep-a',
        moduleType: 'prep',
        groupId: 'g1',
        composition: { contract: 'programs-delivery-composition-v1' },
      }),
      moduleDef({
        id: 'guide-b',
        moduleType: 'guide',
        groupId: 'g2',
        composition: { contract: 'programs-delivery-composition-v1' },
      }),
      moduleDef({
        id: 'prep-c',
        moduleType: 'prep',
        groupId: 'g1',
        composition: { contract: 'programs-delivery-composition-v1' },
      }),
    ];
    expect(shouldPreserveAuthoredOrder(modules)).toBe(true);
    expect(authoredModuleOrder(modules).map((module) => module.id)).toEqual([
      'prep-a',
      'guide-b',
      'prep-c',
    ]);
  });

  test('shows a day 0 range before enrollment and during future start, and still hides a paused week', () => {
    const dayZero = moduleDef({
      id: 'harbor-setup',
      moduleType: 'prep',
      dayStart: 0,
      dayEnd: 0,
      title: 'Harbor setup',
    });
    expect(
      isDeliveryModuleVisible(dayZero, {
        runtimeSummary: null,
        viewedDay: 0,
      }),
    ).toBe(true);
    expect(
      isDeliveryModuleVisible(dayZero, {
        runtimeSummary: summary('pre_start', 0),
        viewedDay: 0,
      }),
    ).toBe(true);
    expect(
      isDeliveryModuleVisible(
        moduleDef({
          id: 'harbor-week',
          moduleType: 'week',
          dayStart: 1,
          dayEnd: 7,
          statusVisibility: ['active'],
        }),
        { runtimeSummary: summary('paused', 3), viewedDay: 3 },
      ),
    ).toBe(false);
  });

  test('uses the viewed day media for a second program and does not fall back to test audio', () => {
    const payloads = [
      harborPayload({
        key: 'harbor-setup',
        moduleType: 'prep',
        title: 'Harbor setup',
        dayStart: 0,
        dayEnd: 0,
        groupId: 'g1',
      }),
      harborPayload({
        key: 'harbor-day-4',
        moduleType: 'guide',
        title: 'Harbor day 4',
        dayStart: 4,
        dayEnd: 4,
        groupId: 'g2',
        mediaUrl: 'https://media.example.com/harbor-day-4.mp4',
      }),
      harborPayload({
        key: 'harbor-day-7',
        moduleType: 'checkin_prompt',
        title: 'Harbor day 7 check-in',
        dayStart: 7,
        dayEnd: 7,
        groupId: 'g1',
      }),
    ];
    const modules = payloads.map(
      (payload) =>
        definitionFromCompositionPayload({
          programSlug: 'harbor-reset',
          payload,
        }).definition,
    );
    expect(modules.map((module) => module.moduleType)).toEqual([
      'prep',
      'guide',
      'checkin_prompt',
    ]);
    expect(modules.every((module) => module.programSlug === 'harbor-reset')).toBe(
      true,
    );
    expect(payloads.every((payload) => payload.status === 'draft')).toBe(true);
    expect(mediaForViewedDay(modules, 4)?.url).toBe(
      'https://media.example.com/harbor-day-4.mp4',
    );
    expect(mediaForViewedDay(modules, 0)?.url).not.toBe(
      PROGRAM_PREVIEW_TEST_AUDIO_PATH,
    );
    expect(mediaForViewedDay(modules, 0)).toBeNull();
    const bindings = composedPreviewBindings('unsaved');
    expect(bindings.previewMode).toBe(true);
    expect(bindings).not.toHaveProperty('networkWrites');
    expect(bindings.suppressDayCompletion).toBe(true);
    expect(bindings.compositionSource).toBe('unsaved');
  });

  test('keeps media in place, clears removed media, and drops a cleared hero', () => {
    const saved = buildCompositionSavePayload({
      moduleKey: 'harbor-day-4',
      moduleType: 'guide',
      title: 'Harbor day 4',
      eyebrow: '',
      body: 'Body',
      dayStart: 4,
      dayEnd: 4,
      status: 'draft',
      programVersionId: HARBOR_VERSION_ID,
      displayOrder: 1,
      compositionEnabled: true,
      mediaBlocks: [
        {
          id: 'keep-audio',
          type: 'audio',
          url: 'https://media.example.com/a.mp3',
          title: 'Keep',
          description: '',
        },
        {
          id: 'gone',
          type: '',
          url: 'https://media.example.com/stale.mp4',
          title: 'Gone',
          description: '',
        },
      ],
      heroTitle: '',
      heroEyebrow: '',
      heroImageUrl: '',
      metadata: {
        legacyNote: 'keep-me',
        hero: { title: 'Old hero' },
        blocks: [
          { type: 'list', items: ['Keep this list'] },
          {
            type: 'audio',
            id: 'keep-audio',
            url: 'https://media.example.com/a.mp3',
            title: 'Keep',
          },
          { type: 'notice', title: 'Note', body: 'Stay' },
          {
            type: 'video',
            id: 'gone',
            url: 'https://media.example.com/stale.mp4',
            title: 'Gone',
          },
        ],
      },
      capacityVariants: { low: { title: 'Low', body: 'Small' } },
      cta: { label: 'Open', anchorKey: 'checkin' },
      anchor: { anchorId: 'day-4' },
    });
    expect(saved.issues).toEqual([]);
    const metadata = saved.payload.metadata as {
      blocks: Array<{ type: string; id?: string }>;
      hero?: unknown;
      legacyNote?: string;
    };
    expect(metadata.blocks.map((block) => block.type)).toEqual([
      'list',
      'audio',
      'notice',
    ]);
    expect(metadata.blocks[1]?.id).toBe('keep-audio');
    expect(metadata.hero).toBeUndefined();
    expect(metadata.legacyNote).toBe('keep-me');
    expect(saved.payload.capacity_variants_json).toEqual({
      low: { title: 'Low', body: 'Small' },
    });
    expect(saved.payload.cta_json).toEqual({
      label: 'Open',
      anchorKey: 'checkin',
    });
  });

  test('reports invalid composition blocks and days outside the selected version', () => {
    const contract = {
      composition: { contract: DELIVERY_COMPOSITION_CONTRACT },
    };
    expect(
      compositionIssues({
        metadata: { ...contract, blocks: [{ type: 'list' }] },
        programVersionId: HARBOR_VERSION_ID,
        status: 'draft',
        dayStart: 1,
        dayEnd: 1,
      }).join(' '),
    ).toMatch(/items array/);
    expect(
      compositionIssues({
        metadata: { ...contract, blocks: [{ type: 'unknown-widget' }] },
        programVersionId: HARBOR_VERSION_ID,
        status: 'draft',
        dayStart: 1,
        dayEnd: 1,
      }).join(' '),
    ).toMatch(/Unsupported composition block type/);
    expect(
      compositionIssues({
        metadata: contract,
        programVersionId: HARBOR_VERSION_ID,
        status: 'draft',
        dayStart: 30,
        dayEnd: 30,
        durationDays: 21,
      }).join(' '),
    ).toMatch(/selected version duration/);
  });

  test('preserves authored delivery fields and does not let a hidden composition row change the viewed day', () => {
    const mapped = definitionFromCompositionPayload({
      programSlug: 'harbor-reset',
      payload: {
        module_key: 'harbor-day-4',
        module_type: 'guide',
        title: 'Day 4',
        body: 'Body',
        day_start: 4,
        day_end: 4,
        status_visibility: ['active', 'paused'],
        capacity_variants_json: { low: { title: 'Low', body: 'Small' } },
        cta_json: { label: 'Open', anchorKey: 'checkin' },
        anchor_json: { anchorId: 'day-4' },
        safety_notes: ['Stay in scope'],
        metadata: {
          composition: { contract: DELIVERY_COMPOSITION_CONTRACT },
          showWhen: 'checkin_due',
          groupId: 'g2',
          statusCopy: { active: { title: 'Active title', body: 'Active body' } },
        },
      },
    });
    expect(mapped.definition.statusVisibility).toEqual(['active', 'paused']);
    expect(mapped.definition.showWhen).toBe('checkin_due');
    expect(mapped.definition.capacityVariants?.low?.title).toBe('Low');
    expect(mapped.definition.cta?.anchorKey).toBe('checkin');
    expect(mapped.definition.anchorId).toBe('day-4');
    expect(mapped.definition.safetyNotes).toEqual(['Stay in scope']);
    expect(mapped.definition.statusCopy?.active?.title).toBe('Active title');
    expect(mapped.definition.composition?.contract).toBe(
      DELIVERY_COMPOSITION_CONTRACT,
    );
    const hidden = moduleDef({
      id: 'future',
      moduleType: 'guide',
      dayStart: 10,
      dayEnd: 10,
      statusVisibility: ['active'],
      blocks: [
        {
          type: 'audio',
          id: 'future-audio',
          url: 'https://media.example.com/future.mp3',
          title: 'Future',
        },
      ],
      composition: {
        contract: DELIVERY_COMPOSITION_CONTRACT,
        hero: { eyebrow: 'Later', title: 'Future hero' },
      },
    });
    const ctx = { runtimeSummary: summary('active', 4), viewedDay: 4 };
    expect(shouldPreserveAuthoredOrder([hidden], ctx)).toBe(false);
    expect(mediaForViewedDay([hidden], 4, ctx)).toBeNull();
    expect(heroForViewedDay([hidden], 4, ctx)?.title).toBeUndefined();
    const overlaid = overlayEditedDefinition(
      [moduleDef({ id: 'keep', moduleType: 'prep', title: 'Keep' }), hidden],
      { ...hidden, title: 'Edited future' },
    );
    expect(overlaid.map((module) => module.title)).toEqual([
      'Keep',
      'Edited future',
    ]);
  });

  test('selects the template for the viewed day and records a local check-in without fetch', () => {
    const templates = [
      {
        program_version_id: HARBOR_VERSION_ID,
        checkin_day: 7,
        status: 'published',
        title: 'Day 7',
      },
      {
        program_version_id: HARBOR_VERSION_ID,
        checkin_day: 4,
        status: 'published',
        title: 'Day 4 energy',
      },
    ];
    expect(
      selectPreviewCheckinTemplate(templates, HARBOR_VERSION_ID, 4)?.title,
    ).toBe('Day 4 energy');
    expect(selectPreviewCheckinTemplate(templates, HARBOR_VERSION_ID, 5)).toBe(
      null,
    );
    const prompt = moduleDef({
      id: 'checkin',
      moduleType: 'checkin_prompt',
      dayStart: 5,
      dayEnd: 5,
    });
    expect(checkinPromptWithoutTemplate([prompt], 5, null)).toBe(true);
    const fetchSpy = jest.spyOn(global, 'fetch');
    const current = summary('active', 4);
    const next = withLocalPreviewCheckin(current, {
      ...current,
      latest_checkin_response: {
        id: 'local',
        enrollment_id: 'preview-enrollment',
        checkin_template_id: 'template-4',
        checkin_day: 4,
        response_status: 'skipped',
        response_payload_json: {},
        skipped_reason: 'Preview skipped response. No runtime data was written.',
        responded_at: null,
        skipped_at: '2026-10-08T00:00:00.000Z',
        input_snapshot_json: { preview: true },
        computed_metrics_snapshot_json: { preview: true },
        metadata: { preview: true },
        created_at: '2026-10-08T00:00:00.000Z',
        updated_at: '2026-10-08T00:00:00.000Z',
      },
    });
    expect(next.current_day).toBe(4);
    expect(next.latest_checkin_response?.response_status).toBe('skipped');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('delivery composition update service', () => {
  const moduleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  function existingRow() {
    return {
      id: moduleId,
      program_id: 'program-harbor',
      program_version_id: HARBOR_VERSION_ID,
      module_key: 'harbor-day-4',
      module_type: 'guide',
      title: 'Harbor day 4',
      eyebrow: null,
      body: 'Body',
      day_start: 4,
      day_end: 4,
      status_visibility: ['active'],
      capacity_variants_json: {},
      cta_json: {},
      anchor_json: {},
      display_order: 1,
      status: 'draft',
      safety_notes: [],
      no_claims_notes: [],
      metadata: {
        composition: { contract: DELIVERY_COMPOSITION_CONTRACT },
        legacyNote: 'keep-me',
      },
      created_at: '2026-10-08T00:00:00.000Z',
      updated_at: '2026-10-08T00:00:00.000Z',
    };
  }

  function mockRead(data: unknown) {
    const update = jest.fn();
    (supabaseAdmin.from as jest.Mock).mockImplementation(() => {
      const query: Record<string, jest.Mock> = {};
      const chain = () => query;
      for (const method of ['select', 'eq', 'order', 'limit', 'is']) {
        query[method] = jest.fn(chain);
      }
      query.update = jest.fn(() => {
        update();
        return query;
      });
      query.maybeSingle = jest.fn(async () => ({ data, error: null }));
      query.single = jest.fn(async () => ({ data, error: null }));
      return query;
    });
    return update;
  }

  test('rejects marker removal, publishing, and version clearing before any update', async () => {
    const update = mockRead(existingRow());
    await expect(
      updateDeliveryModule(moduleId, { metadata: { composition: null } }),
    ).rejects.toThrow(/Removing or replacing/);
    await expect(
      updateDeliveryModule(moduleId, { status: 'published' }),
    ).rejects.toThrow(/remain drafts/);
    await expect(
      updateDeliveryModule(moduleId, { program_version_id: null }),
    ).rejects.toThrow(/cannot change program version/);
    expect(update).not.toHaveBeenCalled();
  });

  test('rejects a reorder that includes another version before any display_order write', async () => {
    const update = jest.fn();
    (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
      const query: Record<string, jest.Mock> = {};
      const chain = () => query;
      for (const method of ['select', 'eq', 'order', 'limit', 'is']) {
        query[method] = jest.fn(chain);
      }
      query.update = jest.fn(() => {
        update();
        return query;
      });
      query.maybeSingle = jest.fn(async () => ({
        data:
          table === 'program_versions'
            ? {
                id: HARBOR_VERSION_ID,
                program_id: 'program-harbor',
                duration_days: 21,
              }
            : null,
        error: null,
      }));
      query.then = jest.fn((resolve, reject) =>
        Promise.resolve({
          data: [
            { id: moduleId, program_version_id: HARBOR_VERSION_ID },
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              program_version_id: OTHER_PROGRAM_VERSION_ID,
            },
          ],
          error: null,
        }).then(resolve, reject),
      );
      return query;
    });
    await expect(
      reorderDeliveryModules(
        'program-harbor',
        [moduleId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
        HARBOR_VERSION_ID,
      ),
    ).rejects.toThrow(/another program version/);
    expect(update).not.toHaveBeenCalled();
  });
});
