jest.mock('@/lib/supabaseServerClient', () => ({ supabaseAdmin: {} }));

import { PROTECTED_BASELINE_V1, UNTOUCHED_BASELINE_DRAFT } from '../baselineMemberBinding';
import {
  baselineMemberDraftCloneInput,
  clonePublishedBaselineCheckinsForDraft,
  toBaselineMemberDraftImportPayloads,
  validateBaselinePublicationContract,
  type BaselineClonedCheckin,
  type BaselineSourceCheckin,
} from '../baselineMemberDraftImport';
import { mergeProgramBlueprintVersionMetadata, toProgramBlueprintVersionFields } from '../programBlueprint';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from '../baselineDay0To21Candidate';
import { hasSavedRequiredObservations } from '../programDayInteractionServerService';

const PROGRAM_ID = '10000000-0000-4000-8000-000000000010';
const DRAFT_ID = '30000000-0000-4000-8000-000000000033';
const VERSION_KEY = 'v3-a1b2c3d4';

function sourceCheckins(): BaselineSourceCheckin[] {
  return [7, 14, 21].map((day, index) => ({
    program_version_id: PROTECTED_BASELINE_V1.versionId,
    checkin_day: day,
    title: `Baseline day ${day} check-in`,
    description: null,
    prompt_md: `Published prompt ${day}`,
    questions_json: Array.from({ length: 12 + index }, (_, question) => ({
      id: `v1-day-${day}-q${question}`,
      source: 'baseline-v1',
    })),
    status: 'published',
    metadata: { clonedFrom: 'baseline-v1' },
  }));
}

function contractInput(overrides: {
  stage?: 'draft' | 'published';
  modules?: ReturnType<typeof toBaselineMemberDraftImportPayloads>;
  checkins?: BaselineClonedCheckin[];
  metadata?: Record<string, unknown> | null;
  versionKey?: string;
  versionId?: string;
} = {}) {
  const stage = overrides.stage ?? 'draft';
  const fields = toProgramBlueprintVersionFields(BASELINE_DAY_0_TO_21_BLUEPRINT);
  const modules = (overrides.modules ?? toBaselineMemberDraftImportPayloads(DRAFT_ID)).map((module) => ({
    ...module,
    status: stage,
  }));
  const checkins = (overrides.checkins ?? clonePublishedBaselineCheckinsForDraft({
    sourceVersionId: PROTECTED_BASELINE_V1.versionId,
    draftVersionId: DRAFT_ID,
    sourceTemplates: sourceCheckins(),
  })).map((template) => ({ ...template, status: stage }));
  return {
    stage,
    programId: PROGRAM_ID,
    versionId: overrides.versionId ?? DRAFT_ID,
    versionKey: overrides.versionKey ?? VERSION_KEY,
    durationDays: 21,
    metadata: overrides.metadata === undefined
      ? mergeProgramBlueprintVersionMetadata({ authoringNote: 'keep' }, fields)
      : overrides.metadata,
    modules,
    checkins,
    sourceCheckins: sourceCheckins(),
  };
}

describe('Baseline publication contract', () => {
  it('clones v1 check-ins onto a generated draft and validates publication', () => {
    const preservedV1 = { id: PROTECTED_BASELINE_V1.versionId, status: 'published', metadata: { source: 'v1' } };
    const preservedV2 = { id: UNTOUCHED_BASELINE_DRAFT.versionId, status: 'draft', metadata: { source: 'v2' } };
    const before = JSON.stringify({ preservedV1, preservedV2 });
    const request = baselineMemberDraftCloneInput(PROGRAM_ID);

    expect(request).toEqual({
      programId: PROGRAM_ID,
      sourceVersionId: PROTECTED_BASELINE_V1.versionId,
      versionLabel: 'Baseline — Day 0–21 member draft',
      durationDays: 21,
    });
    expect(request).not.toHaveProperty('versionKey');

    const cloned = clonePublishedBaselineCheckinsForDraft({
      sourceVersionId: request.sourceVersionId,
      draftVersionId: DRAFT_ID,
      sourceTemplates: sourceCheckins(),
    });
    cloned[0].questions_json.push({ id: 'local-edit' });
    expect(sourceCheckins()[0].questions_json).toHaveLength(12);
    expect(JSON.stringify({ preservedV1, preservedV2 })).toBe(before);

    expect(validateBaselinePublicationContract(contractInput())).toEqual([]);
    const published = validateBaselinePublicationContract(contractInput({ stage: 'published' }));
    expect(published).toEqual([]);

    const guides = toBaselineMemberDraftImportPayloads(DRAFT_ID)
      .filter((module) => module.metadata.completionRequired === true)
      .map((module) => module.module_key);
    expect(guides).toHaveLength(21);
    expect(hasSavedRequiredObservations(guides, [])).toBe(false);
    expect(hasSavedRequiredObservations(guides, guides.map((key) => ({
      content_key: key,
      response_text: 'saved',
    })))).toBe(true);
  });

  it('rejects a clone that does not come from published Baseline v1', () => {
    expect(() => clonePublishedBaselineCheckinsForDraft({
      sourceVersionId: UNTOUCHED_BASELINE_DRAFT.versionId,
      draftVersionId: DRAFT_ID,
      sourceTemplates: sourceCheckins(),
    })).toThrow(/published Baseline v1/);
    expect(() => clonePublishedBaselineCheckinsForDraft({
      sourceVersionId: PROTECTED_BASELINE_V1.versionId,
      draftVersionId: PROTECTED_BASELINE_V1.versionId,
      sourceTemplates: sourceCheckins(),
    })).toThrow(/protected Baseline version/);
    expect(() => clonePublishedBaselineCheckinsForDraft({
      sourceVersionId: PROTECTED_BASELINE_V1.versionId,
      draftVersionId: DRAFT_ID,
      sourceTemplates: sourceCheckins().filter((template) => template.checkin_day !== 21),
    })).toThrow(/Day 21/);
  });

  it('rejects an incomplete or mis-identified publication snapshot', () => {
    expect(validateBaselinePublicationContract(contractInput({
      versionKey: 'baseline-day-0-21-member-draft',
    }))).toContain('version-key');

    const modules = toBaselineMemberDraftImportPayloads(DRAFT_ID).map((module) => (
      module.module_key.startsWith('baseline-candidate-day-0-')
        ? { ...module, day_start: null, day_end: null }
        : module
    ));
    expect(validateBaselinePublicationContract(contractInput({ modules }))).toEqual(
      expect.arrayContaining(['day-zero-scope', 'day-coverage-0']),
    );

    const replaced = clonePublishedBaselineCheckinsForDraft({
      sourceVersionId: PROTECTED_BASELINE_V1.versionId,
      draftVersionId: DRAFT_ID,
      sourceTemplates: sourceCheckins(),
    });
    replaced[0] = { ...replaced[0], questions_json: [{ id: 'replacement-questionnaire' }] };
    expect(validateBaselinePublicationContract(contractInput({ checkins: replaced }))).toContain('checkin-questions-7');

    expect(validateBaselinePublicationContract(contractInput({
      metadata: { authoringNote: 'keep' },
    }))).toContain('blueprint-metadata');

    expect(validateBaselinePublicationContract(contractInput({
      versionId: UNTOUCHED_BASELINE_DRAFT.versionId,
    }))).toContain('protected-version');
  });
});
