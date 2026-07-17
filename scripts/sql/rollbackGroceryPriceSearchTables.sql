-- ============================================================================
-- Grocery Price Search — Stage 1 rollback (Preview only)
--
-- Drops pricing tables, policies, and quota helper introduced by
-- scripts/sql/createGroceryPriceSearchTables.sql.
--
-- WARNING: Deletes all pricing cache, metering, and observation history in
-- the target database. Do NOT run against Production.
-- ============================================================================

DROP FUNCTION IF EXISTS public.claim_grocery_price_search_quota(UUID, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.claim_grocery_price_search_quota(UUID, TEXT, INTEGER);

DROP POLICY IF EXISTS "No direct client delete of grocery_price_observations"
  ON public.grocery_price_observations;
DROP POLICY IF EXISTS "No direct client update of grocery_price_observations"
  ON public.grocery_price_observations;
DROP POLICY IF EXISTS "No direct client mutation of grocery_price_observations"
  ON public.grocery_price_observations;
DROP POLICY IF EXISTS "Users can read own grocery_price_observations"
  ON public.grocery_price_observations;
DROP POLICY IF EXISTS "Users can delete own grocery_price_observations"
  ON public.grocery_price_observations;
DROP POLICY IF EXISTS "Users can update own grocery_price_observations"
  ON public.grocery_price_observations;
DROP POLICY IF EXISTS "Users can insert own grocery_price_observations"
  ON public.grocery_price_observations;

DROP POLICY IF EXISTS "No direct client access to grocery_price_search_events"
  ON public.grocery_price_search_events;
DROP POLICY IF EXISTS "Users can insert own grocery_price_search_events"
  ON public.grocery_price_search_events;
DROP POLICY IF EXISTS "Users can read own grocery_price_search_events"
  ON public.grocery_price_search_events;

DROP POLICY IF EXISTS "No direct client access to grocery_price_search_quota_claims"
  ON public.grocery_price_search_quota_claims;

DROP POLICY IF EXISTS "No direct client access to grocery_price_search_cache"
  ON public.grocery_price_search_cache;

DROP TABLE IF EXISTS public.grocery_price_observations;
DROP TABLE IF EXISTS public.grocery_price_search_events;
DROP TABLE IF EXISTS public.grocery_price_search_quota_claims;
DROP TABLE IF EXISTS public.grocery_price_search_cache;

-- Optional: remove migration ledger entry when rollback was applied via Supabase MCP.
-- DELETE FROM supabase_migrations.schema_migrations
-- WHERE name = 'create_grocery_price_search_tables';
