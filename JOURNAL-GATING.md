# Journal Gating

The Journal (`/journal` and `/journal/*`) is gated behind authentication and an entitlement check.

## How It Works

1. **Middleware** (`middleware.ts`) intercepts requests to `/journal` and `/journal/*` (excluding `/journal-waitlist`).
2. **No session?** → Redirect to `/login?redirect=<original_path_and_query>`
3. **Session exists?** → Look up `people.auth_user_id = auth.uid()` to find the person.
4. **No person or no entitlement?** → Redirect to `/journal-waitlist?redirect=<original_path_and_query>`
5. **Entitlement exists?** → Allow access.

## Entitlement Model

Journal access is stored as a row in the `subscriptions` table:

| Column | Value |
|--------|-------|
| `person_id` | The person's UUID |
| `subscription_type` | `'journal_access'` |
| `program_slug` | `'journal'` (optional, for future multi-journal support) |
| `is_active` | `true` |

### TypeScript Type

```typescript
// lib/peopleService.ts
export type SubscriptionType =
  | 'email_marketing'
  | 'product_updates'
  | 'program_waitlist'
  | 'journal_access';
```

### Database Constraint

The `subscriptions` table has a CHECK constraint:

```sql
CHECK (subscription_type IN ('email_marketing', 'product_updates', 'program_waitlist', 'journal_access'))
```

See: `scripts/createPeopleSystemTables.sql`

## Granting Access

### Via API (Admin)

```bash
POST /api/admin/grant-journal-access
Content-Type: application/json
Authorization: Bearer <GRANT_JOURNAL_ACCESS_SECRET>

{ "email": "user@example.com" }
```

Or call as an authenticated admin user.

### Via Code

```typescript
import { ensureSubscription } from '@/lib/peopleService';

await ensureSubscription({
  personId: person.id,
  type: 'journal_access',
  programSlug: 'journal',
});
```

## Redirect Preservation

The `?redirect=` query param is preserved end-to-end:

1. User hits `/journal/today?foo=bar` without access.
2. Redirected to `/login?redirect=/journal/today?foo=bar` (or `/journal-waitlist?redirect=...`).
3. After login/signup (or after being granted access), the user is redirected back to `/journal/today?foo=bar`.

### Safety

Only relative paths starting with `/` are accepted as redirect targets. External URLs (`http://`, `https://`, `//`) are rejected.

See: `lib/redirectHelpers.ts`

## Testing

1. **Logged out** → `/journal` → Redirects to `/login?redirect=/journal`
2. **Logged in, no access** → `/journal` → Redirects to `/journal-waitlist?redirect=/journal`
3. **Grant access** → Call `/api/admin/grant-journal-access` with the user's email
4. **Logged in, with access** → `/journal` → Page loads normally

## Files

| File | Purpose |
|------|---------|
| `middleware.ts` | Journal gate logic |
| `lib/redirectHelpers.ts` | Redirect validation |
| `lib/peopleService.ts` | `SubscriptionType`, `ensureSubscription()` |
| `pages/api/admin/grant-journal-access.ts` | Admin API to grant access |
| `scripts/createPeopleSystemTables.sql` | Canonical DB schema |
