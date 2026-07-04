# Access Code Gate Module (`access.code-gate.v1`)

An Access Code Gate module that lets visitors enter an access code to reveal a
safe next-step CTA. It is available across `/start`, `/programs`, and
`/integrative-care` through the shared module registry pattern, mirroring
`lead.waitlist-capture.v1`.

## Hard boundaries

This module owns ONLY the access-code entry UX and the frontend-safe
verification call. It must NOT:

- change billing, checkout, Stripe, price-option, trial, entitlement, or offer truth
- activate or modify checkout flows
- grant access or mutate entitlements **at verify time** (offer-attached codes
  create a short-lived claim/intent instead; the grant happens later, only
  after a known person is resolved — see "Offer-attached claim flow" below)
- implement broad page-level middleware gating (no server access enforcement in this pass)
- store or return plaintext access codes
- expose backend internals (code IDs, hashes, redemption counts, claim-token
  hashes, internal grant errors) in frontend error states

On success it renders configured success copy and a safe relative CTA only.

## Module registration path

The module follows the same shared registry pattern as `lead.waitlist-capture.v1`:

- Type key: `access.code-gate.v1`
- Human label: `Access Code Gate` (taxonomy in `lib/startPages/startRuntimeModules.ts`)
- Component: `components/modules/AccessCodeGateV1.tsx` (registered in `lib/modules/registry.ts`)
- Zod schema: `accessCodeGateV1Schema` in `lib/modules/schema.ts` (registered in `MODULE_CONTENT_SCHEMAS` and the `moduleTypeKeySchema` enum)
- TypeScript content interface: `AccessCodeGateV1Content` in `lib/modules/types.ts` (registered in `ModuleContentMap`)
- Field descriptors: `lib/modules/fieldDescriptors.ts`
- Starter content: `createAccessCodeGateStarterContent` in `lib/startPages/startRuntimeModules.ts`
- Start-safe allowlist: `START_RUNTIME_MODULE_TYPE_KEYS` (same file)
- Recommended zones: `beforePricing`, `afterPricing`, `beforeFinalCta`, `afterHero`

Because the Programs and Integrative Care composition editors derive their
module lists from `MODULE_REGISTRY` and group shared-pathway modules via
`START_RUNTIME_MODULE_TYPE_KEYS`, adding the module to both lists surfaces it
in all three builders with no per-builder edits.

## Content contract

```ts
{
  variant: "simple" | "private_offer" | "cohort",
  eyebrow: "Private access",
  title: "Enter Your Access Code",
  description: "Enter the code you received to unlock access.",
  codeLabel: "Access code",
  codePlaceholder: "Enter Access Code",
  collectEmail: false,
  emailLabel: "Email",
  emailPlaceholder: "you@example.com",
  ctaLabel: "Unlock Access",
  submittingLabel: "Checking code...",
  successTitle: "Access unlocked.",
  successBody: "You can continue from here.",
  successCtaLabel: "Continue",
  successCtaHref: "#pricing",
  invalidMessage: "That code does not look valid. Check it and try again.",
  expiredMessage: "That code is no longer active.",
  helpText: "We respect your privacy. We don't store or share codes.",
  source: "start_access_code_gate",
  campaignKey: "access_code_gate_v1",
  startPageSlug: null,
  programSlug: null,
  productSlug: null,
  offerKey: null,
  codeKey: null,
  // Banded presentation (all optional):
  layout: "banded",
  backgroundTone: "blue",
  railEnabled: true,
  railText: "ENTER ACCESS CODE",
  anchorId: "access-code"
}
```

`variant` is a presentation hint only. Validation behavior is identical across
variants; backend scope/context matching is configured per code, not per variant.

`codeKey` is the non-secret selector for the access code this gate is bound to.
Editors pick it from the Access Codes Manager via the module builder's
access-code selector — it is the `code_key` of an `access_codes` row, NEVER the
raw code. Raw codes are never stored in module config (or anywhere in the DB).

Additive presentation fields (all optional, see "Visual presentation"):
`layout`, `backgroundTone`, `railEnabled`, `railText`, `anchorId`. These do not
affect verification or claim/grant behavior.

## Client validation

- `accessCode` is required before submit (normalized with trim + uppercase).
- If `collectEmail` is true, a valid email is required before submit.
- Backend errors render the configured `invalidMessage` / `expiredMessage` /
  fallback copy only. Internal details are never surfaced.

## Backend endpoint

`POST /api/access-codes/verify` (`app/api/access-codes/verify/route.ts`)

Request:

```ts
{
  code: string,              // normalized client-side (trim + uppercase)
  email?: string,            // required by the module only when collectEmail=true
  source?: string,
  source_path?: string,
  redirect_path?: string,    // safe relative URL only
  startPageSlug?: string,
  programSlug?: string,
  productSlug?: string,      // Integrative Care product slug
  offerKey?: string,
  campaignKey?: string,
  codeKey?: string           // non-secret code_key selector (bound code)
}
```

Response (frontend-safe only):

```ts
// success
{ ok: true, status: "valid", redirectPath?: string }

// failure
{ ok: false, status: "invalid" | "expired" | "paused" | "limit_reached", message: string }
```

The endpoint never returns internal code IDs, hashes, redemption counts, or
sensitive metadata. On success it increments `redemption_count`, inserts an
`access_code_redemptions` row, and links `person_id` ONLY if the supplied
email already matches an existing person — people rows are never created
silently. It does not grant entitlements, mutate access, or call checkout.

For codes that carry an `offer_key`, the verify endpoint additionally creates
a short-lived `access_code_claims` row (status `pending`) and returns an
opaque, one-time `claimToken` in the success response. The claim token is a
bearer credential — it is NOT the access code. Only its HMAC hash
(`claim_token_hash`) is stored. The raw token is never put in a URL by the
server.

```ts
// success — offer-attached code
{ ok: true, status: "valid", claimToken: "<opaque bearer token>", redirectPath?: string }

// success — no offer attached
{ ok: true, status: "valid", redirectPath?: string }
```

## Offer-attached claim flow

```
verify (anonymous)
  → validate code, increment redemption_count, insert access_code_redemptions
  → if code has offer_key: insert access_code_claims (pending) + return claimToken
  → NO people creation, NO entitlement grant here

client stores claimToken in localStorage (NOT the access code)
  → success CTA routes to /create-account (or /login) when no explicit CTA
  → user creates account / logs in
  → /api/account/link-person resolves the known person

claim (authenticated) — POST /api/access-codes/claim
  → authenticate via session cookie
  → resolve known people row (by auth_user_id, fallback email); refuse if none
  → hash claimToken → look up access_code_claims
  → enforce email binding when the claim captured an email
  → grant offer entitlements via the shared offerGrantService:
        offer_entitlements → person_entitlements (source='offer', source_ref=offer_key)
        + program_assignments automation
  → mark claim granted (idempotent; already-granted is a safe no-op)
```

Hard rules for the claim flow:

- People rows are NEVER created by verify or claim. `link-person` already did
  that at signup/login.
- Entitlements are NEVER granted without an authenticated, known person.
- Raw access codes are never stored anywhere; claim tokens are stored only as
  HMAC hashes.
- The client stores the claim token (not the access code) in localStorage; the
  server never puts it in a URL.
- `claim_token_hash`, `access_code_id`, redemption counts, and internal grant
  errors are never returned to public clients. The claim endpoint returns
  minimal safe responses only.
- The grant uses the `offer_key` attached to the `access_codes` row; the
  offer defines its grants through `offer_entitlements`, and the resolved
  person receives `person_entitlements`.

### Claim endpoint: `POST /api/access-codes/claim`

Request (authenticated via session cookie):

```ts
{ claimToken: string }
```

Public responses (safe only):

```ts
{ ok: true, status: "granted" }            // 200 — granted or already-granted
{ ok: true, status: "nothing_to_grant" }   // 200 — offer has no active mappings
{ ok: false, status: "error" }             // 401 not authed | 403 email mismatch | 404 claim/person not found | 410 expired | 500 transient
```

The client helper `lib/access/claimAccessCodeOffer.ts` returns a safe
`AccessCodeClaimClientResult` (`status` is one of `no_claim`, `granted`,
`nothing_to_grant`, `expired`, `email_mismatch`, `claim_not_found`,
`person_not_ready`, `retryable_error`, `failed`). It clears the stored token
on terminal outcomes (`granted`, `nothing_to_grant`, `expired`,
`email_mismatch`, `claim_not_found`, non-retryable `failed`) and keeps it on
retryable outcomes (`person_not_ready` = 401, `retryable_error` = 5xx /
network) so a later auth/retry can still claim. It never throws and never
exposes internal grant errors.

`LoginForm` and `SignupForm` consume the returned status and do NOT silently
fail open. For terminal-but-failed statuses (`expired`, `email_mismatch`,
`claim_not_found`, `failed`) they set a clean, non-sensitive error message
and skip the redirect to the protected/unlocked target — the user stays
logged in but in place. `granted`, `nothing_to_grant`, `no_claim`,
`person_not_ready`, and `retryable_error` continue the normal redirect
(`person_not_ready` / `retryable_error` keep the token for a later retry).

Example copy:

- expired: "That access link expired. Please re-enter your access code."
- email_mismatch: "That access code was started with a different email. Please re-enter the code using this account's email."
- claim_not_found / failed: "We could not finish unlocking this offer. Please re-enter your access code or contact support."

The claim token is localStorage-only and is NEVER put in a URL. For
offer-claim codes that default to account creation, `AccessCodeGateV1` builds
`/create-account?intent=signup&ctx=marketing&redirect=<encoded safe relative
target>` — the redirect target is `content.successCtaHref` only when it is a
safe relative path (starts with `/`, not `//`, not `#pricing`); otherwise it
falls back to `/account/start`. The claim token itself stays in localStorage
for the post-auth claim helper to redeem.

### Social/OAuth gap (known future work)

Email login and email signup claim the pending token in-form. Social (Apple/
Google) sign-in goes through `/auth/callback` and does not run the in-form
claim step, so an offer-attached claim for a social user is not redeemed in
this pass. The token remains in localStorage and can be redeemed on a
subsequent email login, or via a future post-auth landing hook. This mirrors
the existing assessment-claim gap and is out of scope here.

## SQL migration

`scripts/sql/createAccessCodeGateV1.sql` — additive only. Creates:

- `public.access_codes` — `code_hash` (HMAC) unique, `status` (`draft` / `active` / `paused` / `expired`), `scope` (`global` / `start_page` / `program` / `integrative_care` / `offer`), scoped slug/offer fields (null = wildcard), `max_redemptions`, `redemption_count`, `valid_from`, `expires_at`, `metadata`, timestamps. RLS enabled; service role + admin/editor policies.
- `public.access_code_redemptions` — append-only; `access_code_id`, `person_id` (nullable, FK to `people`), `email`, `source`, `context` jsonb, `redeemed_at`. RLS enabled; service role full, admin/editor read.

Run in the Supabase SQL Editor. No plaintext seed codes are inserted.

## Security requirements

- Codes are never stored or returned as plaintext.
- Submitted codes are normalized with trim + uppercase (matching the future code-generation tooling).
- Verification uses a deterministic server-side HMAC-SHA-256 digest with the placeholder env var `ACCESS_CODE_HASH_SECRET` (Node `crypto.createHmac`). Comparison is against `access_codes.code_hash`.
- `ACCESS_CODE_HASH_SECRET` must be set in the server environment before any real codes are generated. No real secret values are committed to the repo.

## Validation logic

A code is valid only if:

- `status` is `active`
- `valid_from` is null or `<= now`
- `expires_at` is null or `> now`
- scope/context matches when scoped fields are set (a null scoped field is a wildcard for that dimension). Scope dimensions are `start_page_slug`, `program_slug`, `product_slug`, `offer_key`, and `code_key`. `code_key` is matched against the request's `codeKey` pass-through, binding a gate to the specific code selected in the builder.
  - **`offer_key` is the GRANT ATTACHMENT source, not a required module mirror.** The access-code row's `offer_key` is used purely as the offer to grant at claim time. It is treated as a scope constraint ONLY when the access-code row is explicitly scoped to offer (`scope === 'offer'`). In every other scope, the module's separate `offerKey` field is context only — the module builder selector writes `codeKey`, and editors are NOT required to also fill `offerKey` to match the access code's attached offer. Marketing's intended workflow is: `/admin/access-codes` attaches `offer_key` → module builder selects `codeKey` → verify validates code + `codeKey` + page/program/product scope → the access code's `offer_key` becomes the grant attachment source.
- `max_redemptions` is null or `redemption_count < max_redemptions`

On success: increment `redemption_count`, insert `access_code_redemptions`,
link `person_id` if the email matches an existing person (otherwise leave
`person_id` null and store email only), and never create people rows silently.
The redemption `context` records both `moduleOfferKey` (the module's optional
context field) and `accessCodeOfferKey` (the offer attached to the
access-code row, i.e. the grant attachment source) so the two are never
ambiguous in audit data.

## Admin Access Codes Manager (`/admin/access-codes`)

The admin manager is where codes are created and lifecycle-managed. It is
protected by the same middleware + SSR guard as `/admin/offers` (editor | admin).

Capabilities:

- list codes (with status / scope filters and search)
- create a code from a raw code entered by an authenticated admin/editor
- edit code metadata, scope, scoped slugs, redemption limits, dates, and offer attachment
- activate / pause / expire / archive a code
- view redemptions for a code
- (optionally) re-key a code with a new raw code

Creation flow hard rules:

- The server normalizes the raw code with trim + uppercase, then hashes it with `ACCESS_CODE_HASH_SECRET` (HMAC-SHA-256) via the shared `lib/access/accessCodeHash.ts` helper.
- Only the hash/digest and non-secret metadata are stored. The raw code is NEVER persisted.
- The digest (`code_hash`) is NEVER returned to any client, admin included.
- The admin UI warns: "Raw codes are only known at creation time. Store the code in the campaign brief or password manager if needed. Fine Diet will not show it again."

Admin API family (`pages/api/admin/access-codes/*`, all protected editor | admin):

- `GET /api/admin/access-codes/list` — admin-safe code rows (never `code_hash`)
- `GET /api/admin/access-codes/options` — frontend-safe slim list for the module builder selector (`code_key`, `label`, `status`, `offer_key`; active + draft only; no IDs/hashes)
- `POST /api/admin/access-codes/create` — normalize + hash + store; never returns the digest
- `POST /api/admin/access-codes/update` — update metadata/status/scope/limits/dates/offer; optional re-key
- `POST /api/admin/access-codes/status` — set status (draft | active | paused | expired | archived)
- `GET /api/admin/access-codes/redemptions` — redemptions for a code (by `id` or `code_key`)

## Module builder access-code selector

The Access Code Gate module builder field for `codeKey` uses a dynamic
`access-code-select` field type (rendered in `components/admin/ModuleFieldEditor.tsx`)
that is populated from `GET /api/admin/access-codes/options`. Editors see and
select a code by label + `code_key` — never the raw code. Paused, expired, and
archived codes are intentionally hidden from the selector. A previously-bound
`codeKey` that is no longer selectable is preserved on edit (with a warning)
rather than silently dropped.

## Code generation / hash creation

Code creation is performed by the Admin Access Codes Manager via
`POST /api/admin/access-codes/create`. It reuses the shared
`lib/access/accessCodeHash.ts` helper so creation and verification can never
drift. The helper:

- normalizes the code with trim + uppercase before hashing
- computes `code_hash` with the same `ACCESS_CODE_HASH_SECRET` and HMAC-SHA-256
- stores `code_hash` and the non-secret `code_key` (plus label/metadata), never the plaintext code

## SQL migration

`scripts/sql/createAccessCodeGateV1.sql` — additive only. Creates:

- `public.access_codes` — `code_hash` (HMAC) unique, `code_key` (non-secret selector, unique), `status` (`draft` / `active` / `paused` / `expired`), `scope` (`global` / `start_page` / `program` / `integrative_care` / `offer`), scoped slug/offer fields (null = wildcard), `max_redemptions`, `redemption_count`, `valid_from`, `expires_at`, `metadata`, timestamps. RLS enabled; service role + admin/editor policies.
- `public.access_code_redemptions` — append-only; `access_code_id`, `person_id` (nullable, FK to `people`), `email`, `source`, `context` jsonb, `redeemed_at`. RLS enabled; service role full, admin/editor read.

`scripts/sql/updateAccessCodesAddArchivedStatus.sql` — extends the `access_codes.status` CHECK to include `archived` so the admin manager can archive a code without deleting it. Additive: only the CHECK constraint is replaced.

`scripts/sql/createAccessCodeClaimsV1.sql` — additive only. Creates:

- `public.access_code_claims` — short-lived offer-attached claim/intent. `claim_token_hash` (HMAC of the raw bearer token) unique, `offer_key`, optional `email`/`redirect_path`/`source`, `context` jsonb, `status` (`pending` / `claimed` / `granted` / `expired` / `failed`), `expires_at`, `claimed_at`, `granted_at`, `person_id` (FK to `people`, set null on delete), `grant_summary` jsonb, `grant_error`, timestamps. RLS enabled; service role full, admin/editor read. No public read/insert. Raw claim tokens are never stored.

Run all three in the Supabase SQL Editor. No plaintext seed codes are inserted.

## SQL migration (offer-attached claims)

The `access_code_claims` table is created by
`scripts/sql/createAccessCodeClaimsV1.sql` (see above). The base
`access_codes` / `access_code_redemptions` migration
(`createAccessCodeGateV1.sql`) and the archived-status extension
(`updateAccessCodesAddArchivedStatus.sql`) are prerequisites and have already
been applied to live Supabase. Run `createAccessCodeClaimsV1.sql` in the
Supabase SQL Editor before runtime testing the offer-grant flow.

## Visual presentation (banded layout)

The module supports an optional prototype `banded` presentation via the shared
`ConversionBandShell` (`components/modules/shared/ConversionBandShell.tsx`).
The banded style is opt-in and fully backward compatible — existing authored
modules without the new fields render unchanged in the legacy single-column
style.

Banded fields (all optional; group: "Banded layout" in the module builder):

- `layout` — `'banded'` opts into the prototype band. Omitted / `'standard'` =
  legacy style. **New modules default to `'banded'`** via starter content.
- `backgroundTone` — `'blue'` = pale denim band (prototype). `'cream'` /
  `'default'` = legacy brand-50 cream. New modules default to `'blue'`.
- `railEnabled` — show the top repeating label rail. Defaults to on in the
  banded layout.
- `railText` — top rail label. Defaults to `ENTER ACCESS CODE` when blank.
- `anchorId` — rendered as `<section id="…">` so page CTAs / nav can scroll to
  the band. Sanitized to a safe HTML id slug. Recommended marketing values:
  `access-code`, `private-access`. Link with `#access-code`, etc.

Banded rendering (matches the supplied prototype screenshot):

- Full-width pale blue (`bg-denim-900`) section framed by a thin top border
  (`border-t border-brand-900/10`) and a thick bottom break line
  (`border-b-8 border-brand-900`) that closes the module before the next page
  section.
- Top horizontal repeating rail: `ENTER ACCESS CODE` (the rail also has its own
  thin bottom border separating it from the content).
- Centered content (`max-w-2xl`): eyebrow, centered title, centered description.
- Large rounded light input pill (full width within the form, centered).
- Wide dark rounded pill CTA (`rounded-full bg-brand-900`).
- Help / privacy copy beneath the CTA.
- Success state reuses the same banded shell (not a separate card style).

### Hard boundaries (unchanged by the visual update)

The visual update does NOT change any verify / claim / grant behavior:

- The module still owns ONLY access-code entry UX + frontend-safe verification.
- It still posts to `POST /api/access-codes/verify` with the same payload.
- Standard non-offer code success still shows success state + configured CTA.
- Offer-attached code success still stores the claim token in localStorage and
  routes to `/create-account` safely; the claim token is NEVER put in the URL.
- The grant still happens later, only after a known person is resolved
  (`verify → claim token → account/login → known person → offer grant`).
- Invalid / expired / paused / limit_reached messages are preserved.

### Anchor / CTA behavior

When `anchorId` is set, the section renders with that id. Any page CTA or nav
link (e.g. `#access-code`) scrolls to the module. The module itself does not
care whether the visitor arrived from pricing, product selection, or a direct
anchor — no checkout logic is added. If `anchorId` is omitted, no id is
rendered (preserving the legacy no-anchor behavior).

On Start pages, the hero / final-CTA buttons can be redirected to this section
via `config.hero.primaryCta` / `config.finalCta.primaryCta` (`{ label, href }`)
in the Start Page admin editor — e.g. `href: #access-code`. See
`docs/design/START-PAGE-MODULE-BUILDER.md`. The CTA override is presentation
only; it does not change verify/claim/grant behavior.

## Known future work

- Hardened atomic redemption (Postgres function with row lock) to remove the concurrent-increment race window. No real codes are seeded yet, so the window is not exploitable today.
- Full page/server access enforcement (e.g. middleware or SSR gating driven by a verified code), only if a clear existing access-policy layer supports it. Not implemented in this pass.
- Social/OAuth claim redemption: redeem a pending access-code claim in `/auth/callback` (or a post-auth landing hook) so offer-attached codes granted via Apple/Google sign-in complete without an email-login step.
- Admin reporting surface for `access_code_claims` (claim lifecycle / grant audit) — the table is RLS-readable by admin/editor today but no admin UI exposes it yet.
