# Entitlement Key Registry

This document defines the reserved entitlement keys used in the `person_entitlements` table and enforced by `lib/access/accessService.ts`.

## Naming Rules

- **Lowercase only** — all keys are stored and compared in lowercase.
- **Colon separators** — use colons to create namespaced keys (e.g. `program:gut-check`).
- **No spaces** — use hyphens for multi-word segments.
- **Keep it short** — keys are meant for programmatic lookups, not display names.

## Reserved Key Patterns

| Pattern | Purpose | Example |
|---|---|---|
| `journal` | Core journal access | `journal` |
| `program:<slug>` | Access to a specific program | `program:gut-check` |
| `feature:<slug>` | Access to a specific feature | `feature:nds-breakdown` |

## Current Keys

| Key | Description | Typical Source |
|---|---|---|
| `journal` | Full journal access (entries, meals, goals, NDS, history, repeat) | `offer`, `admin_grant`, legacy `subscriptions` compat shim |

## Adding New Keys

1. Add the key to this table with a description and typical source.
2. Add enforcement logic in the relevant service (e.g. `hasEntitlement(personId, 'your-key')`).
3. Update any middleware or API guards that need to check the new key.
4. If the key should be grantable via an offer, add an `offer_entitlements` mapping.

## Compatibility Note

The `journal` entitlement key works alongside the legacy `subscriptions` table via the compatibility shim in `lib/access/accessService.ts#hasJournalAccess()`. This function checks `subscriptions` first, then falls back to `person_entitlements`. The legacy path will be removed once all users are migrated.
