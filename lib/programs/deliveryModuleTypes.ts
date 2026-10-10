import type {
  ProgramCapacity,
  ProgramEnrollmentStatus,
  ProgramRuntimeSummary,
} from './runtimeTypes';

export type ProgramDeliveryModuleType =
  | 'prep'
  | 'week'
  | 'practice_card'
  | 'guide'
  | 'capacity_support'
  | 'roadmap'
  | 'checkin_prompt'
  | 'recommendation_prompt';

export const PROGRAM_DELIVERY_MODULE_TYPES: readonly ProgramDeliveryModuleType[] =
  [
    'prep',
    'week',
    'practice_card',
    'guide',
    'capacity_support',
    'roadmap',
    'checkin_prompt',
    'recommendation_prompt',
  ] as const;

export type ProgramDeliveryStatusVisibility =
  | ProgramEnrollmentStatus
  | 'not_started';

export const PROGRAM_DELIVERY_STATUS_VISIBILITIES: readonly ProgramDeliveryStatusVisibility[] =
  [
    'not_started',
    'pre_start',
    'active',
    'paused',
    'completed',
    'cancelled',
  ] as const;

export type ProgramDeliveryTone =
  | 'neutral'
  | 'emerald'
  | 'sky'
  | 'brand'
  | 'muted';

export type ProgramDeliveryVisibilityCondition =
  | 'always'
  | 'checkin_due'
  | 'checkin_not_due'
  | 'day21_handled'
  | 'day21_not_handled';

export const PROGRAM_DELIVERY_VISIBILITY_CONDITIONS: readonly ProgramDeliveryVisibilityCondition[] =
  [
    'always',
    'checkin_due',
    'checkin_not_due',
    'day21_handled',
    'day21_not_handled',
  ] as const;

export interface ProgramDeliveryCopy {
  eyebrow?: string;
  title?: string;
  body?: string;
  practice?: string;
}

export interface ProgramDeliveryMetricBlock {
  type: 'metrics';
  metrics: Array<
    | 'selected_start'
    | 'current_day'
    | 'capacity'
    | 'content_progress'
  >;
}

export interface ProgramDeliveryListBlock {
  type: 'list';
  items: string[];
}

export interface ProgramDeliveryCardsBlock {
  type: 'cards';
  cards: Array<{
    title: string;
    body: string;
  }>;
}

export interface ProgramDeliveryNoticeBlock {
  type: 'notice';
  eyebrow?: string;
  title: string;
  body: string;
  tone?: ProgramDeliveryTone;
}

export interface ProgramDeliveryRoadmapBlock {
  type: 'roadmap';
  items: Array<{
    key: string;
    label: string;
    range: string;
    description: string;
    dayStart?: number;
    dayEnd?: number;
  }>;
}

export interface ProgramDeliveryMediaBlock {
  type: 'audio' | 'video';
  id: string;
  url: string;
  title: string;
  description?: string;
}

export type ProgramDeliveryBlock =
  | ProgramDeliveryMetricBlock
  | ProgramDeliveryListBlock
  | ProgramDeliveryCardsBlock
  | ProgramDeliveryNoticeBlock
  | ProgramDeliveryRoadmapBlock
  | ProgramDeliveryMediaBlock;

export interface ProgramDeliveryCta {
  label: string;
  href?: string;
  anchorKey?: string;
  tone?: ProgramDeliveryTone;
  disabled?: boolean;
  microcopy?: string;
  showWhen?: ProgramDeliveryVisibilityCondition | ProgramDeliveryVisibilityCondition[];
}

export interface ProgramDeliveryModuleDefinition {
  id: string;
  programSlug: string;
  moduleType: ProgramDeliveryModuleType;
  groupId?: string;
  groupTitle?: string;
  title: string;
  eyebrow?: string;
  body: string;
  dayStart?: number;
  dayEnd?: number;
  statusVisibility: ProgramDeliveryStatusVisibility[];
  showWhen?: ProgramDeliveryVisibilityCondition | ProgramDeliveryVisibilityCondition[];
  statusCopy?: Partial<
    Record<ProgramDeliveryStatusVisibility, ProgramDeliveryCopy>
  >;
  capacityVariants?: Partial<Record<ProgramCapacity, ProgramDeliveryCopy>>;
  blocks?: ProgramDeliveryBlock[];
  cta?: ProgramDeliveryCta;
  anchorId?: string;
  safetyNotes?: string[];
  noClaimsNotes?: string[];
  composition?: {
    contract: 'programs-delivery-composition-v1';
    hero?: {
      title?: string;
      eyebrow?: string;
      imageUrl?: string;
    };
  };
}

export interface ProgramDeliveryRuntimeContext {
  runtimeSummary: ProgramRuntimeSummary | null;
  checkinDue?: boolean;
  day21Handled?: boolean;
  /** Selected review day. Absent callers keep legacy current_day filtering. */
  viewedDay?: number;
}

function statusForSummary(
  summary: ProgramRuntimeSummary | null,
): ProgramDeliveryStatusVisibility {
  return summary?.resolved_status ?? 'not_started';
}

function conditionMatches(
  condition:
    | ProgramDeliveryVisibilityCondition
    | ProgramDeliveryVisibilityCondition[]
    | undefined,
  ctx: ProgramDeliveryRuntimeContext,
): boolean {
  if (Array.isArray(condition)) {
    return condition.every((entry) => conditionMatches(entry, ctx));
  }

  switch (condition ?? 'always') {
    case 'checkin_due':
      return Boolean(ctx.checkinDue);
    case 'checkin_not_due':
      return !ctx.checkinDue;
    case 'day21_handled':
      return Boolean(ctx.day21Handled);
    case 'day21_not_handled':
      return !ctx.day21Handled;
    case 'always':
    default:
      return true;
  }
}

export function isDeliveryModuleVisible(
  module: ProgramDeliveryModuleDefinition,
  ctx: ProgramDeliveryRuntimeContext,
): boolean {
  const status = statusForSummary(ctx.runtimeSummary);
  if (!module.statusVisibility.includes(status)) return false;
  if (!conditionMatches(module.showWhen, ctx)) return false;

  const unbounded = module.dayStart == null && module.dayEnd == null;
  if (status !== 'active') {
    if (unbounded) return true;
    const setupDay = ctx.viewedDay ?? 0;
    return (
      (status === 'not_started' || status === 'pre_start') &&
      setupDay === 0 &&
      module.dayStart === 0 &&
      module.dayEnd != null &&
      module.dayEnd >= 0
    );
  }

  const day = ctx.viewedDay ?? ctx.runtimeSummary?.current_day ?? 0;
  if (module.dayStart != null && day < module.dayStart) return false;
  if (module.dayEnd != null && day > module.dayEnd) return false;

  return true;
}

export function resolveDeliveryModuleCopy(
  module: ProgramDeliveryModuleDefinition,
  summary: ProgramRuntimeSummary | null,
  options?: { viewedDay?: number },
): Required<Pick<ProgramDeliveryCopy, 'title' | 'body'>> &
  Pick<ProgramDeliveryCopy, 'eyebrow' | 'practice'> {
  const status = statusForSummary(summary);
  const day = options?.viewedDay ?? summary?.current_day;
  const shouldUseStatusCopy = !(
    module.moduleType === 'prep' &&
    status === 'active' &&
    day === 0
  );
  const statusCopy = shouldUseStatusCopy
    ? (module.statusCopy?.[status] ?? {})
    : {};
  const capacity =
    summary?.enrollment.current_capacity &&
    module.capacityVariants?.[summary.enrollment.current_capacity]
      ? module.capacityVariants[summary.enrollment.current_capacity]
      : undefined;

  return {
    eyebrow: capacity?.eyebrow ?? statusCopy.eyebrow ?? module.eyebrow,
    title: capacity?.title ?? statusCopy.title ?? module.title,
    body: capacity?.body ?? statusCopy.body ?? module.body,
    practice: capacity?.practice ?? statusCopy.practice,
  };
}

export function filterVisibleDeliveryModules(
  modules: ProgramDeliveryModuleDefinition[],
  ctx: ProgramDeliveryRuntimeContext,
): ProgramDeliveryModuleDefinition[] {
  return modules.filter((module) => isDeliveryModuleVisible(module, ctx));
}
