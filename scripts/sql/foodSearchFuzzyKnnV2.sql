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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 48), 1), 48);
  v_min_similarity real := GREATEST(
    0.0::real,
    LEAST(coalesce(p_min_similarity, 0.20::real), 1.0::real)
  );
  v_token_count integer;
  v_remaining integer;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_variant text;
  v_rec record;
BEGIN
  IF char_length(v_query) < 5
     OR v_query ~ '^[0-9[:space:]-]+$' THEN
    RETURN;
  END IF;

  SELECT count(*)
  INTO v_token_count
  FROM regexp_split_to_table(v_query, '[^a-z0-9]+') AS token
  WHERE token <> '';

  v_remaining := v_limit;

  IF v_token_count = 1 AND v_query ~ '^[a-z0-9]+$' THEN
    -- Adjacent-transposition rescue, e.g. amyul -> amylu.
    -- Each variant is independently bounded and uses the existing trigram
    -- indexes for ILIKE containment.
    FOR i IN 1..greatest(char_length(v_query) - 1, 0) LOOP
      EXIT WHEN v_remaining <= 0;

      v_variant :=
        substring(v_query from 1 for i - 1)
        || substring(v_query from i + 1 for 1)
        || substring(v_query from i for 1)
        || substring(v_query from i + 2);

      CONTINUE WHEN v_variant = v_query;

      FOR v_rec IN EXECUTE $q$
        SELECT fo.id
        FROM public.food_objects fo
        WHERE fo.is_deleted = false
          AND NOT (fo.id = ANY($2))
          AND (
            fo.canonical_name ILIKE ('%' || $1 || '%')
            OR (
              fo.brand_name IS NOT NULL
              AND fo.brand_name ILIKE ('%' || $1 || '%')
            )
          )
        ORDER BY fo.id
        LIMIT LEAST(4, $3)
      $q$ USING v_variant, v_seen, v_remaining
      LOOP
        id := v_rec.id;
        similarity := 0.80::real;
        RETURN NEXT;
        v_seen := array_append(v_seen, v_rec.id);
        v_remaining := v_remaining - 1;
        EXIT WHEN v_remaining <= 0;
      END LOOP;
    END LOOP;

    -- Whole-string canonical-name nearest neighbors.
    IF v_remaining > 0 THEN
      FOR v_rec IN EXECUTE $q$
        SELECT
          fo.id,
          (1.0 - (fo.canonical_name <-> $1))::real AS score
        FROM public.food_objects fo
        WHERE fo.is_deleted = false
          AND NOT (fo.id = ANY($2))
        ORDER BY fo.canonical_name <-> $1
        LIMIT $3
      $q$ USING v_query, v_seen, v_remaining
      LOOP
        CONTINUE WHEN v_rec.score < v_min_similarity;
        id := v_rec.id;
        similarity := v_rec.score;
        RETURN NEXT;
        v_seen := array_append(v_seen, v_rec.id);
        v_remaining := v_remaining - 1;
        EXIT WHEN v_remaining <= 0;
      END LOOP;
    END IF;

    -- Whole-string brand nearest neighbors.
    IF v_remaining > 0 THEN
      FOR v_rec IN EXECUTE $q$
        SELECT
          fo.id,
          (1.0 - (fo.brand_name <-> $1))::real AS score
        FROM public.food_objects fo
        WHERE fo.is_deleted = false
          AND fo.brand_name IS NOT NULL
          AND NOT (fo.id = ANY($2))
        ORDER BY fo.brand_name <-> $1
        LIMIT $3
      $q$ USING v_query, v_seen, v_remaining
      LOOP
        CONTINUE WHEN v_rec.score < v_min_similarity;
        id := v_rec.id;
        similarity := v_rec.score;
        RETURN NEXT;
        v_seen := array_append(v_seen, v_rec.id);
        v_remaining := v_remaining - 1;
        EXIT WHEN v_remaining <= 0;
      END LOOP;
    END IF;

    RETURN;
  END IF;

  -- Multi-token typo fallback keeps word-level nearest-neighbor semantics,
  -- but still performs two bounded GiST KNN scans rather than a broad threshold
  -- scan across the catalog.
  IF v_remaining > 0 THEN
    FOR v_rec IN EXECUTE $q$
      SELECT
        fo.id,
        (1.0 - ($1 <<-> fo.canonical_name))::real AS score
      FROM public.food_objects fo
      WHERE fo.is_deleted = false
      ORDER BY $1 <<-> fo.canonical_name
      LIMIT $2
    $q$ USING v_query, LEAST(24, v_remaining)
    LOOP
      CONTINUE WHEN v_rec.score < v_min_similarity;
      id := v_rec.id;
      similarity := v_rec.score;
      RETURN NEXT;
      v_seen := array_append(v_seen, v_rec.id);
      v_remaining := v_remaining - 1;
      EXIT WHEN v_remaining <= 0;
    END LOOP;
  END IF;

  IF v_remaining > 0 THEN
    FOR v_rec IN EXECUTE $q$
      SELECT
        fo.id,
        (1.0 - ($1 <<-> fo.brand_name))::real AS score
      FROM public.food_objects fo
      WHERE fo.is_deleted = false
        AND fo.brand_name IS NOT NULL
        AND NOT (fo.id = ANY($2))
      ORDER BY $1 <<-> fo.brand_name
      LIMIT $3
    $q$ USING v_query, v_seen, LEAST(24, v_remaining)
    LOOP
      CONTINUE WHEN v_rec.score < v_min_similarity;
      id := v_rec.id;
      similarity := v_rec.score;
      RETURN NEXT;
      v_seen := array_append(v_seen, v_rec.id);
      v_remaining := v_remaining - 1;
      EXIT WHEN v_remaining <= 0;
    END LOOP;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.search_food_objects_fuzzy_v2(text, integer, real) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_food_objects_fuzzy_v2(text, integer, real) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_food_objects_fuzzy_v2(text, integer, real) TO service_role;

COMMENT ON FUNCTION public.search_food_objects_fuzzy_v2(text, integer, real) IS
  'Bounded pg_trgm GiST nearest-neighbor fallback for food name/brand typos. Returns at most 48 candidates for caller-side acceptance/ranking. Execute is service_role only.';
