import type {
  ProgramAvailabilityReason,
  ProgramAvailabilityState,
} from '@/lib/programs/programAvailabilityServerService';
import type {
  ProgramAccessState,
  ProgramRuntimeState,
} from '@/lib/programs/programLibraryServerService';
import type {
  ProgramEnrollmentStatus,
  ProgramRuntimeSummary,
} from '@/lib/programs/runtimeTypes';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';

/**
 * My Programs groups existing access and enrollment truth.
 * It does not invent enrollments, completion, or a universal score.
 *
 * Enrollment status wins when a runtime summary exists. Assignment
 * runtime is used only when there is no enrollment. Cancelled history
 * with no remaining access is omitted: it is not current, ready to
 * start, or completed.
 */

export type MyProgramsGroupId = 'current' | 'ready_to_start' | 'completed';

export const MY_PROGRAMS_GROUPS: ReadonlyArray<{
  id: MyProgramsGroupId;
  title: string;
  emptyLabel: string;
}> = [
  {
    id: 'current',
    title: 'Current',
    emptyLabel: 'No program is in progress.',
  },
  {
    id: 'ready_to_start',
    title: 'Ready to Start',
    emptyLabel: 'No programs are waiting to start.',
  },
  {
    id: 'completed',
    title: 'Completed',
    emptyLabel: 'No completed programs yet.',
  },
];

export interface MyProgramsLibrarySlice {
  slug: string;
  title: string;
  tagline: string | null;
  has_entitlement: boolean;
  access_state: ProgramAccessState;
  runtime_state: ProgramRuntimeState;
  impact_headline: string | null;
  progress: { items_completed: number; items_total: number } | null;
}

export interface MyProgramsAvailabilitySlice {
  slug: string;
  state: ProgramAvailabilityState;
  reason: ProgramAvailabilityReason;
  can_start: boolean;
  is_entitled: boolean;
}

export interface MyProgramsRuntimeSlice {
  slug: string;
  title: string;
  tagline: string | null;
  resolvedStatus: ProgramEnrollmentStatus;
  currentDay: number;
  durationDays: number | null;
  selectedStartDate: string | null;
  completedAt: string | null;
}

export interface MyProgramCardModel {
  slug: string;
  title: string;
  tagline: string | null;
  href: string;
  group: MyProgramsGroupId;
  statusLabel: string;
  /** Program-specific day or item progress. Never a universal score. */
  progressDetail: string | null;
  startDate: string | null;
  note: string | null;
}

interface ResolvedProgram {
  slug: string;
  title: string;
  tagline: string | null;
  hasAccess: boolean;
  enrollmentStatus: ProgramEnrollmentStatus | null;
  currentDay: number | null;
  durationDays: number | null;
  selectedStartDate: string | null;
  completedAt: string | null;
  assignmentRuntimeState: ProgramRuntimeState | null;
  availabilityState: ProgramAvailabilityState | null;
  availabilityReason: ProgramAvailabilityReason | null;
  canStart: boolean;
  itemsCompleted: number | null;
  itemsTotal: number | null;
  impactHeadline: string | null;
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function hasLibraryAccess(entry: MyProgramsLibrarySlice | undefined): boolean {
  if (!entry) return false;
  return entry.has_entitlement || entry.access_state === 'assigned_only';
}

export function runtimeSliceFromSummary(
  summary: ProgramRuntimeSummary,
): MyProgramsRuntimeSlice {
  return {
    slug: summary.program.slug,
    title: summary.program.title,
    tagline: summary.program.tagline,
    resolvedStatus: summary.resolved_status,
    currentDay: summary.current_day,
    durationDays: summary.version.duration_days,
    selectedStartDate: summary.enrollment.selected_start_date,
    completedAt: summary.enrollment.completed_at,
  };
}

export function resolveMyProgramGroup(
  program: Pick<
    ResolvedProgram,
    | 'hasAccess'
    | 'enrollmentStatus'
    | 'assignmentRuntimeState'
  >,
): MyProgramsGroupId | null {
  switch (program.enrollmentStatus) {
    case 'active':
    case 'paused':
      return 'current';
    case 'pre_start':
      return 'ready_to_start';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return program.hasAccess ? 'ready_to_start' : null;
    default:
      break;
  }

  switch (program.assignmentRuntimeState) {
    case 'active_now':
      return 'current';
    case 'completed':
      return 'completed';
    case 'scheduled':
      return 'ready_to_start';
    case 'cancelled':
      return program.hasAccess ? 'ready_to_start' : null;
    default:
      return program.hasAccess ? 'ready_to_start' : null;
  }
}

function statusLabel(program: ResolvedProgram, group: MyProgramsGroupId): string {
  if (program.enrollmentStatus === 'paused') return 'Paused';
  if (program.enrollmentStatus === 'active') return 'In progress';
  if (program.enrollmentStatus === 'pre_start') return 'Pre-start';
  if (program.enrollmentStatus === 'completed' || group === 'completed') return 'Completed';
  if (program.assignmentRuntimeState === 'active_now') return 'In progress';
  if (program.assignmentRuntimeState === 'scheduled') return 'Scheduled';
  if (program.enrollmentStatus === 'cancelled') {
    if (program.canStart) return 'Ready to start';
    return 'Cancelled';
  }
  if (
    program.availabilityState === 'dependency_locked'
    || program.availabilityReason === 'prerequisite_incomplete'
  ) {
    return 'Prerequisite incomplete';
  }
  if (program.availabilityReason === 'runtime_not_ready') return 'Not ready to start';
  if (program.canStart || program.availabilityState === 'available') return 'Ready to start';
  if (program.hasAccess) return 'Not started';
  return 'In your programs';
}

function progressDetail(program: ResolvedProgram): string | null {
  const inGuidedRun = program.enrollmentStatus === 'active' || program.enrollmentStatus === 'paused';
  if (inGuidedRun && program.currentDay != null && program.currentDay > 0) {
    if (program.durationDays != null && program.durationDays > 0) {
      return `Day ${program.currentDay} of ${program.durationDays}`;
    }
    return `Day ${program.currentDay}`;
  }

  if (
    program.itemsTotal != null
    && program.itemsTotal > 0
    && program.itemsCompleted != null
  ) {
    return `${program.itemsCompleted} of ${program.itemsTotal} items`;
  }

  return null;
}

function resolveProgram(input: {
  entry?: MyProgramsLibrarySlice;
  runtime?: MyProgramsRuntimeSlice;
  availability?: MyProgramsAvailabilitySlice;
}): ResolvedProgram | null {
  const slug = normalizeSlug(input.entry?.slug ?? input.runtime?.slug ?? input.availability?.slug ?? '');
  if (!slug) return null;

  const hasAccess = hasLibraryAccess(input.entry) || Boolean(input.availability?.is_entitled);

  return {
    slug,
    title: input.entry?.title || input.runtime?.title || slug,
    tagline: input.entry?.tagline ?? input.runtime?.tagline ?? null,
    hasAccess,
    enrollmentStatus: input.runtime?.resolvedStatus ?? null,
    currentDay: input.runtime?.currentDay ?? null,
    durationDays: input.runtime?.durationDays ?? null,
    selectedStartDate: input.runtime?.selectedStartDate ?? null,
    completedAt: input.runtime?.completedAt ?? null,
    assignmentRuntimeState: input.entry?.runtime_state ?? null,
    availabilityState: input.availability?.state ?? null,
    availabilityReason: input.availability?.reason ?? null,
    canStart: Boolean(input.availability?.can_start),
    itemsCompleted: input.entry?.progress?.items_completed ?? null,
    itemsTotal: input.entry?.progress?.items_total ?? null,
    impactHeadline: input.entry?.impact_headline ?? null,
  };
}

function toCard(program: ResolvedProgram): MyProgramCardModel | null {
  const group = resolveMyProgramGroup(program);
  if (!group) return null;

  return {
    slug: program.slug,
    title: program.title,
    tagline: program.tagline,
    href: APP_ROUTE_BUILDERS.programDetail(program.slug),
    group,
    statusLabel: statusLabel(program, group),
    progressDetail: progressDetail(program),
    startDate: program.enrollmentStatus === 'pre_start' ? program.selectedStartDate : null,
    note: program.impactHeadline,
  };
}

function compareCards(a: MyProgramCardModel, b: MyProgramCardModel, programs: Map<string, ResolvedProgram>): number {
  const left = programs.get(a.slug);
  const right = programs.get(b.slug);
  if (a.group === 'completed' && b.group === 'completed') {
    const leftCompleted = left?.completedAt ?? '';
    const rightCompleted = right?.completedAt ?? '';
    if (leftCompleted !== rightCompleted) return rightCompleted.localeCompare(leftCompleted);
  }
  if (a.group === 'current' && b.group === 'current') {
    const rank = (status: ProgramEnrollmentStatus | null | undefined) => (status === 'paused' ? 1 : 0);
    const statusDelta = rank(left?.enrollmentStatus) - rank(right?.enrollmentStatus);
    if (statusDelta !== 0) return statusDelta;
  }
  return a.title.localeCompare(b.title);
}

export function buildMyProgramsViewModel(input: {
  entries?: readonly MyProgramsLibrarySlice[];
  runtimes?: readonly MyProgramsRuntimeSlice[];
  availability?: readonly MyProgramsAvailabilitySlice[];
}): MyProgramCardModel[] {
  const entries = new Map<string, MyProgramsLibrarySlice>();
  const runtimes = new Map<string, MyProgramsRuntimeSlice>();
  const availability = new Map<string, MyProgramsAvailabilitySlice>();
  const slugs: string[] = [];

  for (const entry of input.entries ?? []) {
    const slug = normalizeSlug(entry.slug);
    if (!slug || entries.has(slug)) continue;
    entries.set(slug, entry);
    slugs.push(slug);
  }

  for (const runtime of input.runtimes ?? []) {
    const slug = normalizeSlug(runtime.slug);
    if (!slug) continue;
    if (!runtimes.has(slug)) runtimes.set(slug, runtime);
    if (!entries.has(slug) && !slugs.includes(slug)) slugs.push(slug);
  }

  for (const entry of input.availability ?? []) {
    const slug = normalizeSlug(entry.slug);
    if (slug) availability.set(slug, entry);
  }

  const resolved = new Map<string, ResolvedProgram>();
  const cards: MyProgramCardModel[] = [];
  for (let index = 0; index < slugs.length; index += 1) {
    const slug = slugs[index];
    const program = resolveProgram({
      entry: entries.get(slug),
      runtime: runtimes.get(slug),
      availability: availability.get(slug),
    });
    if (!program) continue;
    const card = toCard(program);
    if (!card) continue;
    resolved.set(slug, program);
    cards.push(card);
  }

  const groupOrder: Record<MyProgramsGroupId, number> = {
    current: 0,
    ready_to_start: 1,
    completed: 2,
  };

  cards.sort((a, b) => {
    const groupDelta = groupOrder[a.group] - groupOrder[b.group];
    if (groupDelta !== 0) return groupDelta;
    return compareCards(a, b, resolved);
  });

  return cards;
}
