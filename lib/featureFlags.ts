/**
 * Feature Flags
 * 
 * Centralized feature flag configuration.
 * All flags default to false if environment variables are not set.
 */

export const ENABLE_N8N_WEBHOOK = process.env.ENABLE_N8N_WEBHOOK === 'true';

