import {
  resolveMemberBlueprintBinding,
  type MemberBlueprintBinding,
  type MemberBlueprintResponseIdentity,
} from './baselineMemberBinding';
import type { ProgramDeliveryModuleDefinition } from './deliveryModuleTypes';
import {
  isHistoricalReviewStatus,
  selectHistoricalReviewModules,
} from './historicalReviewPolicy';
import type { ProgramRuntimeSummary } from './runtimeTypes';

/**
 * The canonical member route wires the delivery API response into the
 * Blueprint binding, then into ProgramDeliveryExperience. Future lesson
 * bodies stay out of `deliveryModules`.
 */
export function resolveCanonicalMemberDelivery(input: {
  programSlug: string;
  summary: ProgramRuntimeSummary | null;
  modules: readonly ProgramDeliveryModuleDefinition[];
  authorizedPersonId: string | null;
  response?: MemberBlueprintResponseIdentity | null;
}): {
  binding: MemberBlueprintBinding;
  deliveryModules: ProgramDeliveryModuleDefinition[];
} {
  const binding = resolveMemberBlueprintBinding(input);
  const sourced = binding.kind === 'published-blueprint'
    ? binding.modules
    : binding.kind === 'unavailable'
      ? []
      : [...input.modules];
  const deliveryModules = input.summary && isHistoricalReviewStatus(input.summary.resolved_status)
    ? selectHistoricalReviewModules(sourced, input.summary.current_day)
    : sourced;
  return { binding, deliveryModules };
}
