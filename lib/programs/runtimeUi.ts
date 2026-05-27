import type { ProgramRuntimeSummary } from './runtimeTypes';

export type BaselineCardRuntimeState =
  | 'locked'
  | 'start_ready'
  | 'pre_start'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type BaselineDetailRuntimeState =
  | 'not_in_library'
  | 'start_ready'
  | 'pre_start'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type BaselinePrepModuleAccess = 'hidden' | 'primary' | 'reference';

export function resolveBaselineCardRuntimeState({
  hasAccess,
  summary,
}: {
  hasAccess: boolean;
  summary: ProgramRuntimeSummary | null;
}): BaselineCardRuntimeState {
  if (!hasAccess && !summary) return 'locked';
  if (!summary) return 'start_ready';

  switch (summary.resolved_status) {
    case 'pre_start':
      return 'pre_start';
    case 'active':
      return 'active';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'start_ready';
  }
}

export function resolveBaselineDetailRuntimeState({
  inLibrary,
  hasAccess,
  summary,
}: {
  inLibrary: boolean;
  hasAccess: boolean;
  summary: ProgramRuntimeSummary | null;
}): BaselineDetailRuntimeState {
  if (!inLibrary || (!hasAccess && !summary)) return 'not_in_library';
  if (!summary) return 'start_ready';

  switch (summary.resolved_status) {
    case 'pre_start':
      return 'pre_start';
    case 'active':
      return 'active';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'start_ready';
  }
}

export function resolveBaselinePrepModuleAccess(
  summary: ProgramRuntimeSummary | null,
): BaselinePrepModuleAccess {
  if (!summary) return 'hidden';

  if (summary.resolved_status === 'pre_start' || summary.current_day === 0) {
    return 'primary';
  }

  if (summary.resolved_status === 'active') {
    return 'reference';
  }

  return 'hidden';
}
