-- ============================================================================
-- Rollback for scripts/sql/createGroceryHaulFoundation.sql
--
-- Additive tables only. Does not drop grocery lists, grocery items, estimates,
-- purchasing choices, or price observations.
--
-- Safe only if no application code has started writing grocery_hauls rows
-- that must be retained. Prefer undeploying any Haul writer before rollback.
-- ============================================================================

DROP TRIGGER IF EXISTS grocery_hauls_updated_at ON public.grocery_hauls;

DROP TABLE IF EXISTS public.grocery_haul_items;
DROP TABLE IF EXISTS public.grocery_hauls;

DROP INDEX IF EXISTS public.idx_generated_grocery_lists_id_person;
