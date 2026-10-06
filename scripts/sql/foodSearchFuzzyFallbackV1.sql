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
--   - bound every candidate stream before combining it
--
-- Supabase migration roles cannot set pg_trgm custom GUCs through CREATE
-- FUNCTION ... SET. Thresholds are therefore applied transaction-locally with
-- set_config(..., true). The function is VOLATILE because it sets local GUCs.
--
-- Retrieval strategy:
--   * single-token typos:
--       1. independently bounded adjacent-transposition substring rescue
--       2. indexed whole-string similarity at >= 0.30
--       3. word-similarity rescue only when whole-string retrieval is sparse
--   * multi-token queries:
--       bounded word-similarity retrieval; caller-side token/brand acceptance
--       remains authoritative.
--
-- Candidate output is capped at 12. Queries shorter than 5 characters and
-- digit-only barcode queries are rejected inside the function as well as in
-- the application.
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
DECLARE
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 12), 1), 12);
  v_token_count integer;
  v_single_threshold real := GREATEST(
    0.30::real,
    LEAST(coalesce(p_min_similarity, 0.30::real), 0.90::real)
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
    PERFORM set_config('pg_trgm.word_similarity_threshold', '0.30', true);

    DECLARE
      v_seen uuid[] := ARRAY[]::uuid[];
      v_hits uuid[];
      v_variant text;
      v_remaining integer := v_limit;
      v_base_added integer := 0;
    BEGIN
      -- Adjacent-transposition rescue. Each query is independently bounded so
      -- the existing trigram indexes can be used without building a huge
      -- combined candidate relation.
      FOR i IN 1..greatest(char_length(v_query) - 1, 0) LOOP
        EXIT WHEN v_remaining <= 0;

        v_variant :=
          substring(v_query from 1 for i - 1)
          || substring(v_query from i + 1 for 1)
          || substring(v_query from i for 1)
          || substring(v_query from i + 2);

        CONTINUE WHEN v_variant = v_query;

        SELECT coalesce(array_agg(hit.id), ARRAY[]::uuid[])
        INTO v_hits
        FROM (
          SELECT fo.id
          FROM public.food_objects fo
          WHERE fo.is_deleted = false
            AND NOT (fo.id = ANY(v_seen))
            AND (
              fo.canonical_name ILIKE ('%' || v_variant || '%')
              OR (
                fo.brand_name IS NOT NULL
                AND fo.brand_name ILIKE ('%' || v_variant || '%')
              )
            )
          ORDER BY fo.id
          LIMIT v_remaining
        ) AS hit;

        IF cardinality(v_hits) > 0 THEN
          v_seen := v_seen || v_hits;
          v_remaining := v_limit - cardinality(v_seen);
        END IF;
      END LOOP;

      IF cardinality(v_seen) > 0 THEN
        RETURN QUERY
        SELECT candidate_id, 0.95::real
        FROM unnest(v_seen) AS candidate_id;
      END IF;

      IF v_remaining > 0 THEN
        RETURN QUERY
        SELECT
          fo.id,
          GREATEST(
            similarity(v_query, lower(fo.canonical_name)),
            similarity(v_query, lower(coalesce(fo.brand_name, '')))
          )::real AS similarity
        FROM public.food_objects fo
        WHERE fo.is_deleted = false
          AND NOT (fo.id = ANY(v_seen))
          AND (
            v_query % fo.canonical_name
            OR (
              fo.brand_name IS NOT NULL
              AND v_query % fo.brand_name
            )
          )
        ORDER BY GREATEST(
          similarity(v_query, lower(fo.canonical_name)),
          similarity(v_query, lower(coalesce(fo.brand_name, '')))
        ) DESC, fo.id
        LIMIT v_remaining;

        GET DIAGNOSTICS v_base_added = ROW_COUNT;
        v_remaining := v_remaining - v_base_added;
      END IF;

      -- Sparse whole-string retrieval gets one bounded word-similarity rescue.
      IF cardinality(v_seen) = 0 AND v_base_added < 3 AND v_remaining > 0 THEN
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
        ORDER BY GREATEST(
          word_similarity(v_query, lower(fo.canonical_name)),
          word_similarity(v_query, lower(coalesce(fo.brand_name, '')))
        ) DESC, fo.id
        LIMIT v_remaining;
      END IF;

      RETURN;
    END;
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
  ORDER BY GREATEST(
    word_similarity(v_query, lower(fo.canonical_name)),
    word_similarity(v_query, lower(coalesce(fo.brand_name, '')))
  ) DESC, fo.id
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) TO service_role;

COMMENT ON FUNCTION public.search_food_objects_fuzzy_v1(text, integer, real) IS
  'Capped pg_trgm fallback for food name/brand typos. Single-token typos use bounded indexed similarity, adjacent-transposition prefix rescue, and sparse-result word-similarity rescue. Exact and prefix search remain the caller''s first pass. Execute is service_role only.';
