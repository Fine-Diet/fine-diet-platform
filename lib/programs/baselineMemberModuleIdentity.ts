import type {
  ProgramDeliveryModuleType,
  ProgramDeliveryStatusVisibility,
} from './deliveryModuleTypes';

/**
 * Trusted published identity for the 50-module Baseline member version.
 *
 * These keys and day bounds are the published module identity. They are not
 * the authored lesson bodies. Authorization uses this set plus the enrolled
 * version id. A version key, including keys generated as vN-xxxxxxxx, is not
 * an authorization input.
 */

const DAY_ZERO_VISIBILITY = ['pre_start', 'active'] as const satisfies readonly ProgramDeliveryStatusVisibility[];
const ACTIVE_VISIBILITY = ['active'] as const satisfies readonly ProgramDeliveryStatusVisibility[];

export interface BaselineMemberModuleBound {
  id: string;
  dayStart: number;
  dayEnd: number;
  moduleType: ProgramDeliveryModuleType;
  statusVisibility: readonly ProgramDeliveryStatusVisibility[];
}

const DAY_ZERO_MODULE_BOUNDS: readonly BaselineMemberModuleBound[] = [
  ['orientation', 'prep'],
  ['meal-map', 'prep'],
  ['create-meals', 'prep'],
  ['prepare-pantry', 'prep'],
  ['roadmap', 'roadmap'],
].map(([role, moduleType]) => ({
  id: `baseline-candidate-day-0-${role}`,
  dayStart: 0,
  dayEnd: 0,
  moduleType: moduleType as ProgramDeliveryModuleType,
  statusVisibility: DAY_ZERO_VISIBILITY,
}));

const WEEK_MODULE_BOUNDS: readonly BaselineMemberModuleBound[] = [1, 2, 3].map((week) => ({
  id: `baseline-candidate-week-${week}-context`,
  dayStart: (week - 1) * 7 + 1,
  dayEnd: week * 7,
  moduleType: 'week',
  statusVisibility: ACTIVE_VISIBILITY,
}));

const DAY_MODULE_BOUNDS: readonly BaselineMemberModuleBound[] = Array.from(
  { length: 21 },
  (_, index) => {
    const day = index + 1;
    return [
      {
        id: `baseline-candidate-day-${day}-practice`,
        dayStart: day,
        dayEnd: day,
        moduleType: 'practice_card' as const,
        statusVisibility: ACTIVE_VISIBILITY,
      },
      {
        id: `baseline-candidate-day-${day}-reflection`,
        dayStart: day,
        dayEnd: day,
        moduleType: 'guide' as const,
        statusVisibility: ACTIVE_VISIBILITY,
      },
    ];
  },
).flat();

export const BASELINE_MEMBER_MODULE_BOUNDS: readonly BaselineMemberModuleBound[] = [
  ...DAY_ZERO_MODULE_BOUNDS,
  ...WEEK_MODULE_BOUNDS,
  ...DAY_MODULE_BOUNDS,
];

export const BASELINE_MEMBER_MODULE_KEYS: readonly string[] =
  BASELINE_MEMBER_MODULE_BOUNDS.map((bound) => bound.id);

const BASELINE_MEMBER_MODULE_BOUND_BY_ID = new Map(
  BASELINE_MEMBER_MODULE_BOUNDS.map((bound) => [bound.id, bound]),
);

export function baselineMemberModuleBound(
  id: string,
): BaselineMemberModuleBound | undefined {
  return BASELINE_MEMBER_MODULE_BOUND_BY_ID.get(id);
}

/** Shape produced by create_program_version_draft. Not an allowlist. */
export const GENERATED_PROGRAM_VERSION_KEY = /^v[1-9]\d*-[0-9a-f]{8}$/;

export type PublishedBaselineModuleIdentity =
  | 'exact'
  | 'incomplete'
  | 'foreign'
  | 'unrelated';

export function classifyPublishedBaselineModules(
  modules: readonly { id: string }[],
): PublishedBaselineModuleIdentity {
  const expected = new Set(BASELINE_MEMBER_MODULE_KEYS);
  const ids = modules.map((module) => module.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) return 'foreign';

  let trusted = 0;
  let foreign = 0;
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (expected.has(id)) trusted += 1;
    else foreign += 1;
  }

  if (foreign > 0 && trusted > 0) return 'foreign';
  if (foreign > 0) return 'unrelated';
  if (trusted === 0) return 'unrelated';
  if (trusted === expected.size) return 'exact';
  return 'incomplete';
}
