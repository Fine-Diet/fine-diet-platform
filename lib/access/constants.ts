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
 * The admin UI offers these as suggestions but still allows free-text entry.
 */
export const ENTITLEMENT_KEY_OPTIONS: EntitlementKeyOption[] = [
  { key: 'journal', label: 'Journal — full journal access' },
  { key: 'program:gut-check', label: 'Program: Gut Check' },
  { key: 'feature:nds-breakdown', label: 'Feature: NDS Breakdown' },
];

/** Just the key strings, for quick lookups */
export const KNOWN_ENTITLEMENT_KEYS: string[] = ENTITLEMENT_KEY_OPTIONS.map((o) => o.key);

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
