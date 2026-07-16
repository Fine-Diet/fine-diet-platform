-- ============================================================================
-- Grocery Price Search — Preview data cleanup (schema-preserving)
--
-- Clears runtime pricing data after Preview smoke tests without dropping
-- tables, policies, or claim_grocery_price_search_quota().
--
-- Safe to rerun. Does NOT touch grocery_items, grocery_shopping_overrides,
-- plans, or other grocery truth tables.
-- ============================================================================

TRUNCATE TABLE public.grocery_price_observations RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.grocery_price_search_events RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.grocery_price_search_quota_claims RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.grocery_price_search_cache RESTART IDENTITY CASCADE;

-- Post-cleanup verification: all pricing tables should be empty.
SELECT 'grocery_price_search_cache' AS table_name, COUNT(*) AS row_count
FROM public.grocery_price_search_cache
UNION ALL
SELECT 'grocery_price_search_quota_claims', COUNT(*)
FROM public.grocery_price_search_quota_claims
UNION ALL
SELECT 'grocery_price_search_events', COUNT(*)
FROM public.grocery_price_search_events
UNION ALL
SELECT 'grocery_price_observations', COUNT(*)
FROM public.grocery_price_observations
ORDER BY table_name;
