# Journal V1 Phase 2: Supabase Persistence Setup

## Overview

This document covers the implementation of Supabase persistence for Journal entries and meal templates, replacing the Phase 1 in-memory storage.

## Database Tables

### Run Migration

Before testing, run the migration SQL in Supabase:

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `scripts/createJournalTables.sql`
3. Run the script

### Tables Created

**journal_entries**
- `id` (uuid pk) - Entry ID
- `person_id` (uuid fk) - References `people.id`
- `entry_type` (text) - Type of entry: 'intake', 'water', etc.
- `occurred_at` (timestamptz) - When the entry occurred
- `payload` (jsonb) - Entry details: `{ name, quantity, unit, macros }`
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**journal_meal_templates**
- `id` (uuid pk) - Template ID
- `person_id` (uuid fk) - References `people.id`
- `name` (text) - Meal name
- `items` (jsonb) - Array of `{ id, name, quantity, unit }`
- `nutrition_density` (integer, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### Indexes
- `idx_journal_entries_person_occurred` - For efficient day queries
- `idx_journal_entries_person_type` - For filtering by entry type
- `idx_journal_meal_templates_person_updated` - For listing templates

### Row Level Security (RLS)
RLS policies are enabled to ensure users can only access their own data when using the client library directly. API routes use the service role key which bypasses RLS.

## Architecture

### Data Flow

```
UI Component → journalService (client) → API Route → journalServerService → Supabase
```

1. **UI Components** call `journalService` methods (now async)
2. **journalService** (`lib/journal/journalService.ts`) makes `fetch()` calls to API routes
3. **API Routes** (`pages/api/journal/*`) authenticate user and resolve `person_id`
4. **journalServerService** (`lib/journal/journalServerService.ts`) executes Supabase queries

### Files Changed/Created

**New Files:**
- `scripts/createJournalTables.sql` - Database migration
- `lib/journal/journalServerService.ts` - Server-side Supabase queries
- `pages/api/journal/entries/index.ts` - List/create entries
- `pages/api/journal/entries/[id].ts` - Get/update/delete entry
- `pages/api/journal/meals/index.ts` - List/create templates
- `pages/api/journal/meals/[id].ts` - Get/delete template

**Updated Files:**
- `lib/journal/journalService.ts` - Now async, calls API routes
- `lib/journal/types.ts` - Added `nutritionDensity` to `MealTemplate`
- All UI pages using journalService (updated to async/await)

## Timezone/Day Boundary Handling

**Current Approach (Phase 2):**
- `occurred_at` is stored as timestamptz in UTC
- Client sends date as YYYY-MM-DD for day queries
- Server queries using `>= startOfDay` and `<= endOfDay` in UTC
- This means a "day" is defined as 00:00-23:59 UTC

**Future Enhancement:**
- Could accept timezone parameter from client
- Would allow true local-day queries

## API Endpoints

### Entries

**GET /api/journal/entries?date=YYYY-MM-DD&block=morning|midday|evening**
- Lists entries for a specific day
- Optional `block` filter

**POST /api/journal/entries**
```json
{
  "occurredAt": "2026-01-26T12:00:00.000Z",
  "entryType": "intake",
  "payload": {
    "name": "Oatmeal",
    "quantity": 1,
    "unit": "bowl"
  }
}
```

**GET /api/journal/entries/:id**
- Get single entry

**PATCH /api/journal/entries/:id**
```json
{
  "occurredAt": "2026-01-26T13:00:00.000Z",
  "payload": { "quantity": 2 }
}
```

**DELETE /api/journal/entries/:id**
- Delete entry

### Meal Templates

**GET /api/journal/meals**
- List all templates

**POST /api/journal/meals**
```json
{
  "name": "Breakfast usual",
  "items": [
    { "id": "item-1", "name": "Oatmeal", "quantity": 1, "unit": "bowl" }
  ]
}
```

**GET /api/journal/meals/:id**
- Get single template

**DELETE /api/journal/meals/:id**
- Delete template

## QA Checklist

### Prerequisites
- [ ] Run `scripts/createJournalTables.sql` in Supabase SQL Editor
- [ ] User has a `people` record linked to their auth account
- [ ] User has `journal_access` subscription active

### Entry Operations
- [ ] **Create entry:** Log a food item via Quick Add, verify it appears
- [ ] **Edit entry:** Change quantity/unit/time, confirm changes persist
- [ ] **Delete entry:** Remove an entry, verify it's gone
- [ ] **Persistence:** Refresh page, confirm entries remain
- [ ] **Block assignment:** Change entry time, confirm it moves to correct block

### Meal Template Operations
- [ ] **Create template:** Create a saved meal from logged entries
- [ ] **View template:** Go to saved meals list, confirm template appears
- [ ] **Persistence:** Refresh page, confirm templates remain

### Multi-User Isolation
- [ ] Log in as User A, create entries
- [ ] Log in as User B, confirm User A's entries are not visible
- [ ] Confirm each user only sees their own data

### Error Handling
- [ ] Access journal without logging in → redirected to login
- [ ] Access journal without entitlement → redirected to waitlist
- [ ] API returns appropriate errors for missing/invalid data

## Troubleshooting

### "No person record found" Error
The user doesn't have a `people` record linked to their auth account. Either:
1. Have them sign up through the waitlist flow, or
2. Manually link via admin: `UPDATE people SET auth_user_id = '<auth-user-uuid>' WHERE email = '<user-email>'`

### Entries Not Persisting
1. Check browser console for API errors
2. Verify tables were created: `SELECT * FROM journal_entries LIMIT 1;`
3. Check Supabase logs for errors

### Time Zone Issues
Currently, all dates are interpreted in UTC. If entries appear on wrong day:
- Ensure client sends dates in ISO format
- Check `occurred_at` values in database match expected times
