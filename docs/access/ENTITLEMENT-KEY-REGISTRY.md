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
| `program:baseline` | Access to the Baseline guided program; runtime enrollment still starts in `/app/programs` | `offer`, `admin_grant` |
| `care:integrative` | Access marker for Integrative Care purchases and fulfillment workflows | `offer`, `admin_grant` |
| `feature:nds-breakdown` | Breakdown view for daily NDS subscores (journal) | `offer`, `admin_grant` |
| `feature:plans-ai-generate` | AI-generated plan creation in the Plans lane | `offer`, `admin_grant` |
| `feature:plans-nds-projection` | Forward-looking projected daily NDS on plan days | `offer`, `admin_grant` |
| `feature:plans-nds-breakdown` | NDS breakdown on individual planned meals | `offer`, `admin_grant` |
| `feature:plans-nds-optimize` | NDS-aware plan optimizer / auto-tune | `offer`, `admin_grant` |
| `feature:plans-restaurant-analysis` | Restaurant / menu analysis and recommendations | `offer`, `admin_grant` |
| `feature:plans-recipe-video-import` | Recipe + video import into Plans | `offer`, `admin_grant` |
| `feature:plans-advanced-subs` | Advanced AI substitutions with NDS delta rationale | `offer`, `admin_grant` |
| `feature:plans-concierge` | Concierge / white-glove Plans tier | `offer`, `admin_grant` |

## App Subscription Capability Gates (app-marketing-offers-v1)

Granular capability gates for the Fine Diet app subscription surface. v1 deliberately uses the existing colon-style `feature:` convention (not a new dotted taxonomy) so the verifier/registry pattern is unchanged. These are mapped to access states in `lib/access/accessState.ts` (`subscriber`/`trialing` grant view + action gates; `data_access_only` grants view gates only; `practitioner` adds the practitioner gate). Final enforcement at each call site is staged; counts are placeholders.

A future dotted capability-gate taxonomy (e.g. `journal.entry.create`) may be considered later, but is intentionally NOT adopted in this pass.

| Key | Description |
|---|---|
| `feature:account-data-view` | View account + saved data (available in data_access_only) |
| `feature:billing-upgrade-view` | View billing/upgrade options |
| `feature:journal-entry-view-own` | View own journal entries |
| `feature:journal-entry-create` | Create journal entries (active tool) |
| `feature:insights-ai-generate` | Generate AI insights (active tool) |
| `feature:recipes-view-saved` | View saved recipes |
| `feature:recipes-save` | Save recipes (active tool) |
| `feature:recipes-import` | Import recipes (active tool) |
| `feature:meal-schedule-view` | View meal schedule |
| `feature:meal-schedule-create` | Create meal schedule (active tool) |
| `feature:grocery-list-view` | View grocery list |
| `feature:grocery-list-create` | Create grocery list (active tool) |
| `feature:pantry-item-view` | View pantry items |
| `feature:pantry-item-create` | Create pantry items (active tool) |
| `feature:assessments-start` | Start an assessment (active tool) |
| `feature:assessments-results-view-history` | View assessment results history |
| `feature:assessments-results-generate` | Generate assessment results (active tool) |
| `feature:programs-catalog-view` | View programs catalog |
| `feature:programs-history-view` | View programs history |
| `feature:programs-start` | Start a program (active tool) |
| `feature:programs-step-continue` | Continue a program step (active tool) |
| `feature:practitioner-support-access` | Practitioner-supported premium access |

## Registry Keys (machine-checked)

<!-- This section is parsed by scripts/verifyEntitlementRegistry.ts.     -->
<!-- Each bullet must be a bare key: `- key`. Keep sorted alphabetically. -->

- care:integrative
- feature:account-data-view
- feature:assessments-results-generate
- feature:assessments-results-view-history
- feature:assessments-start
- feature:billing-upgrade-view
- feature:grocery-list-create
- feature:grocery-list-view
- feature:insights-ai-generate
- feature:journal-entry-create
- feature:journal-entry-view-own
- feature:meal-schedule-create
- feature:meal-schedule-view
- feature:nds-breakdown
- feature:pantry-item-create
- feature:pantry-item-view
- feature:plans-advanced-subs
- feature:plans-ai-generate
- feature:plans-concierge
- feature:plans-nds-breakdown
- feature:plans-nds-optimize
- feature:plans-nds-projection
- feature:plans-recipe-video-import
- feature:plans-restaurant-analysis
- feature:practitioner-support-access
- feature:programs-catalog-view
- feature:programs-history-view
- feature:programs-start
- feature:programs-step-continue
- feature:recipes-import
- feature:recipes-save
- feature:recipes-view-saved
- journal
- program:baseline
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
