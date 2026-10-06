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
-- Performance contract: <% must use the raw indexed columns.
-- scripts/sql/addFoodSearchIndexes.sql defines
--   idx_food_objects_canonical_name_trgm ON canonical_name gin_trgm_ops
--   idx_food_objects_brand_name_trgm ON brand_name gin_trgm_ops
--   (partial: WHERE brand_name IS NOT NULL)
-- Independent read-only EXPLAIN:
--   '<query>' <% lower(canonical_name)  -> Seq Scan
--   '<query>' <% canonical_name         -> Bitmap Index Scan on the trigram index
-- Do not wrap canonical_name or brand_name in lower() inside the <% predicate.
-- Do not add a functional index on lower(column).
--
-- Supabase migration roles cannot set pg_trgm custom GUCs through CREATE
-- FUNCTION ... SET. The function therefore applies transaction-local pg_trgm
-- thresholds at runtime with set_config(..., true). service_role was verified
-- to be allowed to set these transaction-local values. Because set_config is
-- session-affecting, the function is VOLATILE rather than STABLE.
--
-- Retrieval stays in Postgres. The application never loads the catalog to
-- score typos. Candidate count is capped at 12. Queries shorter than 5
-- characters and digit-only barcode queries are rejected inside the function
-- as well as in the application.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.search_food_objects_fuzzy_v1(
  p_query text,
  p_limit integer DEFAULT 12,
  p_min_similarity real DEFAULT 0.30
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
BEGIN
  PERFORM set_config('pg_trgm.similarity_threshold', '0.30', true);
  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.30', true);

  RETURN QUERY
  SELECT
    fo.id,
    GREATEST(
      word_similarity(lower(btrim(p_query)), lower(fo.canonical_name)),
      word_similarity(lower(btrim(p_query)), lower(coalesce(fo.brand_name, '')))
    )::real AS similarity
  FROM public.food_objects fo
  WHERE fo.is_deleted = false
    AND char_length(btrim(coalesce(p_query, ''))) >= 5
    AND btrim(p_query) !~ '^[0-9[:space:]-]+$'
    AND (
      lower(btrim(p_query)) <% fo.canonical_name
      OR (
        fo.brand_name IS NOT NULL
        AND lower(btrim(p_query)) <% fo.brand_name
      )
    )
    AND GREATEST(
      word_similarity(lower(btrim(p_query)), lower(fo.canonical_name)),
      word_similarity(lower(btrim(p_query)), lower(coalesce(fo.brand_name, '')))
    ) >= GREATEST(
      0.30::real,
      LEAST(coalesce(p_min_similarity, 0.30::real), 0.90::real)
    )
  ORDER BY similarity DESC
  LIMIT LEAST(GREATEST(coalesce(p_limit, 12), 1), 12);
END;
$$;

REVOKE ALL ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) TO service_role;

COMMENT ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) IS
  'Capped pg_trgm fallback for food name/brand typos. Exact and prefix search remain the caller''s first pass. Execute is service_role only.';
