import type {
  ProgramDeliveryModuleDefinition,
  ProgramDeliveryStatusVisibility,
} from './deliveryModuleTypes';
import {
  filterMemberDeliveryModules,
  memberMaximumAccessibleDay,
} from './historicalReviewPolicy';
import {
  BASELINE_MEMBER_MODULE_BOUNDS,
  BASELINE_MEMBER_MODULE_KEYS,
  baselineMemberModuleBound,
  classifyPublishedBaselineModules,
} from './baselineMemberModuleIdentity';
import type { ProgramEnrollmentStatus } from './runtimeTypes';

/**
 * Structural view of a delivery module. Lesson bodies are intentionally absent:
 * completeness is about published identity and day bounds, not about copying
 * future lesson text into the browser.
 */
export interface BaselineDeliveryModuleShape {
  id: string;
  moduleType?: string;
  dayStart?: number | null;
  dayEnd?: number | null;
  statusVisibility?: readonly string[];
}

export type BaselineMemberModuleAssessment =
  | 'exact'
  | 'authorized-subset'
  | 'incomplete'
  | 'foreign'
  | 'unrelated'
  | 'malformed';

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function boundsMatch(
  module: BaselineDeliveryModuleShape,
  bound: (typeof BASELINE_MEMBER_MODULE_BOUNDS)[number],
): boolean {
  return module.dayStart === bound.dayStart
    && module.dayEnd === bound.dayEnd
    && module.moduleType === bound.moduleType
    && sameMembers(module.statusVisibility ?? [], bound.statusVisibility);
}

function identityModules(): ProgramDeliveryModuleDefinition[] {
  return BASELINE_MEMBER_MODULE_BOUNDS.map((bound) => ({
    id: bound.id,
    programSlug: 'baseline',
    moduleType: bound.moduleType,
    title: bound.id,
    body: bound.id,
    dayStart: bound.dayStart,
    dayEnd: bound.dayEnd,
    statusVisibility: [...bound.statusVisibility],
  }));
}

export function memberAccessibleDay(input: {
  resolvedStatus: ProgramEnrollmentStatus | ProgramDeliveryStatusVisibility;
  currentDay: number;
}): number {
  return memberMaximumAccessibleDay(input.resolvedStatus, input.currentDay);
}

export function authorizedBaselineModuleIds(
  status: ProgramDeliveryStatusVisibility,
  maximumAccessibleDay: number,
): Set<string> {
  return new Set(
    filterMemberDeliveryModules(
      identityModules(),
      status,
      maximumAccessibleDay,
    ).map((module) => module.id),
  );
}

/**
 * Classify a module list without reading lesson bodies.
 *
 * `exact` is the complete published source. `authorized-subset` is the
 * day-authorized slice of that source. A partial source is not exact, so the
 * server can refuse it before any subset is delivered.
 */
export function assessBaselineMemberModules(
  modules: readonly BaselineDeliveryModuleShape[],
  input: {
    status: ProgramDeliveryStatusVisibility;
    maximumAccessibleDay: number;
  },
): BaselineMemberModuleAssessment {
  const identity = classifyPublishedBaselineModules(modules);
  if (identity === 'foreign') return 'foreign';
  if (identity === 'unrelated') return 'unrelated';

  for (const module of modules) {
    const bound = baselineMemberModuleBound(module.id);
    if (!bound || !boundsMatch(module, bound)) return 'malformed';
  }

  if (identity === 'exact') {
    return modules.length === BASELINE_MEMBER_MODULE_KEYS.length ? 'exact' : 'incomplete';
  }

  const expected = authorizedBaselineModuleIds(input.status, input.maximumAccessibleDay);
  const actual = new Set(modules.map((module) => module.id));
  if (expected.size === 0 || actual.size !== expected.size) return 'incomplete';
  const missing = modules.some((module) => !expected.has(module.id));
  if (missing) return 'incomplete';
  return 'authorized-subset';
}

export function authorizePublishedBaselineDelivery<T extends ProgramDeliveryModuleDefinition>(input: {
  programSlug: string;
  modules: readonly T[];
  status: ProgramDeliveryStatusVisibility;
  maximumAccessibleDay: number;
}): { kind: 'deliver'; modules: T[] } | {
  kind: 'unavailable';
  reason: 'incomplete-content' | 'wrong-version-modules' | 'malformed-content';
} {
  const assessment = assessBaselineMemberModules(input.modules, {
    status: input.status,
    maximumAccessibleDay: input.maximumAccessibleDay,
  });
  if (assessment === 'unrelated' || input.programSlug.trim().toLowerCase() !== 'baseline') {
    return {
      kind: 'deliver',
      modules: filterMemberDeliveryModules(
        input.modules,
        input.status,
        input.maximumAccessibleDay,
      ),
    };
  }
  if (assessment === 'foreign') {
    return { kind: 'unavailable', reason: 'wrong-version-modules' };
  }
  if (assessment === 'malformed') {
    return { kind: 'unavailable', reason: 'malformed-content' };
  }
  if (assessment !== 'exact') {
    return { kind: 'unavailable', reason: 'incomplete-content' };
  }
  return {
    kind: 'deliver',
    modules: filterMemberDeliveryModules(
      input.modules,
      input.status,
      input.maximumAccessibleDay,
    ),
  };
}
