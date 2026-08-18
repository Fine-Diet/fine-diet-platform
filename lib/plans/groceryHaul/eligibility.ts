/**
 * Packet 11B create eligibility. Packet 10 readiness is the input classifier;
 * pricing completeness never gates. The live RPC remains the authority for
 * pending-item snapshots and open-Haul uniqueness.
 */

import type { GroceryListReadinessState } from '@/lib/plans/groceryListReadiness/policy';

export type GroceryHaulCreateBlockReason =
  | 'archived'
  | 'empty_or_no_demand'
  | 'needs_resolution'
  | 'complete_or_closed';

export type GroceryHaulCreateEligibility =
  | { eligible: true }
  | { eligible: false; blockReason: GroceryHaulCreateBlockReason };

export function resolveGroceryHaulCreateEligibility(args: {
  archivedAt?: string | null;
  readinessState: GroceryListReadinessState;
}): GroceryHaulCreateEligibility {
  if (args.archivedAt) {
    return { eligible: false, blockReason: 'archived' };
  }
  if (args.readinessState === 'empty_or_no_demand'
    || args.readinessState === 'needs_resolution'
    || args.readinessState === 'complete_or_closed') {
    return { eligible: false, blockReason: args.readinessState };
  }
  return { eligible: true };
}
