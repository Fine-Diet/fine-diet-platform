-- ============================================================================
-- Rollback for scripts/sql/addCreateGroceryHaulFromList.sql
--
-- Drops the Packet 11C RPC only. Does not drop grocery_hauls /
-- grocery_haul_items (Packet 11A) or Grocery List / Pantry tables.
--
-- Run this before scripts/sql/rollbackGroceryHaulFoundation.sql if both
-- packets were applied. Do not run against production/shared remotes unless
-- separately authorized.
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_grocery_haul_from_list(UUID, UUID, DATE, UUID);
