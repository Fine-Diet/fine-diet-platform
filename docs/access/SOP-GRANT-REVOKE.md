# SOP: Granting & Revoking Access

Standard operating procedures for managing user entitlements, offers, and access links through the admin interface.

## Prerequisites

- You must have an `editor` or `admin` role.
- Navigate to the admin panel at `/admin`.

---

## 1. Granting Journal Access via Entitlements

Use this when you need to grant a single entitlement to a specific person.

### Steps

1. Go to **Admin Dashboard → Entitlements** (`/admin/entitlements`).
2. In the **Find a Person** search box, type the user's email or name.
3. Select the person from the dropdown results.
4. Their current entitlements will load in a table below.
5. In the **Grant New Entitlement** form:
   - **Entitlement Key**: Enter `journal` (or the appropriate key from the [Key Registry](./ENTITLEMENT-KEY-REGISTRY.md)).
   - **Source**: Leave blank for default `admin_grant`, or enter a custom source.
   - **Starts At**: Leave blank for immediate start, or pick a future date.
   - **Ends At**: Leave blank for perpetual access, or pick an expiry date.
   - **Note**: Optional — add context (e.g. "Comp access for beta tester").
6. Click **Grant Entitlement**.
7. The entitlement appears in the table above immediately.

---

## 2. Granting Access via an Offer

Use this when you want to grant a bundle of entitlements (e.g. journal + program access) at once.

### Steps

1. Go to **Admin Dashboard → Offers & Bundles** (`/admin/offers`).
2. Find the offer you want to grant in the table (e.g. `journal-monthly`).
3. Click the **Grant** button on that offer's row.
4. A person search field appears below the row.
5. Type the user's email or name, then click **Grant** next to their name.
6. The system creates `person_entitlements` rows for each active entitlement mapping in the offer:
   - With `source = 'offer'` and `source_ref = <offer_key>`.
   - With `ends_at` calculated from `duration_days` if set.
7. A success message confirms how many entitlements were granted (and how many were skipped as duplicates).

---

## 3. Creating a Staff Access Link

Use this to allow a staff member or coach to view a client's journal data.

### Steps

1. Go to **Admin Dashboard → Access Links** (`/admin/access-links`).
2. In **Client (Granter)**, search for the client whose data should be viewable.
3. In **Staff/Coach (Grantee)**, search for the staff member who needs read access.
4. Existing links between the selected people (if any) will appear in the table.
5. In the **Create New Access Link** form:
   - **Scope**: Select `journal_read` (default) for read-only journal access.
   - **Starts At**: Leave blank for immediate start.
   - **Ends At**: Leave blank for perpetual, or set an expiry.
   - **Note**: Optional context.
6. Click **Create Access Link**.
7. The staff member can now view the client's journal data via `?person_id=<client_person_id>` on journal API endpoints.

### Important Notes

- The staff member does **not** need their own `journal` entitlement to view client data.
- The **client** must have an active `journal` entitlement (or legacy subscription) for the access link to work.
- Only `GET` (read) operations are allowed via access links. Write operations remain self-only.

---

## 4. Revoking an Entitlement

### Steps

1. Go to **Admin Dashboard → Entitlements** (`/admin/entitlements`).
2. Search for and select the person.
3. In the entitlements table, find the row to revoke.
4. Click the **Revoke** button.
5. The system handles revocation based on the entitlement type:
   - **Perpetual** (no `ends_at`): Sets `is_active = false`.
   - **Time-limited** (has `ends_at`): Sets `ends_at = now()` to expire immediately.

---

## 5. Revoking an Access Link

### Steps

1. Go to **Admin Dashboard → Access Links** (`/admin/access-links`).
2. Search for the client or staff member involved.
3. Find the link in the existing links table.
4. Click the **Revoke** button.
5. The link is set to `is_active = false`. The staff member immediately loses view access.

---

## 6. Adding a New Entitlement Key

When introducing a new entitlement key (e.g. `program:new-program`):

1. Add the key to **both** places in the same PR:
   - `docs/access/ENTITLEMENT-KEY-REGISTRY.md` → **Registry Keys (machine-checked)** bullet list
   - `lib/access/constants.ts` → `ENTITLEMENT_KEY_OPTIONS` array
2. Run `npm run verify:entitlements` locally to confirm they match.
3. CI also runs this check — the PR will fail if the two sources are out of sync.
