/**
 * Capability gates (pure — safe for client + server).
 *
 * v1 uses the existing colon-style `feature:` convention (NOT a new dotted
 * taxonomy) so the registry/verifier pattern stays unchanged. These are the
 * granular gates that the access-state model maps to. Final enforcement at
 * each call site is staged; v1 wires the state -> gate mapping centrally.
 *
 * Keep this list in sync with docs/access/ENTITLEMENT-KEY-REGISTRY.md and
 * lib/access/constants.ts (verified by npm run verify:entitlements).
 */

// Read-only "view saved data" gates — available even in data_access_only.
export const VIEW_GATES = [
  'feature:account-data-view',
  'feature:billing-upgrade-view',
  'feature:journal-entry-view-own',
  'feature:recipes-view-saved',
  'feature:meal-schedule-view',
  'feature:grocery-list-view',
  'feature:pantry-item-view',
  'feature:assessments-results-view-history',
  'feature:programs-catalog-view',
  'feature:programs-history-view',
] as const;

// Active-tool gates — locked when not subscriber/trialing.
export const ACTION_GATES = [
  'feature:journal-entry-create',
  'feature:insights-ai-generate',
  'feature:recipes-save',
  'feature:recipes-import',
  'feature:meal-schedule-create',
  'feature:grocery-list-create',
  'feature:pantry-item-create',
  'feature:assessments-start',
  'feature:assessments-results-generate',
  'feature:programs-start',
  'feature:programs-step-continue',
] as const;

// Premium practitioner gate.
export const PRACTITIONER_GATE = 'feature:practitioner-support-access' as const;

export type CapabilityGate =
  | (typeof VIEW_GATES)[number]
  | (typeof ACTION_GATES)[number]
  | typeof PRACTITIONER_GATE;

/** All capability gates, for registry/verifier alignment. */
export const ALL_CAPABILITY_GATES: CapabilityGate[] = [
  ...VIEW_GATES,
  ...ACTION_GATES,
  PRACTITIONER_GATE,
];
