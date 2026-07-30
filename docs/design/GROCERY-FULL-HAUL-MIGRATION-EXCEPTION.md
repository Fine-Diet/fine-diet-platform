# Grocery Full Haul — migration exception / runbook

**Status:** Managed `supabase/migrations` history in this repository is incomplete
(empty chain). Registering only these three tables as migrations would break
clean replay for new environments. Do **not** force a partial migration chain.

## Source of truth (this PR)

Idempotent review-first scripts (safe to re-run):

1. `scripts/sql/createGroceryListPurchasingChoices.sql`
2. `scripts/sql/createGroceryListPriceObservations.sql`
3. `scripts/sql/createGroceryListItemActiveQuotes.sql`

Apply order matters (choices → list price observations → active quotes).

## Linked / production project

Project ref: `tssvlflebugqhtogqdfs`

As of founder packaging (2026-07-30), all three tables are **already present**
with limited QA rows. **Do not re-apply** unless a concrete mismatch is found
and separately approved.

Verified (read-only) against live schema:

- Columns, FKs, CHECKs, UNIQUE constraints match the committed scripts
- Expected indexes present
- RLS enabled with owner-only person_id policies (SELECT/INSERT/UPDATE/DELETE)

## Fresh environment bootstrap

Until a complete managed migration history exists:

1. Restore / apply the broader platform schema by the project’s normal bootstrap path
2. Then run the three scripts above in order (idempotent)

## Rollback (additive tables only)

Prefer undeploying app code first. If schema rollback is required:

1. `DROP TABLE public.grocery_list_item_active_quotes;`
2. Optionally `DROP TABLE public.grocery_list_price_observations;` (append-only quotes)
3. Optionally `DROP TABLE public.grocery_list_purchasing_choices;`

`grocery_items` required identity and Stage-1 `grocery_price_observations` are
not written by these tables’ happy paths.

## Follow-up (founder)

When a complete migration baseline is established, register these three scripts
(or equivalent) into managed history without mutating production tables that
already match.
