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
--
-- Retrieval is intentionally broader than display acceptance:
-- - SQL returns at most 48 candidates.
-- - Application-side Damerau-Levenshtein/Dice rescoring accepts at most 12.
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
  p_limit integer DEFAULT 48,
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
      LEAST(GREATEST(coalesce(p_limit, 48), 1), 48) AS lim,
      GREATEST(0.0::real, LEAST(coalesce(p_min_similarity, 0.20::real), 1.0::real)) AS min_sim
  ),
  eligible AS (
    SELECT
      q,
      lim,
      min_sim,
      (
        SELECT count(*)
        FROM regexp_split_to_table(q, '[^a-z0-9]+') AS token
        WHERE token <> ''
      ) AS token_count
    FROM params
    WHERE char_length(q) >= 5
      AND q !~ '^[0-9[:space:]-]+$'
  ),
  swaps AS (
    SELECT
      e.q,
      substring(e.q from 1 for i - 1)
      || substring(e.q from i + 1 for 1)
      || substring(e.q from i for 1)
      || substring(e.q from i + 2) AS variant
    FROM eligible e
    CROSS JOIN LATERAL generate_series(1, greatest(char_length(e.q) - 1, 0)) AS g(i)
    WHERE e.token_count = 1
      AND e.q ~ '^[a-z0-9]+$'
      AND char_length(e.q) BETWEEN 5 AND 32
  ),
  transposition_candidates AS (
    SELECT hit.id, 0.80::real AS score
    FROM swaps s
    CROSS JOIN LATERAL (
      SELECT fo.id
      FROM public.food_objects fo
      WHERE fo.is_deleted = false
        AND s.variant <> s.q
        AND (
          fo.canonical_name ILIKE ('%' || s.variant || '%')
          OR (
            fo.brand_name IS NOT NULL
            AND fo.brand_name ILIKE ('%' || s.variant || '%')
          )
        )
      ORDER BY fo.id
      LIMIT 4
    ) AS hit
  ),
  canonical_string AS (
    SELECT fo.id, (1.0 - (fo.canonical_name <-> e.q))::real AS score
    FROM eligible e
    CROSS JOIN LATERAL (
      SELECT id, canonical_name
      FROM public.food_objects
      WHERE is_deleted = false
      ORDER BY canonical_name <-> e.q
      LIMIT 16
    ) fo
  ),
  brand_string AS (
    SELECT fo.id, (1.0 - (fo.brand_name <-> e.q))::real AS score
    FROM eligible e
    CROSS JOIN LATERAL (
      SELECT id, brand_name
      FROM public.food_objects
      WHERE is_deleted = false
        AND brand_name IS NOT NULL
      ORDER BY brand_name <-> e.q
      LIMIT 16
    ) fo
  ),
  canonical_word AS (
    SELECT fo.id, (1.0 - (e.q <<-> fo.canonical_name))::real AS score
    FROM eligible e
    CROSS JOIN LATERAL (
      SELECT id, canonical_name
      FROM public.food_objects
      WHERE is_deleted = false
      ORDER BY e.q <<-> canonical_name
      LIMIT 16
    ) fo
    WHERE e.token_count > 1
  ),
  brand_word AS (
    SELECT fo.id, (1.0 - (e.q <<-> fo.brand_name))::real AS score
    FROM eligible e
    CROSS JOIN LATERAL (
      SELECT id, brand_name
      FROM public.food_objects
      WHERE is_deleted = false
        AND brand_name IS NOT NULL
      ORDER BY e.q <<-> brand_name
      LIMIT 16
    ) fo
    WHERE e.token_count > 1
  ),
  combined AS (
    SELECT id, max(score)::real AS score
    FROM (
      SELECT * FROM transposition_candidates
      UNION ALL
      SELECT * FROM canonical_string
      UNION ALL
      SELECT * FROM brand_string
      UNION ALL
      SELECT * FROM canonical_word
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
  'Bounded pg_trgm GiST nearest-neighbor fallback for food name/brand typos. Returns at most 48 candidates for caller-side acceptance/ranking. Execute is service_role only.';
