# Offer Catalog

Offers represent purchasable (or manually granted) bundles that map to one or more entitlements.

## How Offers Work

```
Offer → offer_entitlements → person_entitlements (upon grant)
```

1. An **offer** is defined in the `offers` table with a unique `offer_key` and optional payment provider fields.
2. Each offer has one or more **entitlement mappings** in `offer_entitlements`, linking `offer_key` → `entitlement_key` with an optional `duration_days`.
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
