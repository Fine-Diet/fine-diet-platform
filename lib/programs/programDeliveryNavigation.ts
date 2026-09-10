import type {
  ProgramDeliveryModuleDefinition,
  ProgramDeliveryRoadmapBlock,
} from './deliveryModuleTypes';
import type {
  ProgramEnrollmentStatus,
  ProgramRuntimeSummary,
} from './runtimeTypes';

export type ProgramDayState = 'setup' | 'review' | 'current' | 'locked';

export interface ProgramDayRailItem {
  day: number;
  label: string;
  state: ProgramDayState;
  accessible: boolean;
}

export interface ProgramEnrollmentRequest {
  program_slug: string;
  selected_start_date: string;
  timezone: string;
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildProgramEnrollmentRequest(params: {
  programSlug: string;
  selectedStartDate: string;
  timezone: string;
}): ProgramEnrollmentRequest {
  return {
    program_slug: params.programSlug,
    selected_start_date: params.selectedStartDate,
    timezone: params.timezone,
  };
}

export function resolveProgramDuration(
  runtimeSummary: ProgramRuntimeSummary | null,
  modules: readonly ProgramDeliveryModuleDefinition[],
): number {
  const versionDuration = runtimeSummary?.version.duration_days;
  if (versionDuration && versionDuration > 0) return versionDuration;

  return Math.max(
    1,
    ...modules.flatMap((module) => [
      module.dayStart ?? 0,
      module.dayEnd ?? 0,
    ]),
  );
}

export function buildProgramDayRail(params: {
  durationDays: number;
  runtimeStatus: ProgramEnrollmentStatus | 'not_started';
  currentDay: number;
}): ProgramDayRailItem[] {
  const canReviewRuntime = ['active', 'paused', 'completed'].includes(
    params.runtimeStatus,
  );
  const rail: ProgramDayRailItem[] = [
    { day: 0, label: 'Setup', state: 'setup', accessible: true },
  ];

  for (let day = 1; day <= Math.max(1, params.durationDays); day += 1) {
    const accessible = canReviewRuntime && day <= params.currentDay;
    rail.push({
      day,
      label: String(day),
      state: !accessible
        ? 'locked'
        : day === params.currentDay
          ? 'current'
          : 'review',
      accessible,
    });
  }
  return rail;
}

export function resolveInitialProgramDay(
  runtimeSummary: ProgramRuntimeSummary | null,
): number {
  if (
    runtimeSummary?.resolved_status === 'active' ||
    runtimeSummary?.resolved_status === 'paused' ||
    runtimeSummary?.resolved_status === 'completed'
  ) {
    return Math.max(0, runtimeSummary.current_day);
  }
  return 0;
}

export function getProgramRoadmapItems(
  modules: readonly ProgramDeliveryModuleDefinition[],
): ProgramDeliveryRoadmapBlock['items'] {
  for (const module of modules) {
    for (const block of module.blocks ?? []) {
      if (block.type === 'roadmap') return block.items;
    }
  }
  return [];
}
