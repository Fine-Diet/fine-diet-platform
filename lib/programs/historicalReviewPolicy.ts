import type {
  ProgramDeliveryModuleDefinition,
  ProgramDeliveryModuleType,
  ProgramDeliveryStatusVisibility,
} from './deliveryModuleTypes';

/**
 * Paused and completed members may review informational content for days
 * they already reached. Interactive module types stay out of that view.
 */
const INFORMATIONAL_MODULE_TYPES = new Set<ProgramDeliveryModuleType>([
  'prep',
  'week',
  'practice_card',
  'guide',
  'capacity_support',
  'roadmap',
]);

export function isHistoricalReviewStatus(
  status: string | null | undefined,
): status is 'paused' | 'completed' {
  return status === 'paused' || status === 'completed';
}

export function isSafeHistoricalModule(
  module: Pick<ProgramDeliveryModuleDefinition, 'moduleType' | 'dayStart' | 'dayEnd'>,
  input: { viewedDay: number; reachedDay: number },
): boolean {
  if (!INFORMATIONAL_MODULE_TYPES.has(module.moduleType)) return false;
  if (input.viewedDay < 0 || input.viewedDay > input.reachedDay) return false;
  if (typeof module.dayStart !== 'number' || typeof module.dayEnd !== 'number') return false;
  if (module.dayStart > input.reachedDay) return false;
  return input.viewedDay >= module.dayStart && input.viewedDay <= module.dayEnd;
}

export function moduleOverlapsReachedDays(
  module: Pick<ProgramDeliveryModuleDefinition, 'moduleType' | 'dayStart' | 'dayEnd'>,
  reachedDay: number,
): boolean {
  if (!INFORMATIONAL_MODULE_TYPES.has(module.moduleType)) return false;
  if (typeof module.dayStart !== 'number' || typeof module.dayEnd !== 'number') return false;
  return module.dayStart <= reachedDay && module.dayEnd >= 0 && module.dayStart <= module.dayEnd;
}

export function stripHistoricalInteractions<T extends ProgramDeliveryModuleDefinition>(
  module: T,
): T {
  const rest = { ...module };
  delete rest.cta;
  delete rest.showWhen;
  return rest;
}

export function selectHistoricalReviewModules<T extends ProgramDeliveryModuleDefinition>(
  modules: readonly T[],
  reachedDay: number,
): T[] {
  return modules
    .filter((module) => moduleOverlapsReachedDays(module, reachedDay))
    .map((module) => stripHistoricalInteractions(module));
}

export function filterMemberDeliveryModules<T extends ProgramDeliveryModuleDefinition>(
  modules: readonly T[],
  status: ProgramDeliveryStatusVisibility,
  maximumAccessibleDay: number,
): T[] {
  if (isHistoricalReviewStatus(status)) {
    return selectHistoricalReviewModules(modules, maximumAccessibleDay);
  }
  return modules.filter(
    (module) =>
      module.statusVisibility.includes(status) &&
      (module.dayStart == null || module.dayStart <= maximumAccessibleDay),
  );
}

export function rejectDeliveryVersion(input: {
  requestedVersionId?: string | null;
  enrolledVersionId: string;
  versionStatus: string;
  responseVersionId?: string | null;
}): 'foreign-version' | 'draft-content' | 'stale-response' | null {
  if (input.versionStatus !== 'published') return 'draft-content';
  if (
    input.requestedVersionId &&
    input.requestedVersionId !== input.enrolledVersionId
  ) {
    return 'foreign-version';
  }
  if (
    input.responseVersionId &&
    input.responseVersionId !== input.enrolledVersionId
  ) {
    return 'stale-response';
  }
  return null;
}
