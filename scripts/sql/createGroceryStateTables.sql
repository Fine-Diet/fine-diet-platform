-- ============================================================================
-- Packet 57 — Grocery State Tables
--
-- Moves pantry/on-hand items and user-approved grocery ingredient resolutions
-- out of people.metadata and into dedicated tables while preserving matching
-- and deduction semantics.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_ingredient_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  -- Key is the conservative cleaned ingredient name + normalized unit:
  -- `${cleaned_name_lower}::${normalized_unit}`.
  key TEXT NOT NULL,
  raw_name TEXT NOT NULL,
  unit TEXT,
  food_object_id UUID NOT NULL REFERENCES public.food_objects(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  storage_source TEXT NOT NULL DEFAULT 'table_direct'
    CHECK (storage_source IN ('table_direct', 'legacy_metadata')),
  legacy_metadata_backfilled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_ingredient_resolutions_person_key_unique
    UNIQUE (person_id, key)
);

CREATE INDEX IF NOT EXISTS idx_grocery_resolutions_person_updated
  ON public.grocery_ingredient_resolutions (person_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_grocery_resolutions_food_object
  ON public.grocery_ingredient_resolutions (food_object_id);

COMMENT ON TABLE public.grocery_ingredient_resolutions IS
  'User-approved mappings from unresolved grocery ingredient text/unit to canonical food_objects.';

COMMENT ON COLUMN public.grocery_ingredient_resolutions.key IS
  'Conservative cleaned ingredient name + normalized unit key used during grocery derivation.';

CREATE TABLE IF NOT EXISTS public.pantry_on_hand_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,

  -- Key is canonical food identity + normalized unit:
  -- `${food_object_id}::${normalized_unit}`.
  key TEXT NOT NULL,
  food_object_id UUID NOT NULL REFERENCES public.food_objects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  storage_source TEXT NOT NULL DEFAULT 'table_direct'
    CHECK (storage_source IN ('table_direct', 'legacy_metadata')),
  legacy_metadata_backfilled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pantry_on_hand_items_quantity_nonnegative
    CHECK (quantity IS NULL OR quantity >= 0),
  CONSTRAINT pantry_on_hand_items_person_key_unique
    UNIQUE (person_id, key)
);

CREATE INDEX IF NOT EXISTS idx_pantry_on_hand_person_updated
  ON public.pantry_on_hand_items (person_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_pantry_on_hand_food_object
  ON public.pantry_on_hand_items (food_object_id);

COMMENT ON TABLE public.pantry_on_hand_items IS
  'Explicit user-entered pantry/on-hand quantities keyed by canonical food identity and normalized unit.';

COMMENT ON COLUMN public.pantry_on_hand_items.key IS
  'Canonical food identity + normalized unit key. Deduction never crosses this boundary.';

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.grocery_ingredient_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pantry_on_hand_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own grocery_ingredient_resolutions"
  ON public.grocery_ingredient_resolutions;
DROP POLICY IF EXISTS "Users can insert own grocery_ingredient_resolutions"
  ON public.grocery_ingredient_resolutions;
DROP POLICY IF EXISTS "Users can update own grocery_ingredient_resolutions"
  ON public.grocery_ingredient_resolutions;
DROP POLICY IF EXISTS "Users can delete own grocery_ingredient_resolutions"
  ON public.grocery_ingredient_resolutions;

CREATE POLICY "Users can read own grocery_ingredient_resolutions"
  ON public.grocery_ingredient_resolutions
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own grocery_ingredient_resolutions"
  ON public.grocery_ingredient_resolutions
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own grocery_ingredient_resolutions"
  ON public.grocery_ingredient_resolutions
  FOR UPDATE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own grocery_ingredient_resolutions"
  ON public.grocery_ingredient_resolutions
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can read own pantry_on_hand_items"
  ON public.pantry_on_hand_items;
DROP POLICY IF EXISTS "Users can insert own pantry_on_hand_items"
  ON public.pantry_on_hand_items;
DROP POLICY IF EXISTS "Users can update own pantry_on_hand_items"
  ON public.pantry_on_hand_items;
DROP POLICY IF EXISTS "Users can delete own pantry_on_hand_items"
  ON public.pantry_on_hand_items;

CREATE POLICY "Users can read own pantry_on_hand_items"
  ON public.pantry_on_hand_items
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own pantry_on_hand_items"
  ON public.pantry_on_hand_items
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own pantry_on_hand_items"
  ON public.pantry_on_hand_items
  FOR UPDATE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own pantry_on_hand_items"
  ON public.pantry_on_hand_items
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

-- ============================================================================
-- Deliberate resolution revocations (prevent legacy metadata re-backfill)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_ingredient_resolution_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_ingredient_resolution_revocations_person_key_unique
    UNIQUE (person_id, key)
);

CREATE INDEX IF NOT EXISTS idx_grocery_resolution_revocations_person
  ON public.grocery_ingredient_resolution_revocations (person_id, revoked_at DESC);

COMMENT ON TABLE public.grocery_ingredient_resolution_revocations IS
  'Authoritative tombstones for user-reversed grocery ingredient resolutions.';

ALTER TABLE public.grocery_ingredient_resolution_revocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations;
DROP POLICY IF EXISTS "Users can insert own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations;
DROP POLICY IF EXISTS "Users can delete own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations;

CREATE POLICY "Users can read own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can insert own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can delete own grocery_ingredient_resolution_revocations"
  ON public.grocery_ingredient_resolution_revocations
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

-- ============================================================================
-- updated_at triggers
-- ============================================================================

DROP TRIGGER IF EXISTS grocery_ingredient_resolutions_updated_at
  ON public.grocery_ingredient_resolutions;
CREATE TRIGGER grocery_ingredient_resolutions_updated_at
  BEFORE UPDATE ON public.grocery_ingredient_resolutions
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

DROP TRIGGER IF EXISTS pantry_on_hand_items_updated_at
  ON public.pantry_on_hand_items;
CREATE TRIGGER pantry_on_hand_items_updated_at
  BEFORE UPDATE ON public.pantry_on_hand_items
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

-- ============================================================================
-- Legacy metadata backfill
-- ============================================================================

INSERT INTO public.grocery_ingredient_resolutions (
  person_id,
  key,
  raw_name,
  unit,
  food_object_id,
  canonical_name,
  storage_source,
  legacy_metadata_backfilled_at,
  created_at,
  updated_at
)
SELECT
  people.id,
  resolution->>'key',
  resolution->>'raw_name',
  NULLIF(resolution->>'unit', ''),
  (resolution->>'food_object_id')::uuid,
  resolution->>'canonical_name',
  'legacy_metadata',
  now(),
  CASE
    WHEN (resolution->>'created_at') ~ '^\d{4}-\d{2}-\d{2}T'
      THEN (resolution->>'created_at')::timestamptz
    ELSE now()
  END,
  CASE
    WHEN (resolution->>'updated_at') ~ '^\d{4}-\d{2}-\d{2}T'
      THEN (resolution->>'updated_at')::timestamptz
    ELSE now()
  END
FROM public.people
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(people.metadata->'grocery_ingredient_resolutions') = 'array'
      THEN people.metadata->'grocery_ingredient_resolutions'
    ELSE '[]'::jsonb
  END
) AS resolution
WHERE resolution ? 'key'
  AND resolution ? 'raw_name'
  AND resolution ? 'food_object_id'
  AND resolution ? 'canonical_name'
  AND (resolution->>'food_object_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.food_objects
    WHERE id = (resolution->>'food_object_id')::uuid
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.grocery_ingredient_resolution_revocations AS revoked
    WHERE revoked.person_id = people.id
      AND revoked.key = resolution->>'key'
  )
ON CONFLICT (person_id, key) DO NOTHING;

INSERT INTO public.pantry_on_hand_items (
  person_id,
  key,
  food_object_id,
  name,
  quantity,
  unit,
  storage_source,
  legacy_metadata_backfilled_at,
  updated_at
)
SELECT
  people.id,
  item->>'key',
  (item->>'food_object_id')::uuid,
  item->>'name',
  CASE
    WHEN jsonb_typeof(item->'quantity') = 'number'
      THEN (item->>'quantity')::numeric
    ELSE NULL
  END,
  NULLIF(item->>'unit', ''),
  'legacy_metadata',
  now(),
  CASE
    WHEN (item->>'updated_at') ~ '^\d{4}-\d{2}-\d{2}T'
      THEN (item->>'updated_at')::timestamptz
    ELSE now()
  END
FROM public.people
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(people.metadata->'pantry_on_hand_items') = 'array'
      THEN people.metadata->'pantry_on_hand_items'
    ELSE '[]'::jsonb
  END
) AS item
WHERE item ? 'key'
  AND item ? 'food_object_id'
  AND item ? 'name'
  AND (item->>'food_object_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (
    item->'quantity' IS NULL
    OR jsonb_typeof(item->'quantity') = 'number'
  )
  AND EXISTS (
    SELECT 1 FROM public.food_objects
    WHERE id = (item->>'food_object_id')::uuid
  )
ON CONFLICT (person_id, key) DO NOTHING;
