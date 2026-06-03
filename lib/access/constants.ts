/**
 * Shared constants for the access management system.
 *
 * Single source of truth for entitlement key suggestions and source labels
 * used across admin UI pages. Keep in sync with docs/access/ENTITLEMENT-KEY-REGISTRY.md.
 */

/* ------------------------------------------------------------------ */
/*  Entitlement Keys — registry of known/suggested keys               */
/* ------------------------------------------------------------------ */

export interface EntitlementKeyOption {
  key: string;
  label: string;
}

/**
 * Known entitlement keys from the registry.
 * The offer admin UI presents these as the selectable options for new mappings;
 * active mappings to unregistered keys are rejected server-side
 * (see pages/api/admin/offers/set-entitlements.ts).
 */
export const ENTITLEMENT_KEY_OPTIONS: EntitlementKeyOption[] = [
  { key: 'care:integrative', label: 'Care: Integrative Care' },
  { key: 'journal', label: 'Journal — full journal access' },
  { key: 'program:baseline', label: 'Program: Baseline' },
  { key: 'program:gut-check', label: 'Program: Gut Check' },
  { key: 'feature:nds-breakdown', label: 'Feature: NDS Breakdown' },
  // Plans Phase 1 — feature gates for the Plans lane.
  { key: 'feature:plans-ai-generate', label: 'Feature: Plans — AI plan generation' },
  { key: 'feature:plans-nds-projection', label: 'Feature: Plans — NDS daily projection' },
  { key: 'feature:plans-nds-breakdown', label: 'Feature: Plans — NDS breakdown on planned meals' },
  { key: 'feature:plans-nds-optimize', label: 'Feature: Plans — NDS optimizer / auto-tune' },
  { key: 'feature:plans-restaurant-analysis', label: 'Feature: Plans — Restaurant / menu analysis' },
  { key: 'feature:plans-recipe-video-import', label: 'Feature: Plans — Recipe + video import' },
  { key: 'feature:plans-advanced-subs', label: 'Feature: Plans — Advanced substitutions' },
  { key: 'feature:plans-concierge', label: 'Feature: Plans — Concierge / white-glove tier' },
];

/** Just the key strings, for quick lookups */
export const KNOWN_ENTITLEMENT_KEYS: string[] = ENTITLEMENT_KEY_OPTIONS.map((o) => o.key);

export function isKnownEntitlementKey(entitlementKey: string): boolean {
  return KNOWN_ENTITLEMENT_KEYS.includes(entitlementKey.trim().toLowerCase());
}

/* ------------------------------------------------------------------ */
/*  Entitlement Sources — how the entitlement was created              */
/* ------------------------------------------------------------------ */

export interface EntitlementSourceOption {
  value: string;
  label: string;
}

export const ENTITLEMENT_SOURCE_OPTIONS: EntitlementSourceOption[] = [
  { value: 'admin_grant', label: 'Admin Grant' },
  { value: 'manual', label: 'Manual' },
  { value: 'offer', label: 'Offer' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'migration', label: 'Migration' },
];

export const DEFAULT_ENTITLEMENT_SOURCE = 'admin_grant';
