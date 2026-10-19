import type { ProgramDeliveryModuleDefinition } from './deliveryModuleTypes';
import {
  assessBaselineMemberModules,
  memberAccessibleDay,
} from './baselineMemberDeliveryBoundary';
import { classifyPublishedBaselineModules } from './baselineMemberModuleIdentity';
import { filterMemberDeliveryModules } from './historicalReviewPolicy';
import {
  PROGRAM_BLUEPRINT_METADATA_KEY,
  parseProgramBlueprintVersionFields,
  type ProgramBlueprintRuntimeConfig,
} from './programBlueprint';
import { buildProgramDayRail } from './programDeliveryNavigation';
import type { ProgramRuntimeSummary } from './runtimeTypes';

/** Production Baseline v1 and the unclaimed draft stay out of this import. */
export const PROTECTED_BASELINE_V1 = {
  versionKey: 'baseline-v1',
  versionId: '71fdd834-8a79-4272-bb30-aaa0cf8ab2d7',
} as const;

export const UNTOUCHED_BASELINE_DRAFT = {
  versionKey: 'v2-c173d5fb',
  versionId: 'da600c6e-22b7-4e7a-a44e-b2b1daa2bbef',
} as const;

/** Label only. create_program_version_draft assigns the version key itself. */
export const BASELINE_MEMBER_DRAFT_VERSION_LABEL = 'Baseline — Day 0–21 member draft';

const PROTECTED_VERSION_IDS = new Set<string>([
  PROTECTED_BASELINE_V1.versionId,
  UNTOUCHED_BASELINE_DRAFT.versionId,
]);
const PROTECTED_VERSION_KEYS = new Set<string>([
  PROTECTED_BASELINE_V1.versionKey,
  UNTOUCHED_BASELINE_DRAFT.versionKey,
]);

export type MemberBlueprintLegacyReason =
  | 'missing-runtime'
  | 'protected-version'
  | 'slug-mismatch';

export type MemberBlueprintUnavailableReason =
  | 'wrong-person'
  | 'unpublished'
  | 'version-unpinned'
  | 'missing-blueprint-metadata'
  | 'metadata-invalid'
  | 'duration-mismatch'
  | 'identity-mismatch'
  | 'stale-response'
  | 'wrong-version-modules'
  | 'incomplete-content'
  | 'malformed-content';

export interface MemberBlueprintResponseIdentity {
  routeSlug: string;
  personId: string | null;
  versionId: string | null;
}

export interface MemberBlueprintBindingInput {
  programSlug: string;
  summary: ProgramRuntimeSummary | null;
  modules: readonly ProgramDeliveryModuleDefinition[];
  authorizedPersonId: string | null;
  /**
   * Identity of the response that produced `modules`. A mismatch is a stale
   * mix, not a signal to render another route's lessons.
   */
  response?: MemberBlueprintResponseIdentity | null;
  /** Client day queries are accepted only so tests can prove they are ignored. */
  requestedDay?: number | null;
}

export type MemberBlueprintBinding =
  | { kind: 'legacy-member'; reason: MemberBlueprintLegacyReason }
  | { kind: 'unavailable'; reason: MemberBlueprintUnavailableReason }
  | {
      kind: 'published-blueprint';
      versionId: string;
      versionKey: string;
      config: ProgramBlueprintRuntimeConfig;
      modules: ProgramDeliveryModuleDefinition[];
      dayRail: ReturnType<typeof buildProgramDayRail>;
    };

function isProtectedVersion(summary: ProgramRuntimeSummary): boolean {
  return PROTECTED_VERSION_IDS.has(summary.version.id)
    || PROTECTED_VERSION_KEYS.has(summary.version.version_key);
}

function claimsMemberBlueprint(summary: ProgramRuntimeSummary): boolean {
  return summary.version.metadata?.[PROGRAM_BLUEPRINT_METADATA_KEY] != null;
}

function responseIsStale(
  input: MemberBlueprintBindingInput,
  summary: ProgramRuntimeSummary,
): boolean {
  const response = input.response;
  if (!response) return input.modules.length > 0;
  const slug = input.programSlug.trim().toLowerCase();
  return response.routeSlug.trim().toLowerCase() !== slug
    || response.personId !== input.authorizedPersonId
    || response.versionId !== summary.version.id;
}

export function resolveMemberBlueprintBinding(
  input: MemberBlueprintBindingInput,
): MemberBlueprintBinding {
  const summary = input.summary;
  if (!summary || !input.authorizedPersonId) {
    return { kind: 'legacy-member', reason: 'missing-runtime' };
  }

  const slug = input.programSlug.trim().toLowerCase();
  const identity = classifyPublishedBaselineModules(input.modules);
  const claims = claimsMemberBlueprint(summary);
  const memberAttempt = identity === 'exact'
    || identity === 'incomplete'
    || identity === 'foreign'
    || claims;
  const protectedVersion = isProtectedVersion(summary);

  if (responseIsStale(input, summary) && (memberAttempt || protectedVersion)) {
    return { kind: 'unavailable', reason: 'stale-response' };
  }

  if (summary.enrollment.person_id !== input.authorizedPersonId) {
    return { kind: 'unavailable', reason: 'wrong-person' };
  }

  const slugsAgree = slug === 'baseline'
    && summary.program.slug === 'baseline'
    && summary.enrollment.program_slug === 'baseline';

  if (!slugsAgree) {
    if (memberAttempt) return { kind: 'unavailable', reason: 'identity-mismatch' };
    return { kind: 'legacy-member', reason: 'slug-mismatch' };
  }

  if (protectedVersion) {
    return { kind: 'legacy-member', reason: 'protected-version' };
  }

  if (!memberAttempt) {
    return { kind: 'legacy-member', reason: 'slug-mismatch' };
  }

  if (summary.version.status !== 'published') {
    return { kind: 'unavailable', reason: 'unpublished' };
  }
  if (summary.enrollment.program_version_id !== summary.version.id) {
    return { kind: 'unavailable', reason: 'version-unpinned' };
  }

  const day = memberAccessibleDay({
    resolvedStatus: summary.resolved_status,
    currentDay: summary.current_day,
  });
  const assessment = assessBaselineMemberModules(input.modules, {
    status: summary.resolved_status,
    maximumAccessibleDay: day,
  });
  if (
    assessment === 'foreign'
    || (assessment === 'unrelated' && input.modules.length > 0)
  ) {
    return { kind: 'unavailable', reason: 'wrong-version-modules' };
  }
  if (assessment === 'malformed') {
    return { kind: 'unavailable', reason: 'malformed-content' };
  }
  if (assessment !== 'exact' && assessment !== 'authorized-subset') {
    return { kind: 'unavailable', reason: 'incomplete-content' };
  }

  const metadata = summary.version.metadata?.[PROGRAM_BLUEPRINT_METADATA_KEY];
  if (!metadata) {
    return { kind: 'unavailable', reason: 'missing-blueprint-metadata' };
  }
  let fields;
  try {
    fields = parseProgramBlueprintVersionFields(metadata);
  } catch {
    return { kind: 'unavailable', reason: 'metadata-invalid' };
  }
  const durationDays = summary.version.duration_days;
  if (durationDays == null || durationDays !== fields.days.length - 1) {
    return { kind: 'unavailable', reason: 'duration-mismatch' };
  }

  const modules = filterMemberDeliveryModules(input.modules, summary.resolved_status, day);
  const config: ProgramBlueprintRuntimeConfig = {
    programSlug: 'baseline',
    version: {
      key: summary.version.version_key,
      label: summary.version.version_label || BASELINE_MEMBER_DRAFT_VERSION_LABEL,
      durationDays,
    },
    presentation: fields.presentation,
    phases: fields.phases,
    interactions: fields.interactions,
  };

  return {
    kind: 'published-blueprint',
    versionId: summary.version.id,
    versionKey: summary.version.version_key,
    config,
    modules,
    dayRail: buildProgramDayRail({
      durationDays,
      runtimeStatus: summary.resolved_status,
      currentDay: day,
    }),
  };
}
