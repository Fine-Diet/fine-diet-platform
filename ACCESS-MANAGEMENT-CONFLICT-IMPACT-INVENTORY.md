# Fine Diet — Access Management / Offers-Bundles — Conflict & Impact Inventory

**Goal:** Audit-only report before adding Entitlements v1, Staff Access Links v1, and Offers/Bundles v1. No code or migration changes.

**Constraints:** Next.js Pages Router only; Supabase source of truth with RLS deny-by-default; additive DB only; no breaking changes to journal flows; separate Role / Entitlement / Relationship; compat shim for `subscriptions(subscription_type='journal_access')` must be maintained.

---

## 1) People + Identity resolution

### Where is person_id resolved from auth.uid()?

- **Path:** `lib/journal/journalServerService.ts`  
  **Function:** `getPersonIdFromAuthUserId(authUserId: string): Promise<string | null>`  
  Looks up `people.id` where `people.auth_user_id = authUserId` via `supabaseAdmin.from('people').select('id').eq('auth_user_id', authUserId).maybeSingle()`.

```typescript
// lib/journal/journalServerService.ts (excerpt)
export async function getPersonIdFromAuthUserId(authUserId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('people')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  // ...
  return data?.id ?? null;
}
```

- **Path:** `middleware.ts`  
  Resolves **person** (not cached) for journal gating: `supabaseAdmin.from('people').select('id').eq('auth_user_id', user.id).maybeSingle()` (user.id = auth.uid() from auth server). No `person_id` stored on request/session.

- **Path:** `app/api/account/link-person/route.ts`  
  Links `auth.users.id` to `people`: finds person by email or creates one, sets `people.auth_user_id`; also ensures `profiles` row for role. Does not store person_id on session.

### Is person_id stored on requests/session? Any caching?

- **No.** `person_id` is not stored on request or session. Every API route that needs it calls `getPersonIdFromAuthUserId(user.id)` (or middleware does a fresh DB lookup). No in-memory or cookie caching of person_id found.

### Canonical tables: people, profiles, subscriptions — schemas / TypeScript

**people** (`scripts/createPeopleSystemTables.sql`):

- `id` UUID PK, `email` TEXT NOT NULL, `first_name`, `last_name`, `phone`, `status` (CHECK: marketing_only, waitlist, active_user, inactive_user, unsubscribed, blocked), `auth_user_id` UUID REFERENCES auth.users(id), `metadata` JSONB, `created_at`, `updated_at`, plus UTM/opt-in fields.
- Indexes: `idx_people_email_lower`, `idx_people_auth_user_id`, `idx_people_status`.

**profiles** (`scripts/createProfilesTable.sql`):

- `id` UUID PK REFERENCES auth.users(id) ON DELETE CASCADE, `role` TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','editor','admin')), `updated_at`.
- Index: `idx_profiles_role`.

**subscriptions** (`scripts/createPeopleSystemTables.sql`):

- `id` UUID PK, `person_id` UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE, `subscription_type` TEXT NOT NULL CHECK (IN ('email_marketing','product_updates','program_waitlist','journal_access')), `program_slug` TEXT, `is_active` BOOLEAN NOT NULL DEFAULT true, `created_at`, `updated_at`.
- Unique index: `idx_subscriptions_unique` ON (person_id, subscription_type, COALESCE(program_slug, '')).
- Index: `idx_subscriptions_active` ON (person_id, subscription_type, is_active).

**TypeScript:** `lib/peopleService.ts` exports `Person`, `SubscriptionType` ('journal_access' | …), `EnsureSubscriptionArgs`. `lib/authServer.ts` exports `AuthenticatedUser` (id, email, role) where `id` is auth user id, not person_id.

### Least-change integration

- Keep `getPersonIdFromAuthUserId` as single source of truth for auth → person. For "view as client" (access links), add a separate resolution path (e.g. resolve "acting person" from link token) that still ends in a `person_id` so existing journal APIs need not change signature.

---

## 2) Role model (profiles.role)

### Where roles are enforced

**Middleware** (`middleware.ts`):

- For `/admin/*`: requires authenticated user from `getCurrentUserWithRoleFromMiddleware(request)`.
- `/admin/people`: only `user.role === 'admin'` allowed; else redirect to `/admin`.
- Other `/admin/*`: only `user.role === 'editor' || user.role === 'admin'`; else redirect to `/`.

```typescript
// middleware.ts (excerpt)
if (pathname.startsWith('/admin/people')) {
  if (user.role !== 'admin') {
    url.pathname = '/admin';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
if (user.role !== 'editor' && user.role !== 'admin') {
  url.pathname = '/';
  return NextResponse.redirect(url);
}
```

**Server guards (getServerSideProps):** All under `pages/admin/*.tsx` use `getCurrentUserWithRoleFromSSR(context)` then:

- **Admin-only:** `user.role !== 'admin'` → redirect to login or `/admin/unauthorized`:  
  `global.tsx`, `config/feature-flags.tsx`, `config/avatar-mapping.tsx`, `config/assessments/gut-check-v1.tsx`, `config/assessments/gut-check-v2.tsx`, `seo/index.tsx`, `seo/robots.tsx`, `seo/assets.tsx`, `home.tsx`, `footer.tsx`, `navigation.tsx`, `products/index.tsx`, `products/[slug]/hero.tsx`, `waitlist.tsx`, `assets/index.tsx`, `outbox.tsx`, `people.tsx` (and debug-auth).
- **Editor or admin:** `user.role !== 'editor' && user.role !== 'admin'` → redirect:  
  `index.tsx`, `site-settings/index.tsx`, `foods/*` (index, new, [id], import, merge with admin-only for merge), `assessments/index.tsx`, `results-packs/*`, `question-sets/*`, `waitlist-signups.tsx`.

**API routes:** Use `requireRoleFromApi(req, res, ['admin'])` or `requireRoleFromApi(req, res, ['admin','editor'])` or `requireRole(req, res, ['admin'|'editor'])` from `lib/resultsPack/requireRole.ts`. All under `pages/api/admin/*`.

### Allowed role strings in code and DB

- **DB:** `profiles.role` CHECK: `('user','editor','admin')` — `scripts/createProfilesTable.sql`.
- **Code:** `lib/authServer.ts` — `UserRole = 'user' | 'editor' | 'admin'`; `validRoles` same three; default `'user'` if missing/invalid.

### Every usage of role checks (admin/editor) with file paths

| File | Check |
|------|--------|
| `middleware.ts` | admin for /admin/people; editor\|admin for other /admin |
| `pages/admin/index.tsx` | editor\|admin in getServerSideProps; admin-only UI (people, outbox) |
| `pages/admin/people.tsx` | admin only getServerSideProps |
| `pages/admin/global.tsx` | admin only getServerSideProps |
| `pages/admin/home.tsx` | admin only getServerSideProps |
| `pages/admin/footer.tsx` | admin only getServerSideProps |
| `pages/admin/navigation.tsx` | admin only getServerSideProps |
| `pages/admin/products/index.tsx` | admin only getServerSideProps |
| `pages/admin/products/[slug]/hero.tsx` | admin only getServerSideProps |
| `pages/admin/waitlist.tsx` | admin only getServerSideProps |
| `pages/admin/assets/index.tsx` | admin\|editor getServerSideProps; admin-only delete UI |
| `pages/admin/config/feature-flags.tsx` | admin only getServerSideProps |
| `pages/admin/config/avatar-mapping.tsx` | admin only getServerSideProps |
| `pages/admin/config/assessments/gut-check-v1.tsx` | admin only getServerSideProps |
| `pages/admin/config/assessments/gut-check-v2.tsx` | admin only getServerSideProps |
| `pages/admin/seo/index.tsx` | admin only getServerSideProps |
| `pages/admin/seo/robots.tsx` | admin only getServerSideProps |
| `pages/admin/seo/assets.tsx` | admin only getServerSideProps |
| `pages/admin/outbox.tsx` | admin only getServerSideProps |
| `pages/admin/site-settings/index.tsx` | editor\|admin getServerSideProps |
| `pages/admin/foods/index.tsx` | editor\|admin getServerSideProps |
| `pages/admin/foods/new.tsx` | editor\|admin getServerSideProps |
| `pages/admin/foods/[id].tsx` | editor\|admin getServerSideProps |
| `pages/admin/foods/import.tsx` | editor\|admin getServerSideProps |
| `pages/admin/foods/merge.tsx` | admin only getServerSideProps |
| `pages/admin/assessments/index.tsx` | editor\|admin getServerSideProps |
| `pages/admin/results-packs/index.tsx` | editor\|admin getServerSideProps |
| `pages/admin/results-packs/[packId].tsx` | editor\|admin getServerSideProps |
| `pages/admin/results-packs/preview/[packId].tsx` | editor\|admin getServerSideProps |
| `pages/admin/results-packs/edit/[revisionId].tsx` | editor\|admin getServerSideProps |
| `pages/admin/question-sets/index.tsx` | editor\|admin getServerSideProps |
| `pages/admin/question-sets/[questionSetId].tsx` | editor\|admin getServerSideProps |
| `pages/admin/question-sets/import.tsx` | editor\|admin getServerSideProps |
| `pages/admin/question-sets/preview/[questionSetId].tsx` | editor\|admin getServerSideProps |
| `pages/admin/waitlist-signups.tsx` | editor\|admin getServerSideProps |
| `pages/api/admin/*` (multiple) | requireRoleFromApi(['admin']) or (['admin','editor']) or requireRole from resultsPack |

### Least-change integration

- Adding `staff` or `coach` requires: (1) DB migration to extend `profiles.role` CHECK to include new values; (2) extend `UserRole` and `validRoles` in `lib/authServer.ts`; (3) decide which admin routes/pages allow staff/coach (middleware + each getServerSideProps + each API). No shared "role config" today—each place checks explicitly.

---

## 3) Current journal gating

### Middleware gates

**File:** `middleware.ts`

- **Journal subdomain** (`journal.myfinediet.com`, path `/`):  
  - Authenticated via `getCurrentUserWithRoleFromMiddleware(request)`.  
  - Person: `people.id` where `auth_user_id = user.id`.  
  - If no person → redirect to `/journal-waitlist`.  
  - Subs: `subscriptions` where `person_id`, `subscription_type = 'journal_access'`, `is_active = true`, limit 1.  
  - If no row → redirect to `/journal-waitlist`; else rewrite to `/journal`.

- **Journal path** (`/journal` or `/journal/*`, excluding `/journal-waitlist`):  
  Same: auth → person → `subscriptions` with `subscription_type = 'journal_access'` and `is_active = true`. No subs → redirect to `/journal-waitlist`.

```typescript
// middleware.ts (excerpt) — journal path
const { data: person } = await supabaseAdmin
  .from('people')
  .select('id')
  .eq('auth_user_id', user.id)
  .maybeSingle();
if (!person?.id) {
  url.pathname = '/journal-waitlist';
  // ...
}
const { data: subs } = await supabaseAdmin
  .from('subscriptions')
  .select('id')
  .eq('person_id', person.id)
  .eq('subscription_type', 'journal_access')
  .eq('is_active', true)
  .limit(1);
if (!subs?.length) {
  url.pathname = '/journal-waitlist';
  // ...
}
```

### Page-level SSR guards (getServerSideProps)

- **Journal pages:** `pages/journal.tsx` has no getServerSideProps. Journal access is enforced only in middleware; no SSR subscription check on journal pages.

### API routes used by journal UI

All resolve `person_id` via `getPersonIdFromAuthUserId(user.id)` and require authenticated user (no explicit "journal access" check in API; middleware already blocks unentitled users from reaching the app). Routes:

- `pages/api/journal/entries/index.ts` — list/create; personId required, 403 if no personId.
- `pages/api/journal/entries/[id].ts` — get/update/delete; personId required.
- `pages/api/journal/meals/index.ts` — list/create; personId required.
- `pages/api/journal/meals/[id].ts` — get/update/delete; personId required.
- `pages/api/journal/goals.ts` — get/update goals; personId required.
- `pages/api/journal/history.ts` — list entries; personId required.
- `pages/api/journal/repeat.ts` — repeat entry; personId required.
- `pages/api/journal/nds.ts` — NDS by date; optional `person_id` query; if provided and not same as user's person_id, requires `user.role === 'admin'` (only place that allows "view another person's" data for admin).
- `pages/api/foods/search.ts`, `pages/api/foods/upc/[code].ts`, `pages/api/foods/favorites.ts`, `pages/api/foods/custom.ts` — use personId for preferences/association; 401/403 if unauthenticated or no personId where required.

**Exact condition today:** Middleware: `person` exists and exists subscription with `subscription_type = 'journal_access'` and `is_active = true`. API: authenticated + `getPersonIdFromAuthUserId` non-null (except NDS which allows admin override with query `person_id`).

### Client-side gating (feature flags / UI hides)

- **File:** `pages/journal.tsx`  
  Uses `useFeatureFlags()`; `ndsDailyBeta === true` controls display of NDS (NDSDisplay). No "journal enabled" toggle; access is route-level (middleware).

- **File:** `lib/hooks/useFeatureFlags.ts`  
  Fetches `/api/config/feature-flags` (public). No access gate there.

### Least-change integration

- **Compat shim:** Keep middleware check: "has active subscription `journal_access` OR has entitlement journal (future)." Single helper e.g. `hasJournalAccess(personId)` that reads subscriptions first, then (when added) entitlements.
- **Staff "view as client":** Middleware currently does not support "act as person_id from link." Options: (1) allow through middleware with a signed token that sets "viewing as" person in cookie/header and use that in API; or (2) keep middleware as "must have journal access for self" and add a separate read-only route for staff that uses access-link validation and returns data for target person (no change to existing journal API semantics).

---

## 4) Subscriptions system details (compat target)

### Schema, indexes, constraints

- **Script:** `scripts/createPeopleSystemTables.sql`, `scripts/addJournalAccessSubscriptionType.sql`.
- **Table:** `public.subscriptions`: `id`, `person_id`, `subscription_type` CHECK, `program_slug`, `is_active` BOOLEAN NOT NULL DEFAULT true, `created_at`, `updated_at`.
- **CHECK:** `subscription_type IN ('email_marketing','product_updates','program_waitlist','journal_access')`.
- **Unique index:** `idx_subscriptions_unique` ON (person_id, subscription_type, COALESCE(program_slug, '')).
- **Index:** `idx_subscriptions_active` ON (person_id, subscription_type, is_active).
- **RLS:** Enabled; policy "Service role can manage subscriptions" FOR ALL USING (true). No anon/authenticated direct access; all access via service role in app.

### How "active" is computed

- **Active = `is_active = true`.** No `ends_at`, `status`, or `cancel_at` in schema. No TTL or expiry; "active" is purely the boolean.

### Codepaths that write to subscriptions

1. **lib/peopleService.ts** — `ensureSubscription({ personId, type, programSlug })`: upsert with `is_active: true`, `onConflict: 'person_id,subscription_type,program_slug'`.
2. **pages/api/admin/grant-journal-access.ts** — Calls `ensureSubscription({ personId: person.id, type: 'journal_access', programSlug: 'journal' })` (admin or secret).
3. **app/api/people/newsletter/route.ts** — Calls `ensureSubscription({ personId, type: 'email_marketing' })`.
4. **app/api/people/waitlist/route.ts** — Calls `ensureSubscription({ personId, type: 'program_waitlist', programSlug: data.programSlug || 'journal' })`.

No webhooks or cron write to subscriptions in this codebase; n8n is consumer-only (emitN8nWebhook).

### Least-change integration

- Add entitlements table and logic additively. Keep `subscriptions` and `ensureSubscription`; add `hasJournalAccess(personId)` that: (1) returns true if active `journal_access` subscription exists; (2) else returns true if entitlements record grants journal. Use this in middleware and anywhere that currently checks subscriptions for journal.

---

## 5) RLS policies that affect journal reads/writes

### Journal tables

**Script:** `scripts/createJournalTables.sql`

- **journal_entries:** RLS ON. Policies: "Users can read/insert/update/delete own journal entries" — USING/WITH CHECK: `person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())`.
- **journal_meal_templates:** Same pattern: "Users can read/insert/update/delete own meal templates" — same USING subquery.

So: **self-only by auth.uid() → people.id = person_id.** No policy allows another principal to read/write another person's rows. Comment in script: "We use service_role for API routes, so RLS is bypassed there." So API uses supabaseAdmin and enforces "own person_id" in app code; RLS matters for direct client Supabase access.

**Conflict for "view as client":** If staff use a client that talks to Supabase with their own auth, RLS would block reading another person's journal. So "view as client" must either: (1) stay server-only (API with service role + access-link check), or (2) add RLS policies that allow read when e.g. an access_link or relationship exists (more invasive).

### people / profiles / subscriptions

- **people:** RLS ON. "Service role can manage people" FOR ALL. No authenticated read-by-self policy; all access via service role.
- **profiles:** RLS ON. "Users can read own profile" (auth.uid() = id); "Service role can read all profiles"; "Service role can manage profiles." So client can read own profile; middleware/API use service role.
- **subscriptions:** RLS ON. "Service role can manage subscriptions" FOR ALL. No direct client access.

### Food objects (journal-adjacent)

**Script:** `scripts/createFoodObjectsTables.sql`

- **food_objects:** "Anyone can read public foods"; "Users can read own foods" (person_id = (SELECT id FROM people WHERE auth_user_id = auth.uid())); "Service role can manage food_objects."
- **user_food_preferences:** "Users can manage own food preferences" (person_id = (SELECT id FROM people WHERE auth_user_id = auth.uid())); "Service role can manage."

Same self-only pattern; service role bypasses for API.

### NDS tables

**Script:** `scripts/sql/createDailyNDSTables.sql`

- **daily_nds,** **nds_recompute_queue:** No RLS policies shown in script (tables created, triggers added). If RLS is enabled elsewhere, need to confirm; typically these are accessed only via service role in `lib/nds/ndsServerService.ts`.

### Admin / CMS tables

- **media_assets:** "Authenticated users can view"; "Admins and editors can manage" — USING/WITH CHECK: EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','editor')).
- **question_sets / question_set_revisions / question_set_pointers:** current_user_role() IN ('editor','admin') for insert/update; public read for published only.
- **results_packs / results_pack_revisions / results_pack_pointers:** Same pattern; `current_user_role()` from profiles.

### Summary: self-only and "view as client"

- Journal and food preference RLS is **self-only** (auth.uid() → people.id → person_id). Staff "view as client" with direct Supabase client would be blocked. Recommendation: keep "view as client" on server (API + service role + access-link validation); no RLS change required for v1. If later you want client-side Supabase for staff, add policies that allow read when e.g. valid access_link exists for (staff_user_id, client_person_id).

---

## 6) Middleware / auth plumbing

### middleware.ts logic

- **Matcher:** All paths except api, _next/static, _next/image, favicon, static file extensions.
- **Order:** (1) Journal subdomain `/` → auth → person → journal_access subscription → rewrite to `/journal` or redirect to login/journal-waitlist. (2) `/journal` and `/journal/*` (not journal-waitlist) → same auth + person + subscription check; redirect to login or journal-waitlist if fail. (3) `/admin/*` → auth required; `/admin/people` admin-only; else editor or admin. (4) Other routes → next().

No redirect based on subscription outside journal; no login flow that checks subscription (login is separate; link-person runs after login).

### Auth server helpers

- **File:** `lib/authServer.ts`
  - **getCurrentUserWithRoleFromApi(req, res)** — cookies from req/res; supabase.auth.getUser(); then profiles.role for user.id; returns { id, email, role } or null. Validates role in ['user','editor','admin'].
  - **getCurrentUserWithRoleFromMiddleware(request)** — cookies from request; same flow.
  - **getCurrentUserWithRoleFromSSR(context)** — cookies from context.req; same flow.
  - **requireRoleFromApi(req, res, allowed)** — getCurrentUserWithRoleFromApi; 401 if no user, 403 if role not in allowed.
  - **hasRole(user, allowed)** — boolean.

All read role from `profiles` keyed by auth user id; no subscription or entitlement read in authServer.

### Redirects / login flows tied to subscription

- Middleware redirects to `/journal-waitlist` when no person or no journal_access subscription. No redirect from login page itself based on subscription; login redirect is generic (e.g. `redirect` query param).

### Least-change integration

- Keep middleware; add a branch for "has journal access" that calls shared helper (subscription + optional entitlement). Optional: for access-link flow, either skip middleware for a dedicated staff route or add cookie/header from validated link and resolve "acting person" in API only (middleware still "self" journal check for normal users).

---

## 7) Admin surface inventory

### Current /admin routes and role gates

| Route | Role in getServerSideProps | Notes |
|-------|----------------------------|--------|
| /admin | editor \| admin | Dashboard |
| /admin/people | admin only | |
| /admin/site-settings | editor \| admin | Hub to global, seo, navigation, home, footer, products, waitlist, assets, waitlist-signups |
| /admin/global | admin only | |
| /admin/seo | admin only | |
| /admin/seo/robots | admin only | |
| /admin/seo/assets | admin only | |
| /admin/navigation | admin only | |
| /admin/home | admin only | |
| /admin/footer | admin only | |
| /admin/products | admin only | |
| /admin/products/[slug]/hero | admin only | |
| /admin/waitlist | admin only | |
| /admin/assets | admin \| editor (delete admin only in UI) | |
| /admin/waitlist-signups | editor \| admin | |
| /admin/foods | editor \| admin | |
| /admin/foods/new, [id], import | editor \| admin | |
| /admin/foods/merge | admin only | |
| /admin/config/feature-flags | admin only | |
| /admin/config/avatar-mapping | admin only | |
| /admin/config/assessments/gut-check-v1, v2 | admin only | |
| /admin/assessments | editor \| admin | |
| /admin/question-sets/* | editor \| admin | |
| /admin/results-packs/* | editor \| admin (publish admin only in API) | |
| /admin/outbox | admin only | |
| /admin/debug-auth | (debug) | |

### Patterns for admin CRUD

- **Pages:** getServerSideProps gets user via `getCurrentUserWithRoleFromSSR`, redirects to login or `/admin/unauthorized` if role insufficient. Data often fetched client-side from `/api/admin/*`.
- **API routes:** `requireRoleFromApi(req, res, ['admin'])` or `(['admin','editor'])`; then supabaseAdmin for DB. Results pack publish and some destructive actions (merge, delete) are admin-only.
- **Components:** `AdminLayout`, `ImageFieldWithPicker` / `ImagePickerModal` calling `/api/admin/assets`; forms POST/PATCH to admin API routes.

### Least-change integration

- New "staff" or "coach" roles: add to CHECK and authServer, then explicitly allow in each admin route that should permit them (middleware + getServerSideProps + API). Consider a small "admin route config" (route → allowed roles) to avoid scattering conditionals.

---

## 8) Feature flags / CMS configs tied to access

### Feature flags store

- **Source:** CMS table `site_content` with key `feature-flags:global`; status `published`; JSON in `data`. Validated with `featureFlagsSchema` (lib/contentValidators); defaults from `lib/config/defaults.ts` (`DEFAULT_FEATURE_FLAGS`).
- **Public read:** `pages/api/config/feature-flags.ts` — GET, no auth; returns flags or defaults. Cache-Control: no-store.
- **Admin write:** `pages/api/admin/config/feature-flags.ts` — admin-only; writes `site_content` for `feature-flags:global`.

### Where access gates reference flags

- **Journal:** `pages/journal.tsx` uses `useFeatureFlags()`; `ndsDailyBeta` only controls **display** of NDS (NDSDisplay). No "journal enabled" flag; journal access is subscription-based in middleware.
- **N8N:** `lib/peopleService.ts` `emitN8nWebhook` uses `getFeatureFlags().enableN8nWebhook` (and env override) to decide whether to call webhook. Not an access gate.
- **Config registry:** `lib/config/registry.ts` lists `feature-flags:global` and admin editor path; no role logic there.

### Journal-enabled toggles / config overrides

- None. No feature flag or config that turns "journal access" on/off; that is entirely subscriptions (and future entitlements).

### Least-change integration

- Optional: add a feature flag or config like `journalAccessEnabled` to disable journal app-wide without removing subscriptions; would be checked in middleware in addition to subscription/entitlement. Not required for entitlements/access links.

---

## 9) DB migration patterns + constraint naming conventions

### Where migrations live

- **Directory:** `scripts/` (root level). No dedicated `migrations/` folder. SQL files: `create*.sql`, `add*.sql`, `disable*.sql`, `fix*.sql`, etc.; some in `scripts/sql/` (e.g. `createDailyNDSTables.sql`, `fineDietInternalFoods.sql`).

### Conventions

- **Tables:** `CREATE TABLE IF NOT EXISTS public.<name>`; often with COMMENT ON TABLE.
- **Indexes:** `CREATE INDEX IF NOT EXISTS idx_<table>_<columns>` or `idx_<table>_<suffix>`; unique: `idx_<table>_unique` or `idx_<table>_<columns>_unique`.
- **RLS:** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`; policies named descriptively: "Users can read own …", "Service role can manage …", "Admins and editors can …".
- **Triggers:** `update_<table>_updated_at` or `update_journal_updated_at`; function `update_*_updated_at()` or `set_updated_at()`.
- **CHECK constraints:** Named in add scripts (e.g. `subscriptions_subscription_type_check`). Role: `profiles.role` CHECK (role IN ('user','editor','admin')).

### Additive schema patterns

- New subscription types added via ALTER CONSTRAINT (drop + add) in `addJournalAccessSubscriptionType.sql`. New tables and new columns (e.g. journal_entries protein_score_10, is_main_meal) added in separate scripts. No destructive drops of columns in current scripts.

### Least-change integration

- New tables: entitlements, access_links, etc. — new SQL files under `scripts/` following same naming and RLS style. For new roles: new migration that drops and re-adds `profiles.role` CHECK to include new values. Reuse "service role can manage" pattern for new tables if only server uses them.

---

## 10) Explicit conflict list + recommended insertion points

### Potential conflicts to resolve before implementing

1. **profiles.role CHECK**  
   Today only `user`, `editor`, `admin`. Adding `staff` or `coach` requires migration to extend CHECK and update `lib/authServer.ts` and every middleware/getServerSideProps/API that currently checks editor/admin.

2. **RLS self-only policies (journal, food prefs)**  
   All journal and user_food_preferences policies are "person_id = (SELECT id FROM people WHERE auth_user_id = auth.uid())". Staff "view as client" via direct Supabase client would be denied. Mitigation: do "view as client" only in API using service role and access-link validation; no RLS change for v1.

3. **Middleware assumption: subscription-only gating**  
   Middleware only checks subscriptions for journal. Must keep that path and add "OR has entitlement journal" so existing subscriptions continue to work (compat shim).

4. **Duplicate "person" identifiers**  
   `user.id` (auth) vs `person_id` (people.id) are consistently separated; APIs take auth and resolve person_id. No conflict if access links map "link token → client person_id" and API resolves "acting person" from link when present, then uses that person_id for read-only.

5. **NDS API admin override**  
   `pages/api/journal/nds.ts` already allows `person_id` query and allows access when `user.role === 'admin'`. So admin can see another person's NDS. For staff with access link, you could either extend that to "admin or has valid access link for this person_id" or keep staff path read-only via a dedicated endpoint.

### Least-change plan

- **Where to plug in hasEntitlement(personId, 'journal'):**  
  - New helper e.g. `hasJournalAccess(personId)` in a small server-only module (e.g. `lib/access/journalAccess.ts`). Implementation: (1) query subscriptions for person_id + journal_access + is_active; if found return true; (2) else query entitlements (when table exists) for person_id + journal; return true if found.  
  - Call this from: **middleware** (replace inline subscription check with this helper). No change to API route logic for "self" flow.

- **Where to add compatibility shim for subscriptions:**  
  - Inside `hasJournalAccess(personId)`: subscriptions check first (current behavior); then entitlements. So no change to subscriptions table or ensureSubscription; only the "decision" for "can access journal?" is extended.

- **Where to add access-links checks for "view as client":**  
  - New API route(s) e.g. GET `/api/journal/access-link/...` or a query param on existing read-only endpoints that accepts a signed token; validate token → (staff_user_id, client_person_id, scope=read). Use supabaseAdmin to fetch journal data for client_person_id and return. Do not use client Supabase with staff auth for journal rows (RLS would block).  
  - Optional: middleware for a path like `/journal/view?token=...` that validates link and sets a short-lived cookie so the journal UI can call existing APIs with "acting as" context; then API layer must accept that context and resolve person_id from it (and enforce read-only). More invasive; v1 can be "staff uses a dedicated read-only view that calls new API only."

- **Routes/pages that will need direct edits:**  
  - **middleware.ts:** Replace inline subscription check with `hasJournalAccess(personId)` (and keep person resolution from auth as today).  
  - **Optional:** Any API that should support "view as client" (e.g. journal entries list for staff): add parameter or header for access-link token; validate; then use client person_id for read-only queries. Today only `nds.ts` has an "other person" path (admin).  
  - **New:** Entitlements table + migration; access_links table + migration; `hasJournalAccess` implementation; access-link validation helper; new API route or extended NDS/entries for staff read-only.

---

## Final table: Touchpoint | Current logic | Conflict risk | Proposed minimal change

| Touchpoint | Current logic | Conflict risk | Proposed minimal change |
|------------|----------------|---------------|--------------------------|
| middleware.ts (journal) | Auth → person → subscriptions (journal_access, is_active) | Must keep compat with subscriptions | Call hasJournalAccess(personId); implement as subscription OR entitlement |
| middleware.ts (admin) | role === 'admin' for /admin/people; editor \| admin else | New roles (staff/coach) not allowed | Extend CHECK + authServer + add branches for new roles where desired |
| getPersonIdFromAuthUserId | people.id WHERE auth_user_id = authUserId | None | Keep; add separate path for "acting person" from access link in API only |
| Journal API routes | Auth → personId; operate on personId | RLS is self-only; staff can't use client | Keep service role in API; add optional access-link validation and client person_id for read-only routes |
| RLS journal_entries / journal_meal_templates | person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid()) | Blocks "view as client" from client | No RLS change for v1; do "view as client" in API with service role |
| profiles.role CHECK | ('user','editor','admin') | Adding staff/coach fails insert/update | Migration: drop + add CHECK with new values; update authServer validRoles |
| lib/authServer validRoles | ['user','editor','admin'] | New roles ignored/defaulted to user | Add new roles to UserRole and validRoles; decide per-route allow list |
| ensureSubscription / grant-journal-access | Writes subscriptions (journal_access) | None | Leave as-is; hasJournalAccess reads subscriptions first |
| Feature flags | ndsDailyBeta for display only | None | Optional: add journalAccessEnabled for kill switch |
| Admin pages getServerSideProps | Explicit role checks per page | Adding staff/coach requires touching each | Add new role to condition where staff/coach should have access |
| NDS API person_id query | Admin can pass person_id for another user | Already supports "other person" for admin | Extend to "admin or valid access link for person_id" if staff should see NDS |

---

*End of report. No code or migrations have been changed.*
