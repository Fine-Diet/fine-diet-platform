-- ============================================================================
-- Food Search Fuzzy v2: bounded nearest-neighbor typo retrieval.
--
-- IMPORTANT:
-- - The two CREATE INDEX CONCURRENTLY statements must run outside a transaction.
-- - The function is service-role only and SECURITY INVOKER.
-- - v1 remains in place for rollback/history; application code calls v2.
--
-- Why GiST:
-- pg_trgm GIN is excellent for threshold filtering, but a low typo threshold
-- can produce thousands of lossy candidates on the current food_objects corpus.
-- GiST supports nearest-neighbor ordering (<-> and <<->), so we can ask only
-- for the closest candidates and keep latency bounded.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_food_objects_canonical_name_gist_trgm_active
  ON public.food_objects
  USING gist (canonical_name gist_trgm_ops(siglen=64))
  WHERE is_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_food_objects_brand_name_gist_trgm_active
  ON public.food_objects
  USING gist (brand_name gist_trgm_ops(siglen=64))
  WHERE is_deleted = false
    AND brand_name IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_food_objects_fuzzy_v2(
  p_query text,
  p_limit integer DEFAULT 12,
  p_min_similarity real DEFAULT 0.20
)
RETURNS TABLE (
  id uuid,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      lower(btrim(coalesce(p_query, ''))) AS q,
      LEAST(GREATEST(coalesce(p_limit, 12), 1), 12) AS lim,
      GREATEST(0.0::real, LEAST(coalesce(p_min_similarity, 0.20::real), 1.0::real)) AS min_sim
  ),
  eligible AS (
    SELECT *
    FROM params
    WHERE char_length(q) >= 5
      AND q !~ '^[0-9[:space:]-]+$'
  ),
  canonical_string AS (
    SELECT
      fo.id,
      (1.0 - (fo.canonical_name <-> e.q))::real AS score
    FROM eligible e
    CROSS JOIN LATERAL (
      SELECT id, canonical_name
      FROM public.food_objects
      WHERE is_deleted = false
      ORDER BY canonical_name <-> e.q
      LIMIT 12
    ) fo
  ),
  canonical_word AS (
    SELECT
      fo.id,
      (1.0 - (e.q <<-> fo.canonical_name))::real AS score
    FROM eligible e
    CROSS JOIN LATERAL (
      SELECT id, canonical_name
      FROM public.food_objects
      WHERE is_deleted = false
      ORDER BY e.q <<-> canonical_name
      LIMIT 12
    ) fo
  ),
  brand_string AS (
    SELECT
      fo.id,
      (1.0 - (fo.brand_name <-> e.q))::real AS score
    FROM eligible e
    CROSS JOIN LATERAL (
      SELECT id, brand_name
      FROM public.food_objects
      WHERE is_deleted = false
        AND brand_name IS NOT NULL
      ORDER BY brand_name <-> e.q
      LIMIT 12
    ) fo
  ),
  brand_word AS (
    SELECT
      fo.id,
      (1.0 - (e.q <<-> fo.brand_name))::real AS score
    FROM eligible e
    CROSS JOIN LATERAL (
      SELECT id, brand_name
      FROM public.food_objects
      WHERE is_deleted = false
        AND brand_name IS NOT NULL
      ORDER BY e.q <<-> brand_name
      LIMIT 12
    ) fo
  ),
  combined AS (
    SELECT id, max(score)::real AS score
    FROM (
      SELECT * FROM canonical_string
      UNION ALL
      SELECT * FROM canonical_word
      UNION ALL
      SELECT * FROM brand_string
      UNION ALL
      SELECT * FROM brand_word
    ) candidates
    GROUP BY id
  )
  SELECT combined.id, combined.score AS similarity
  FROM combined
  CROSS JOIN params
  WHERE combined.score >= params.min_sim
  ORDER BY combined.score DESC, combined.id
  LIMIT (SELECT lim FROM params);
$$;

REVOKE ALL ON FUNCTION public.search_food_objects_fuzzy_v2(text, integer, real) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_food_objects_fuzzy_v2(text, integer, real) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_food_objects_fuzzy_v2(text, integer, real) TO service_role;

COMMENT ON FUNCTION public.search_food_objects_fuzzy_v2(text, integer, real) IS
  'Bounded pg_trgm GiST nearest-neighbor fallback for food name/brand typos. Returns at most 12 candidates for caller-side acceptance/ranking. Execute is service_role only.';
