-- ============================================================================
-- Haul Store Roster v1 — explicit Haul-level shopping destinations
--
-- Repository-only, reviewed/idempotent SQL. Do not apply to production without
-- separate deployment authorization.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_haul_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  haul_id UUID NOT NULL REFERENCES public.grocery_hauls(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  retailer TEXT NOT NULL,
  store_name TEXT NULL,
  store_location TEXT NULL,
  address_line1 TEXT NULL,
  city TEXT NULL,
  region TEXT NULL,
  postal_code TEXT NULL,
  country_code TEXT NULL,
  latitude DOUBLE PRECISION NULL,
  longitude DOUBLE PRECISION NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'serpapi')),
  provider_place_id TEXT NULL,
  provider_data_id TEXT NULL,
  provider_location TEXT NULL,
  manual_identity_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT grocery_haul_stores_retailer_nonblank CHECK (btrim(retailer) <> ''),
  CONSTRAINT grocery_haul_stores_provider_place_requires_serpapi CHECK (
    provider_place_id IS NULL OR source = 'serpapi'
  ),
  CONSTRAINT grocery_haul_stores_manual_key_requires_manual CHECK (
    manual_identity_key IS NULL OR source = 'manual'
  )
);

CREATE INDEX IF NOT EXISTS idx_grocery_haul_stores_haul_person
  ON public.grocery_haul_stores (haul_id, person_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_haul_stores_haul_provider_place
  ON public.grocery_haul_stores (haul_id, provider_place_id)
  WHERE provider_place_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_grocery_haul_stores_haul_manual_identity
  ON public.grocery_haul_stores (haul_id, manual_identity_key)
  WHERE manual_identity_key IS NOT NULL;

ALTER TABLE public.grocery_haul_items
  ADD COLUMN IF NOT EXISTS haul_store_id UUID NULL
    REFERENCES public.grocery_haul_stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_grocery_haul_items_haul_store
  ON public.grocery_haul_items (haul_id, haul_store_id)
  WHERE haul_store_id IS NOT NULL;

ALTER TABLE public.grocery_haul_stores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'grocery_haul_stores'
      AND policyname = 'Users can read own grocery haul stores'
  ) THEN
    CREATE POLICY "Users can read own grocery haul stores"
      ON public.grocery_haul_stores
      FOR SELECT
      USING (
        person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.guard_grocery_haul_store_roster()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  haul_status TEXT;
BEGIN
  SELECT status INTO haul_status
  FROM public.grocery_hauls
  WHERE id = COALESCE(NEW.haul_id, OLD.haul_id)
    AND person_id = COALESCE(NEW.person_id, OLD.person_id);

  IF haul_status IS NULL THEN
    RAISE EXCEPTION 'HAUL_STORE_ROSTER_HAUL_NOT_FOUND';
  END IF;

  IF haul_status <> 'planned' THEN
    RAISE EXCEPTION 'HAUL_STORE_ROSTER_NOT_DRAFT';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_grocery_haul_store_roster ON public.grocery_haul_stores;
CREATE TRIGGER trg_guard_grocery_haul_store_roster
  BEFORE INSERT OR UPDATE OR DELETE ON public.grocery_haul_stores
  FOR EACH ROW EXECUTE FUNCTION public.guard_grocery_haul_store_roster();

CREATE OR REPLACE FUNCTION public.remove_grocery_haul_store(
  p_person_id UUID,
  p_haul_id UUID,
  p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  haul_status TEXT;
  store_row public.grocery_haul_stores%ROWTYPE;
  affected_count INTEGER := 0;
BEGIN
  SELECT status INTO haul_status
  FROM public.grocery_hauls
  WHERE id = p_haul_id
    AND person_id = p_person_id;

  IF haul_status IS NULL THEN
    RAISE EXCEPTION 'HAUL_STORE_ROSTER_HAUL_NOT_FOUND';
  END IF;

  IF haul_status <> 'planned' THEN
    RAISE EXCEPTION 'HAUL_STORE_ROSTER_NOT_DRAFT';
  END IF;

  SELECT * INTO store_row
  FROM public.grocery_haul_stores
  WHERE id = p_store_id
    AND haul_id = p_haul_id
    AND person_id = p_person_id;

  IF store_row.id IS NULL THEN
    RAISE EXCEPTION 'HAUL_STORE_ROSTER_NOT_FOUND';
  END IF;

  UPDATE public.grocery_haul_items AS items
  SET
    haul_store_id = NULL,
    retailer = NULL,
    store_location = NULL,
    postal_code = NULL,
    price_amount = CASE
      WHEN items.price_source = 'sourced' THEN NULL
      ELSE items.price_amount
    END,
    price_currency = CASE
      WHEN items.price_source = 'sourced' THEN NULL
      ELSE items.price_currency
    END,
    price_source = CASE
      WHEN items.price_source = 'sourced' THEN NULL
      ELSE items.price_source
    END,
    source_price_observation_id = CASE
      WHEN items.price_source = 'sourced' THEN NULL
      ELSE items.source_price_observation_id
    END,
    price_retrieved_at = CASE
      WHEN items.price_source = 'sourced' THEN NULL
      ELSE items.price_retrieved_at
    END,
    updated_at = now()
  WHERE items.haul_id = p_haul_id
    AND items.person_id = p_person_id
    AND items.haul_store_id = p_store_id;

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  DELETE FROM public.grocery_haul_stores
  WHERE id = p_store_id
    AND haul_id = p_haul_id
    AND person_id = p_person_id;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'outcome', 'removed',
    'affected_item_count', affected_count
  );
END;
$$;
