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
  { key: 'program:digestive-foundations', label: 'Program: Digestive Reset' },
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
  // App subscription capability gates (app-marketing-offers-v1).
  // Colon-style feature: keys for granular capability gates, mapped to access
  // states in lib/access/accessState.ts. Placeholders — enforcement is staged.
  { key: 'feature:account-data-view', label: 'Feature: Account — view saved data' },
  { key: 'feature:billing-upgrade-view', label: 'Feature: Billing — view upgrade options' },
  { key: 'feature:journal-entry-view-own', label: 'Feature: Journal — view own entries' },
  { key: 'feature:journal-entry-create', label: 'Feature: Journal — create entries' },
  { key: 'feature:insights-ai-generate', label: 'Feature: Insights — generate AI insights' },
  { key: 'feature:recipes-view-saved', label: 'Feature: Recipes — view saved' },
  { key: 'feature:recipes-save', label: 'Feature: Recipes — save' },
  { key: 'feature:recipes-import', label: 'Feature: Recipes — import' },
  { key: 'feature:meal-schedule-view', label: 'Feature: Meal schedule — view' },
  { key: 'feature:meal-schedule-create', label: 'Feature: Meal schedule — create' },
  { key: 'feature:grocery-list-view', label: 'Feature: Grocery list — view' },
  { key: 'feature:grocery-list-create', label: 'Feature: Grocery list — create' },
  { key: 'feature:grocery-price-search', label: 'Feature: Grocery — price search' },
  { key: 'feature:pantry-item-view', label: 'Feature: Pantry — view items' },
  { key: 'feature:pantry-item-create', label: 'Feature: Pantry — create items' },
  { key: 'feature:assessments-start', label: 'Feature: Assessments — start' },
  { key: 'feature:assessments-results-view-history', label: 'Feature: Assessments — view results history' },
  { key: 'feature:assessments-results-generate', label: 'Feature: Assessments — generate results' },
  { key: 'feature:programs-catalog-view', label: 'Feature: Programs — view catalog' },
  { key: 'feature:programs-history-view', label: 'Feature: Programs — view history' },
  { key: 'feature:programs-start', label: 'Feature: Programs — start' },
  { key: 'feature:programs-step-continue', label: 'Feature: Programs — continue step' },
  { key: 'feature:practitioner-support-access', label: 'Feature: Practitioner — support access' },
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
