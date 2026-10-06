-- ============================================================================
-- Bounded trigram fallback for food search.
--
-- Production DDL is a separate gate. The application calls
-- public.search_food_objects_fuzzy_v1 and treats a missing function as a
-- non-fatal skip.
--
-- pg_trgm 1.6 is already installed in production. This script still creates
-- the extension if a fresh database does not have it.
--
-- Performance contract:
--   - keep indexed food columns raw inside pg_trgm operators
--   - canonical_name and brand_name use existing gin_trgm_ops indexes
--   - avoid lower(column) in the indexed predicate
--
-- Supabase migration roles cannot set pg_trgm custom GUCs through CREATE
-- FUNCTION ... SET. Thresholds are therefore applied transaction-locally with
-- set_config(..., true). The function is VOLATILE because it sets local GUCs.
--
-- Retrieval strategy:
--   * single-token typos: use indexed % similarity at a lower candidate
--     threshold plus an adjacent-transposition rescue path. This prevents
--     word_similarity ties from crowding out targets such as:
--       chaqita -> Chiquita
--       amyul   -> Amylu
--       brocolli -> Broccoli
--   * multi-token queries: retain bounded word-similarity retrieval; caller-side
--     token/brand acceptance remains authoritative.
--
-- Candidate count is capped at 12. Queries shorter than 5 characters and
-- digit-only barcode queries are rejected inside the function as well as in
-- the application.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.search_food_objects_fuzzy_v1(
  p_query text,
  p_limit integer DEFAULT 12,
  p_min_similarity real DEFAULT 0.20
)
RETURNS TABLE (
  id uuid,
  similarity real
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 12), 1), 12);
  v_token_count integer;
  v_single_threshold real := GREATEST(
    0.20::real,
    LEAST(coalesce(p_min_similarity, 0.20::real), 0.90::real)
  );
BEGIN
  IF char_length(v_query) < 5
     OR v_query ~ '^[0-9[:space:]-]+$' THEN
    RETURN;
  END IF;

  SELECT count(*)
  INTO v_token_count
  FROM regexp_split_to_table(v_query, '[^a-z0-9]+') AS token
  WHERE token <> '';

  IF v_token_count = 1 AND v_query ~ '^[a-z0-9]+$' THEN
    PERFORM set_config('pg_trgm.similarity_threshold', v_single_threshold::text, true);

    RETURN QUERY
    WITH swaps AS (
      SELECT
        substring(v_query from 1 for i - 1)
        || substring(v_query from i + 1 for 1)
        || substring(v_query from i for 1)
        || substring(v_query from i + 2) AS variant
      FROM generate_series(1, greatest(char_length(v_query) - 1, 0)) AS g(i)
      WHERE char_length(v_query) BETWEEN 5 AND 32
    ),
    base_candidates AS (
      SELECT
        fo.id,
        GREATEST(
          pg_catalog.similarity(v_query, lower(fo.canonical_name)),
          pg_catalog.similarity(v_query, lower(coalesce(fo.brand_name, '')))
        )::real AS score
      FROM public.food_objects fo
      WHERE fo.is_deleted = false
        AND (
          v_query % fo.canonical_name
          OR (
            fo.brand_name IS NOT NULL
            AND v_query % fo.brand_name
          )
        )
    ),
    transposition_candidates AS (
      SELECT
        fo.id,
        0.95::real AS score
      FROM swaps s
      JOIN public.food_objects fo
        ON fo.is_deleted = false
       AND s.variant <> v_query
       AND (
         fo.canonical_name ILIKE ('%' || s.variant || '%')
         OR (
           fo.brand_name IS NOT NULL
           AND fo.brand_name ILIKE ('%' || s.variant || '%')
         )
       )
    ),
    combined AS (
      SELECT candidate_id, max(score)::real AS score
      FROM (
        SELECT id AS candidate_id, score FROM base_candidates
        UNION ALL
        SELECT id AS candidate_id, score FROM transposition_candidates
      ) candidates
      GROUP BY candidate_id
    )
    SELECT
      combined.candidate_id AS id,
      combined.score AS similarity
    FROM combined
    ORDER BY combined.score DESC, combined.candidate_id
    LIMIT v_limit;

    RETURN;
  END IF;

  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.30', true);

  RETURN QUERY
  SELECT
    fo.id,
    GREATEST(
      word_similarity(v_query, lower(fo.canonical_name)),
      word_similarity(v_query, lower(coalesce(fo.brand_name, '')))
    )::real AS similarity
  FROM public.food_objects fo
  WHERE fo.is_deleted = false
    AND (
      v_query <% fo.canonical_name
      OR (
        fo.brand_name IS NOT NULL
        AND v_query <% fo.brand_name
      )
    )
    AND GREATEST(
      word_similarity(v_query, lower(fo.canonical_name)),
      word_similarity(v_query, lower(coalesce(fo.brand_name, '')))
    ) >= 0.30::real
  ORDER BY similarity DESC, fo.id
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) TO service_role;

COMMENT ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) IS
  'Capped pg_trgm fallback for food name/brand typos. Single-token typos use indexed similarity plus adjacent-transposition rescue; multi-token queries use bounded word similarity. Exact and prefix search remain the caller''s first pass. Execute is service_role only.';
