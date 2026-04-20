/**
 * Feature Flags
 * 
 * Centralized feature flag configuration.
 * All flags default to false if environment variables are not set.
 */

export const ENABLE_N8N_WEBHOOK = process.env.ENABLE_N8N_WEBHOOK === 'true';

/**
 * Selects the Plans AI gateway provider. Phase 2 supports 'stub' only.
 * Server-side only — the actual gateway is instantiated in
 * lib/plans/aiGateway.ts.
 */
export const PLANS_AI_PROVIDER = (process.env.PLANS_AI_PROVIDER ?? 'stub').toLowerCase();

