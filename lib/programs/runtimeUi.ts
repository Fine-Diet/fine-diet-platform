import type { ProgramRuntimeSummary } from './runtimeTypes';

export type BaselineCardRuntimeState =
  | 'locked'
  | 'start_ready'
  | 'pre_start'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

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
