-- ============================================================================
-- OFF Mirror Verification Queries
-- Run in Supabase Dashboard → SQL Editor after Phase 1 import
-- ============================================================================

-- 1. Row count: products in mirror
SELECT count(*) AS off_products_count FROM public.off_products_mirror;

-- 2. Row count: aliases
SELECT count(*) AS off_aliases_count FROM public.off_product_search_aliases;

-- 3. Sample products with barcode and name
SELECT off_product_id, barcode, product_name, brands, energy_kcal_100g
FROM public.off_products_mirror
ORDER BY mirrored_at DESC
LIMIT 10;

-- 4. Search alias lookup: products matching a product name (replace 'Coca' with any search term)
SELECT p.off_product_id, p.barcode, p.product_name, a.source, a.value
FROM public.off_products_mirror p
JOIN public.off_product_search_aliases a ON a.off_product_id = p.off_product_id
WHERE a.value ILIKE '%Coca%'
LIMIT 5;

-- 5. Import run summary (includes skip reason counters)
SELECT id, started_at, finished_at, records_seen, records_kept_us,
       records_inserted, records_updated, records_skipped,
       records_skipped_no_id, records_skipped_upsert_error, status, error_summary
FROM public.off_import_runs
ORDER BY started_at DESC
LIMIT 5;
