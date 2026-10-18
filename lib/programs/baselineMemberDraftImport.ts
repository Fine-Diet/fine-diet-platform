/**
 * Source-only mapping for a new Baseline member draft.
 *
 * This file prepares version metadata and draft module payloads. It does not
 * insert, publish, or alter Baseline v1 or the unrelated v2 draft. Importing
 * the server client keeps the authoring candidate off the member browser graph.
 */
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from './baselineDay0To21Candidate';
import {
  PROGRAM_BLUEPRINT_METADATA_KEY,
  toProgramBlueprintVersionFields,
} from './programBlueprint';
import { toProgramDeliveryModulePayloads } from './programBlueprintStorage';
import {
  BASELINE_MEMBER_DRAFT_VERSION_LABEL,
  PROTECTED_BASELINE_V1,
  UNTOUCHED_BASELINE_DRAFT,
} from './baselineMemberBinding';
import { BASELINE_MEMBER_MODULE_KEYS, GENERATED_PROGRAM_VERSION_KEY } from './baselineMemberModuleIdentity';
import { isEligiblePublishedDeliveryModule } from './programDayInteractionServerService';
import type { ProgramRuntimeSummary } from './runtimeTypes';

void supabaseAdmin;

const PROTECTED_VERSION_IDS = new Set<string>([
  PROTECTED_BASELINE_V1.versionId,
  UNTOUCHED_BASELINE_DRAFT.versionId,
]);

export function baselineMemberDraftVersionRecord() {
  return {
    versionLabel: BASELINE_MEMBER_DRAFT_VERSION_LABEL,
    durationDays: BASELINE_DAY_0_TO_21_BLUEPRINT.version.durationDays,
    status: 'draft' as const,
    metadata: {
      [PROGRAM_BLUEPRINT_METADATA_KEY]: toProgramBlueprintVersionFields(
        BASELINE_DAY_0_TO_21_BLUEPRINT,
      ),
    },
  };
}

export const BASELINE_MEMBER_CHECKIN_DAYS = [7, 14, 21] as const;

export interface BaselineSourceCheckin {
  program_version_id: string;
  checkin_day: number;
  title: string;
  description: string | null;
  prompt_md: string | null;
  questions_json: unknown[];
  status: string;
  metadata: Record<string, unknown>;
}

export interface BaselineClonedCheckin {
  program_version_id: string;
  checkin_day: number;
  title: string;
  description: string | null;
  prompt_md: string | null;
  questions_json: unknown[];
  status: 'draft' | 'published';
  metadata: Record<string, unknown>;
}

export function baselineMemberDraftCloneInput(programId: string) {
  return {
    programId,
    sourceVersionId: PROTECTED_BASELINE_V1.versionId,
    versionLabel: BASELINE_MEMBER_DRAFT_VERSION_LABEL,
    durationDays: BASELINE_DAY_0_TO_21_BLUEPRINT.version.durationDays,
  };
}

export function clonePublishedBaselineCheckinsForDraft(input: {
  sourceVersionId: string;
  draftVersionId: string;
  sourceTemplates: readonly BaselineSourceCheckin[];
}): BaselineClonedCheckin[] {
  if (input.sourceVersionId !== PROTECTED_BASELINE_V1.versionId) {
    throw new Error('Baseline member check-ins can only be cloned from published Baseline v1.');
  }
  if (PROTECTED_VERSION_IDS.has(input.draftVersionId)) {
    throw new Error('Refusing to clone check-ins onto a protected Baseline version.');
  }
  return BASELINE_MEMBER_CHECKIN_DAYS.map((day) => {
    const source = input.sourceTemplates.find((template) =>
      template.program_version_id === input.sourceVersionId
      && template.status === 'published'
      && template.checkin_day === day,
    );
    if (!source || source.questions_json.length === 0) {
      throw new Error(`Published Baseline v1 is missing the Day ${day} check-in template.`);
    }
    return {
      program_version_id: input.draftVersionId,
      checkin_day: source.checkin_day,
      title: source.title,
      description: source.description,
      prompt_md: source.prompt_md,
      questions_json: JSON.parse(JSON.stringify(source.questions_json)) as unknown[],
      status: 'draft',
      metadata: { ...source.metadata },
    };
  });
}

export function assessBaselineMemberPublication() {
  return {
    generatedVersionKeyPattern: GENERATED_PROGRAM_VERSION_KEY.source,
    draftApiAccepts: ['source_version_id', 'version_label', 'duration_days'] as const,
    metadataWriter: 'saveProgramBlueprintMetadataForDraft' as const,
    checkinSourceVersionId: PROTECTED_BASELINE_V1.versionId,
    durationDays: BASELINE_DAY_0_TO_21_BLUEPRINT.version.durationDays,
    moduleCount: BASELINE_DAY_0_TO_21_BLUEPRINT.modules.length,
    checkInDays: [...BASELINE_MEMBER_CHECKIN_DAYS],
    gaps: [] as const,
  };
}

export function validateBaselinePublicationContract(input: {
  stage: 'draft' | 'published';
  programId: string;
  versionId: string;
  versionKey: string;
  durationDays: number | null;
  metadata: Record<string, unknown> | null;
  modules: ReturnType<typeof toBaselineMemberDraftImportPayloads>;
  checkins: readonly BaselineClonedCheckin[];
  sourceCheckins: readonly BaselineSourceCheckin[];
}): string[] {
  const issues: string[] = [];
  const expectedStatus = input.stage;
  if (PROTECTED_VERSION_IDS.has(input.versionId)) {
    issues.push('protected-version');
  }
  if (!GENERATED_PROGRAM_VERSION_KEY.test(input.versionKey)) {
    issues.push('version-key');
  }
  if (input.durationDays !== 21) issues.push('duration');
  if (input.modules.length !== 50) issues.push('module-count');
  if (new Set(input.modules.map((module) => module.module_key)).size !== input.modules.length) {
    issues.push('module-keys');
  }
  if (input.modules.some((module) => module.program_version_id !== input.versionId)) {
    issues.push('module-version');
  }
  if (input.modules.some((module) => module.status !== expectedStatus)) {
    issues.push('module-lifecycle');
  }
  const keys = input.modules.map((module) => module.module_key);
  if (keys.join('|') !== BASELINE_MEMBER_MODULE_KEYS.join('|')) issues.push('module-identity');
  for (let day = 0; day <= 21; day += 1) {
    const covered = input.modules.some((module) =>
      typeof module.day_start === 'number'
      && typeof module.day_end === 'number'
      && module.day_start <= day
      && module.day_end >= day,
    );
    if (!covered) issues.push(`day-coverage-${day}`);
  }
  const dayZero = input.modules.filter((module) => module.module_key.startsWith('baseline-candidate-day-0-'));
  if (dayZero.length !== 5 || dayZero.some((module) =>
    module.day_start !== 0
    || module.day_end !== 0
    || !module.status_visibility.includes('pre_start')
    || !module.status_visibility.includes('active')
  )) {
    issues.push('day-zero-scope');
  }
  const requiredGuides = input.modules.filter((module) =>
    module.module_type === 'guide' && module.metadata.completionRequired === true,
  );
  if (requiredGuides.length !== 21) issues.push('required-observations');
  const blueprint = input.metadata?.[PROGRAM_BLUEPRINT_METADATA_KEY];
  if (!blueprint) {
    issues.push('blueprint-metadata');
  } else {
    try {
      const fields = toProgramBlueprintVersionFields(BASELINE_DAY_0_TO_21_BLUEPRINT);
      if (JSON.stringify(blueprint) !== JSON.stringify(fields)) issues.push('blueprint-metadata');
      if (fields.days.length !== 22) issues.push('day-positions');
    } catch {
      issues.push('blueprint-metadata');
    }
  }
  if (input.checkins.length !== 3) issues.push('checkin-count');
  for (const day of BASELINE_MEMBER_CHECKIN_DAYS) {
    const cloned = input.checkins.find((template) => template.checkin_day === day);
    const source = input.sourceCheckins.find((template) =>
      template.program_version_id === PROTECTED_BASELINE_V1.versionId
      && template.checkin_day === day
      && template.status === 'published',
    );
    if (!cloned || !source || cloned.program_version_id !== input.versionId || cloned.status !== expectedStatus) {
      issues.push(`checkin-${day}`);
      continue;
    }
    if (JSON.stringify(cloned.questions_json) !== JSON.stringify(source.questions_json)) {
      issues.push(`checkin-questions-${day}`);
    }
  }
  if (input.stage === 'published') {
    const summary = {
      version: { id: input.versionId, program_id: input.programId },
      resolved_status: 'pre_start',
    } as Pick<ProgramRuntimeSummary, 'version' | 'resolved_status'> as ProgramRuntimeSummary;
    const rows = input.modules.map((module) => ({
      module_key: module.module_key,
      metadata: module.metadata,
      program_id: input.programId,
      program_version_id: module.program_version_id,
      status: 'published',
      day_start: module.day_start,
      day_end: module.day_end,
      status_visibility: module.status_visibility,
    }));
    const dayZeroEligible = rows.some((row) => isEligiblePublishedDeliveryModule(row, summary, 0));
    const activeSummary = { ...summary, resolved_status: 'active' } as ProgramRuntimeSummary;
    const dayZeroActive = rows.some((row) => isEligiblePublishedDeliveryModule(row, activeSummary, 0));
    if (!dayZeroEligible || !dayZeroActive) issues.push('day-zero-completion-guard');
  }
  return issues;
}

export function toBaselineMemberDraftImportPayloads(programVersionId: string) {
  if (PROTECTED_VERSION_IDS.has(programVersionId)) {
    throw new Error('Refusing to map the member draft onto a protected Baseline version.');
  }
  const payloads = toProgramDeliveryModulePayloads(
    BASELINE_DAY_0_TO_21_BLUEPRINT,
    programVersionId,
  );
  if (payloads.some((payload) => payload.status !== 'draft')) {
    throw new Error('Member draft import payloads must stay drafts.');
  }
  if (payloads.some((payload) => payload.program_version_id !== programVersionId)) {
    throw new Error('Member draft import payloads must stay on the requested draft version.');
  }
  return payloads;
}
