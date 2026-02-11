# Access Mgmt v1 — Pre-Implementation Verification

**Status:** Audit only. No code or migrations changed.

---

## 1) Exact DB constraint names

### profiles.role CHECK

The `scripts/createProfilesTable.sql` uses an **inline CHECK** with no explicit constraint name:

```sql
-- scripts/createProfilesTable.sql line 7
role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'editor', 'admin')),
```

PostgreSQL auto-generates the name `profiles_role_check` for unnamed inline CHECKs (pattern: `{table}_{column}_check`).

**Verification query (run in Supabase SQL Editor first):**

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass AND contype = 'c';
```

**Drop/recreate snippet (do not run yet):**

```sql
-- Step 1: Drop existing (expected name: profiles_role_check)
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 2: Add updated constraint with new roles
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('user', 'editor', 'admin', 'staff', 'coach'));
```

### subscriptions.subscription_type CHECK

The migration script `scripts/addJournalAccessSubscriptionType.sql` **explicitly names** it:

```sql
-- scripts/addJournalAccessSubscriptionType.sql lines 12-18
ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_subscription_type_check;

ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_subscription_type_check
CHECK (subscription_type IN ('email_marketing', 'product_updates', 'program_waitlist', 'journal_access'));
```

The name `subscriptions_subscription_type_check` has been used and confirmed. No verification query needed — it was set explicitly.

**Drop/recreate snippet (do not run yet):**

```sql
ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_subscription_type_check;

ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_subscription_type_check
CHECK (subscription_type IN ('email_marketing', 'product_updates', 'program_waitlist', 'journal_access'));
-- No change to this constraint needed for Entitlements v1;
-- entitlements will live in their own table.
```

### people.status CHECK

Also inline (auto-named `people_status_check`). Not expected to change for v1, but noted for completeness:

```sql
-- scripts/createPeopleSystemTables.sql lines 19-20
status TEXT NOT NULL DEFAULT 'marketing_only'
  CHECK (status IN ('marketing_only', 'waitlist', 'active_user', 'inactive_user', 'unsubscribed', 'blocked')),
```

---

## 2) Middleware matchers + journal host/path logic

### Exact matcher config

```typescript
// middleware.ts lines 215-227
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot)).*)',
  ],
};
```

**Important:** The matcher **excludes `/api`** routes. This means middleware journal gating does NOT protect `/api/journal/*`. Those API routes are protected by their own `getCurrentUserWithRoleFromApi` + `getPersonIdFromAuthUserId` calls. This is critical: the API does **not** check journal subscription — it relies on middleware having blocked unentitled users from the UI that calls them.

### Journal subdomain conditional

```typescript
// middleware.ts lines 27-28
const isJournalSubdomain = host.startsWith('journal.myfinediet.com');
if (isJournalSubdomain && pathname === '/') {
```

Only the **root** (`/`) of the journal subdomain is gated and rewritten to `/journal`. Other paths on the subdomain fall through to the standard `/journal` path gate below.

### Journal path conditional

```typescript
// middleware.ts lines 85-86
const isJournalRoute =
  pathname === '/journal' || (pathname.startsWith('/journal/') && !pathname.startsWith('/journal-waitlist'));
```

Gates: `/journal`, `/journal/*`.  
Excludes: `/journal-waitlist` (so unauthenticated/unentitled users can reach it).

### Admin gate conditional

```typescript
// middleware.ts line 135
if (pathname.startsWith('/admin')) {
```

### Are any non-journal pages inadvertently protected?

**No.** The three conditional blocks are:

1. `isJournalSubdomain && pathname === '/'` — only journal subdomain root
2. `isJournalRoute` — only `/journal` and `/journal/*` (excludes `/journal-waitlist`)
3. `pathname.startsWith('/admin')` — only admin

All other routes pass through to `NextResponse.next()` on line 203. No false positives.

---

## 3) Service role usage confirmation

### Every file using supabaseAdmin for journal reads/writes

| File | Import | Usage |
|------|--------|-------|
| `lib/journal/journalServerService.ts` | `import { supabaseAdmin } from '../supabaseServerClient'` | All CRUD: createEntry, getEntry, updateEntry, deleteEntry, listEntriesByDay, createMealTemplate, listMealTemplates, getMealTemplate, deleteMealTemplate, updateMealTemplate, getUserGoals, setUserGoals, getPersonIdFromAuthUserId |
| `lib/nds/ndsServerService.ts` | `import { supabaseAdmin } from '../supabaseServerClient'` | fetchEntriesForDay, getDailyNDS, upsertDailyNDS, recomputeDailyNDS, processQueue, enqueueRecompute |
| `pages/api/journal/history.ts` | `import { supabaseAdmin } from '@/lib/supabaseServerClient'` | Direct query: journal_entries + food_objects |
| `pages/api/journal/repeat.ts` | `import { supabaseAdmin } from '@/lib/supabaseServerClient'` | Direct query: journal_entries + food_objects |
| `middleware.ts` | `await import('./lib/supabaseServerClient')` (dynamic) | Query: people + subscriptions for journal gating |

**All other journal API routes** (`entries/index.ts`, `entries/[id].ts`, `meals/index.ts`, `meals/[id].ts`, `goals.ts`, `nds.ts`) call functions from `journalServerService.ts` which uses `supabaseAdmin` internally.

### Client-side Supabase usage — does any journal read use browser client?

**Files importing browser/client Supabase:**

| File | Import | Purpose |
|------|--------|---------|
| `lib/supabaseBrowser.ts` | `createBrowserClient` from `@supabase/ssr` | Cookie-based browser client factory |
| `lib/supabaseClient.ts` | `createClient` from `@supabase/supabase-js` | Simple anon-key client |
| `components/account/LoginForm.tsx` | `from '@/lib/supabaseBrowser'` | Auth only (signInWithPassword, signInWithOtp) |
| `pages/login.tsx` | `from '@/lib/supabaseBrowser'` | Auth only (signInWithOAuth) |
| `components/assessments/ResultsScreen.tsx` | `from '@/lib/supabaseBrowser'` | Auth only (getUser for claim) |
| `lib/authHelpers.ts` | `from './supabaseBrowser'` | Auth utilities (signOut, getUser) |

**Confirmed: No journal data reads/writes use client-side Supabase.** All journal data flows through server-side API routes using `supabaseAdmin` (service role), which bypasses RLS entirely. This means RLS policies on journal tables are a safety net only, and "view as client" via API+service_role is safe.

---

## 4) Journal API surface area

| Route | Methods | Tables Read | Tables Written | "View as client" safe? |
|-------|---------|-------------|----------------|-------------------------|
| `/api/journal/entries` | GET, POST | journal_entries | journal_entries | GET: Yes (read-only); POST: No |
| `/api/journal/entries/[id]` | GET, PATCH, DELETE | journal_entries | journal_entries | GET: Yes; PATCH/DELETE: No |
| `/api/journal/meals` | GET, POST | journal_meal_templates | journal_meal_templates | GET: Yes; POST: No |
| `/api/journal/meals/[id]` | GET, PATCH, DELETE | journal_meal_templates | journal_meal_templates | GET: Yes; PATCH/DELETE: No |
| `/api/journal/goals` | GET | people (metadata field) | — | Yes |
| `/api/journal/history` | GET | journal_entries, food_objects | — | Yes |
| `/api/journal/repeat` | GET | journal_entries, food_objects | — | Yes |
| `/api/journal/nds` | GET | daily_nds, journal_entries (on recompute) | daily_nds (on recompute) | Yes (already has admin path) |

**Read-only "view as client" candidates (safe):**

- `GET /api/journal/entries` — list entries by date
- `GET /api/journal/entries/[id]` — single entry
- `GET /api/journal/meals` — list templates
- `GET /api/journal/meals/[id]` — single template
- `GET /api/journal/goals` — goals
- `GET /api/journal/history` — recently logged foods
- `GET /api/journal/repeat` — repeat foods
- `GET /api/journal/nds` — **already supports** admin pass-through of person_id

**Write routes (POST/PATCH/DELETE) should NOT be accessible via "view as client".**

---

## 5) Current auth → person mapping field names

### Schema excerpt

```sql
-- scripts/createPeopleSystemTables.sql line 30
auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
```

Column name is **`auth_user_id`** — consistently everywhere.

### Variant search results

Searched for `auth_user_id`, `user_id`, `auth_userId` across all `.ts`, `.tsx`, `.sql`:

- **`people.auth_user_id`** — Used consistently in:
  - `scripts/createPeopleSystemTables.sql` (column definition)
  - `scripts/createJournalTables.sql` (8 RLS policies: `WHERE auth_user_id = auth.uid()`)
  - `scripts/createFoodObjectsTables.sql` (RLS policies: `WHERE auth_user_id = auth.uid()`)
  - `lib/journal/journalServerService.ts:161` (`.eq('auth_user_id', authUserId)`)
  - `middleware.ts:45,102` (`.eq('auth_user_id', user.id)`)
  - `lib/peopleService.ts:71,166,168,186` (type definition + upsert)
  - `app/api/account/link-person/route.ts:79,172,230,234,249` (link flow)

- **`assessment_submissions.user_id`** — **different concept**: references `auth.users(id)` directly, not `people.id`. Used in assessment code only (`scripts/createAssessmentTables.sql:14`, `pages/api/assessments/submit.ts`, `pages/api/assessments/claim.ts`, `pages/api/account/assessments.ts`). **Not a variant of auth_user_id on people.** No conflict.

- **No instances of `people.user_id` or `people.auth_userId` exist anywhere.** The column name is strictly `auth_user_id` throughout.

---

## 6) RLS policy names (exact)

### journal_entries

| Policy name | Operation | Condition |
|-------------|-----------|-----------|
| `"Users can read own journal entries"` | SELECT | `USING (person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid()))` |
| `"Users can insert own journal entries"` | INSERT | `WITH CHECK (person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid()))` |
| `"Users can update own journal entries"` | UPDATE | `USING (person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid()))` |
| `"Users can delete own journal entries"` | DELETE | `USING (person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid()))` |

### journal_meal_templates

| Policy name | Operation | Condition |
|-------------|-----------|-----------|
| `"Users can read own meal templates"` | SELECT | `USING (person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid()))` |
| `"Users can insert own meal templates"` | INSERT | `WITH CHECK (person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid()))` |
| `"Users can update own meal templates"` | UPDATE | `USING (person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid()))` |
| `"Users can delete own meal templates"` | DELETE | `USING (person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid()))` |

### people

| Policy name | Operation | Condition |
|-------------|-----------|-----------|
| `"Service role can manage people"` | ALL | `USING (true) WITH CHECK (true)` |

### profiles

| Policy name | Operation | Condition |
|-------------|-----------|-----------|
| `"Users can read own profile"` | SELECT | `USING (auth.uid() = id)` |
| `"Service role can read all profiles"` | SELECT | `USING (true)` |
| `"Service role can manage profiles"` | ALL | `USING (true) WITH CHECK (true)` |

### subscriptions

| Policy name | Operation | Condition |
|-------------|-----------|-----------|
| `"Service role can manage subscriptions"` | ALL | `USING (true) WITH CHECK (true)` |

### people_events

| Policy name | Operation | Condition |
|-------------|-----------|-----------|
| `"Service role can manage people_events"` | ALL | `USING (true) WITH CHECK (true)` |

### Key observation for "view as client"

All 8 journal RLS policies (4 per table) use the **same subquery pattern**:

```sql
person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
```

Since all journal API routes use `supabaseAdmin` (service_role), these policies are bypassed. They would only block if a future change introduced client-side Supabase reads for journal data. **No RLS changes needed for v1** — the API+service_role path means "view as client" works purely via app-level authorization.

---

## 7) Verify existing "admin can pass person_id" pattern

### Exact verbatim code from NDS route

```typescript
// pages/api/journal/nds.ts lines 116-131

    // Determine person_id to fetch
    let personId: string;
    
    if (typeof personIdParam === 'string' && personIdParam.length > 0) {
      // Explicit person_id provided - validate access
      personId = personIdParam;
    } else {
      // Default to authenticated user's person_id
      personId = userPersonId;
    }
    
    // Authorization check: Users can only access their own NDS, admins can access any
    const userIsAdmin = user.role === 'admin';
    
    if (personId !== userPersonId && !userIsAdmin) {
      return res.status(403).json({ error: 'Access denied to this person\'s NDS' });
    }
```

### The specific conditional to generalize

**Line 130:**

```typescript
if (personId !== userPersonId && !userIsAdmin) {
```

This is the exact gate. To support "admin OR valid access-link with `journal_read` scope," this would become:

```typescript
// Future pattern (do not implement yet):
const hasAccessLinkScope = await validateAccessLink(req, personId, 'journal_read');
if (personId !== userPersonId && !userIsAdmin && !hasAccessLinkScope) {
  return res.status(403).json({ error: 'Access denied to this person\'s NDS' });
}
```

### Where else could the same pattern apply?

Currently, **only nds.ts** supports viewing another person's data. All other journal API routes hard-code `personId = await getPersonIdFromAuthUserId(user.id)` with no override path. To add "view as client" to read-only routes, each would need a similar "accept person_id param + authz check" block.

---

*End of verification. No code or migrations changed.*
