# Offer Catalog

Offers represent purchasable (or manually granted) bundles that map to one or more entitlements.

## How Offers Work

```
Offer → offer_entitlements → person_entitlements (upon grant)
```

1. An **offer** is defined in the `offers` table with a unique `offer_key` and optional payment provider fields.
2. Each offer has one or more **entitlement mappings** in `offer_entitlements`, linking `offer_key` → `entitlement_key` with an optional `duration_days`.
   - Packet 20 also defines a code-owned safety supplement for `journal-annual`: it must grant `journal` and `program:baseline` even if those database mappings are missing. Database mappings still win when present, including their `duration_days`.
   - Packet 25 keeps the bundle model explicit: one offer can grant multiple active entitlement keys. Active mappings should use registered keys only; unknown historical keys should remain inactive unless they are added to the registry.
3. When an offer is **granted** to a person (via admin UI or future checkout flow), a `person_entitlements` row is created for each active mapping:
   - `starts_at` = now
   - `ends_at` = now + `duration_days` (if set; otherwise perpetual)
   - `source` = `'offer'`
   - `source_ref` = the `offer_key`

## Example Offers

### `journal-monthly`

| Field | Value |
|---|---|
| **offer_key** | `journal-monthly` |
| **name** | Journal Monthly Access |
| **description** | 30 days of journal access |
| **is_active** | `true` |
| **purchase_provider** | `stripe` (future) |

**Entitlement mappings:**

| entitlement_key | duration_days |
|---|---|
| `journal` | `30` |

### `journal-annual`

Used by public Baseline marketing CTAs until Baseline has a standalone offer.

**Required entitlement mappings after Packet 20:**

| entitlement_key | duration_days |
|---|---|
| `journal` | existing database duration, or `NULL` from the code-owned supplement |
| `program:baseline` | existing database duration, or `NULL` from the code-owned supplement |

### `gut-check-bundle`

| Field | Value |
|---|---|
| **offer_key** | `gut-check-bundle` |
| **name** | Gut Check Bundle |
| **description** | Journal access + Gut Check program |
| **is_active** | `true` |

**Entitlement mappings:**

| entitlement_key | duration_days |
|---|---|
| `journal` | `90` |
| `program:gut-check` | `90` |

### `integrative-care-3pay`

| Field | Value |
|---|---|
| **offer_key** | `integrative-care-3pay` |
| **name** | Integrative Care (3 Installments) |
| **is_active** | `true` |

**Entitlement mappings:**

| entitlement_key | duration_days |
|---|---|
| `care:integrative` | `NULL` |

### Future Fine Diet Method Bundle

Future program bundles should stay data-driven by adding multiple `offer_entitlements` rows to a single offer instead of adding custom checkout or grant logic.

**Example entitlement mappings:**

| entitlement_key | duration_days |
|---|---|
| `program:baseline` | `NULL` |
| `program:digestive-foundations` | `NULL` |
| `program:protein-sufficiency` | `NULL` |

## Provider Fields

These fields support future integration with payment providers:

| Field | Description |
|---|---|
| `purchase_provider` | The payment platform (e.g. `stripe`, `square`, `manual`) |
| `provider_product_id` | The product/price ID from the provider (e.g. `prod_xxx`, `price_xxx`) |

These are stored for reference and will be used by the checkout flow when implemented.

## Managing Offers

- **Admin UI**: `/admin/offers` — create/edit offers, manage entitlement mappings, grant to users.
- **API**: See `pages/api/admin/offers/` for upsert, set-active, set-entitlements, and grant-to-person endpoints.
