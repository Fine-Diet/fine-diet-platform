-- ============================================================================
-- Meal Object Foundation — Packet 2: Codify journal_entries.payload.meal_group
--
-- WHY THIS EXISTS
--   Grouped meal logging is modeled as a VERSIONED JSONB EXTENSION of the
--   existing journal_entries.payload — NOT a new column and NOT new top-level
--   rows per ingredient (docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md §3.4).
--   This script documents that contract at the schema level. It deliberately
--   makes NO structural change.
--
-- THE CONTRACT (payload of an intake entry)
--   - Absence of `payload.meal_group` ⇒ legacy/single flat food entry
--     (today's behavior — unchanged).
--   - Presence of `payload.meal_group` ⇒ a grouped meal entry: ONE journal row
--     that still knows its components. The first-level payload fields
--     (name/calories/macros/quantity/unit) continue to mirror the meal totals
--     so day view, LoggedItemCard, and daily NDS keep reading them unchanged.
--   - `payload.meal_group` conforms to LoggedMealGroup in lib/meals/types.ts
--     and is stamped with `schema_version`.
--
-- SCOPE / SAFETY
--   - COMMENT-only. No column is added, dropped, renamed, or retyped.
--   - No data is written. Packet 2 does NOT introduce any meal_group writes;
--     the grouped logging write path is deferred to a later packet.
--
-- Run in Supabase SQL Editor (optional — documentation/codification only).
-- ============================================================================

COMMENT ON COLUMN public.journal_entries.payload IS
  'Intake entry details (name, quantity, unit, calories, macros, ...). VERSIONED JSONB EXTENSION: an optional payload.meal_group (LoggedMealGroup in lib/meals/types.ts, stamped with schema_version) marks a GROUPED meal entry that retains its components in one row. Absence of payload.meal_group ⇒ legacy flat single-food entry. First-level name/calories/macros always mirror the (meal) totals for back-compat. No physical column; grouped logging writes are deferred to a later packet.';
