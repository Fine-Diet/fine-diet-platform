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
| `feature:nds-breakdown` | Breakdown view for daily NDS subscores (journal) | `offer`, `admin_grant` |
| `feature:plans-ai-generate` | AI-generated plan creation in the Plans lane | `offer`, `admin_grant` |
| `feature:plans-nds-projection` | Forward-looking projected daily NDS on plan days | `offer`, `admin_grant` |
| `feature:plans-nds-breakdown` | NDS breakdown on individual planned meals | `offer`, `admin_grant` |
| `feature:plans-nds-optimize` | NDS-aware plan optimizer / auto-tune | `offer`, `admin_grant` |
| `feature:plans-restaurant-analysis` | Restaurant / menu analysis and recommendations | `offer`, `admin_grant` |
| `feature:plans-recipe-video-import` | Recipe + video import into Plans | `offer`, `admin_grant` |
| `feature:plans-advanced-subs` | Advanced AI substitutions with NDS delta rationale | `offer`, `admin_grant` |
| `feature:plans-concierge` | Concierge / white-glove Plans tier | `offer`, `admin_grant` |

## Registry Keys (machine-checked)

<!-- This section is parsed by scripts/verifyEntitlementRegistry.ts.     -->
<!-- Each bullet must be a bare key: `- key`. Keep sorted alphabetically. -->

- feature:nds-breakdown
- feature:plans-advanced-subs
- feature:plans-ai-generate
- feature:plans-concierge
- feature:plans-nds-breakdown
- feature:plans-nds-optimize
- feature:plans-nds-projection
- feature:plans-recipe-video-import
- feature:plans-restaurant-analysis
- journal
- program:gut-check

## Adding New Keys

1. Add the key to the **Registry Keys (machine-checked)** list above AND to `lib/access/constants.ts` → `ENTITLEMENT_KEY_OPTIONS` in the same PR.
2. Run `npm run verify:entitlements` to confirm both sides match.
3. Add the key to the **Current Keys** table with a description and typical source.
4. Add enforcement logic in the relevant service (e.g. `hasEntitlement(personId, 'your-key')`).
5. Update any middleware or API guards that need to check the new key.
6. If the key should be grantable via an offer, add an `offer_entitlements` mapping.

## Compatibility Note

The `journal` entitlement key works alongside the legacy `subscriptions` table via the compatibility shim in `lib/access/accessService.ts#hasJournalAccess()`. This function checks `subscriptions` first, then falls back to `person_entitlements`. The legacy path will be removed once all users are migrated.
