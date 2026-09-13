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

export function twoDigitDay(day: number): string {
  return String(Math.max(0, Math.floor(day))).padStart(2, '0');
}

export function weekOrdinalLabel(weekNumber: number): string {
  const labels = [
    'Zero',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
  ];
  const normalizedWeek = Math.max(1, Math.floor(weekNumber));
  return `Week ${labels[normalizedWeek] ?? normalizedWeek}`;
}

function weekModuleForDay(
  day: number,
  modules: readonly ProgramDeliveryModuleDefinition[],
): ProgramDeliveryModuleDefinition | undefined {
  return modules.find(
    (module) =>
      module.moduleType === 'week' &&
      module.dayStart != null &&
      module.dayEnd != null &&
      day >= module.dayStart &&
      day <= module.dayEnd,
  );
}

function deriveWeekNumber(
  activeModule: ProgramDeliveryModuleDefinition,
  modules: readonly ProgramDeliveryModuleDefinition[],
): number {
  const weekModules = modules
    .filter(
      (module) =>
        module.moduleType === 'week' &&
        module.dayStart != null &&
        module.dayEnd != null,
    )
    .sort(
      (left, right) =>
        (left.dayStart ?? Number.MAX_SAFE_INTEGER) -
        (right.dayStart ?? Number.MAX_SAFE_INTEGER),
    );

  const index = weekModules.findIndex((module) => module.id === activeModule.id);
  return index >= 0 ? index + 1 : 1;
}

function dayZeroGroupTitle(
  modules: readonly ProgramDeliveryModuleDefinition[],
): string | null {
  const groupTitle = modules.find(
    (module) => module.moduleType === 'prep' && module.groupTitle,
  )?.groupTitle;
  if (!groupTitle) return null;

  return groupTitle.replace(/\bpreparation$/i, 'Setup');
}

export function deriveHeroDayContext(
  selectedDay: number,
  deliveryModules: readonly ProgramDeliveryModuleDefinition[],
): string {
  const day = Math.max(0, Math.floor(selectedDay));
  const dayLabel = twoDigitDay(day);

  if (day === 0) {
    return `${dayLabel} — ${dayZeroGroupTitle(deliveryModules) ?? 'Setup'}`;
  }

  const weekModule = weekModuleForDay(day, deliveryModules);
  if (!weekModule) return dayLabel;

  return `${dayLabel} — ${weekOrdinalLabel(
    deriveWeekNumber(weekModule, deliveryModules),
  )} — ${weekModule.title}`;
}

export function deriveDayTabLabel(
  day: number,
  deliveryModules: readonly ProgramDeliveryModuleDefinition[],
): string {
  const normalizedDay = Math.max(0, Math.floor(day));
  if (normalizedDay === 0) return 'Setup';

  const matchingModules = deliveryModules.filter(
    (candidate) =>
      (candidate.moduleType === 'week' ||
        candidate.moduleType === 'practice_card') &&
      candidate.dayStart != null &&
      candidate.dayEnd != null &&
      normalizedDay >= candidate.dayStart &&
      normalizedDay <= candidate.dayEnd,
  );
  const module =
    matchingModules.find(
      (candidate) =>
        candidate.dayStart === normalizedDay &&
        candidate.dayEnd === normalizedDay,
    ) ??
    matchingModules.find(
      (candidate) => candidate.moduleType === 'practice_card',
    ) ??
    matchingModules[0];

  return module
    ? `Day ${twoDigitDay(normalizedDay)}: ${module.title}`
    : `Day ${twoDigitDay(normalizedDay)}`;
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
    { day: 0, label: '0', state: 'setup', accessible: true },
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
