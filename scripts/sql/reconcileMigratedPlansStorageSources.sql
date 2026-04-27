-- ============================================================================
-- Packet 58 — Migrated Plans-Lane Storage Source Reconciliation
--
-- Dedicated tables are now authoritative for reusable planning and grocery
-- state. Legacy people.metadata is retained only as a non-destructive
-- compatibility/backfill source. These columns make migrated-row origin
-- inspectable for future admin/support/debug tooling.
-- ============================================================================

ALTER TABLE public.reusable_plan_day_templates
  ADD COLUMN IF NOT EXISTS storage_source TEXT NOT NULL DEFAULT 'table_direct';
ALTER TABLE public.reusable_plan_day_templates
  ADD COLUMN IF NOT EXISTS legacy_metadata_backfilled_at TIMESTAMPTZ;

ALTER TABLE public.reusable_plan_week_patterns
  ADD COLUMN IF NOT EXISTS storage_source TEXT NOT NULL DEFAULT 'table_direct';
ALTER TABLE public.reusable_plan_week_patterns
  ADD COLUMN IF NOT EXISTS legacy_metadata_backfilled_at TIMESTAMPTZ;

ALTER TABLE public.grocery_ingredient_resolutions
  ADD COLUMN IF NOT EXISTS storage_source TEXT NOT NULL DEFAULT 'table_direct';
ALTER TABLE public.grocery_ingredient_resolutions
  ADD COLUMN IF NOT EXISTS legacy_metadata_backfilled_at TIMESTAMPTZ;

ALTER TABLE public.pantry_on_hand_items
  ADD COLUMN IF NOT EXISTS storage_source TEXT NOT NULL DEFAULT 'table_direct';
ALTER TABLE public.pantry_on_hand_items
  ADD COLUMN IF NOT EXISTS legacy_metadata_backfilled_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reusable_plan_day_templates_storage_source_check'
  ) THEN
    ALTER TABLE public.reusable_plan_day_templates
      ADD CONSTRAINT reusable_plan_day_templates_storage_source_check
      CHECK (storage_source IN ('table_direct', 'legacy_metadata'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reusable_plan_week_patterns_storage_source_check'
  ) THEN
    ALTER TABLE public.reusable_plan_week_patterns
      ADD CONSTRAINT reusable_plan_week_patterns_storage_source_check
      CHECK (storage_source IN ('table_direct', 'legacy_metadata'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grocery_ingredient_resolutions_storage_source_check'
  ) THEN
    ALTER TABLE public.grocery_ingredient_resolutions
      ADD CONSTRAINT grocery_ingredient_resolutions_storage_source_check
      CHECK (storage_source IN ('table_direct', 'legacy_metadata'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pantry_on_hand_items_storage_source_check'
  ) THEN
    ALTER TABLE public.pantry_on_hand_items
      ADD CONSTRAINT pantry_on_hand_items_storage_source_check
      CHECK (storage_source IN ('table_direct', 'legacy_metadata'));
  END IF;
END $$;

UPDATE public.reusable_plan_day_templates AS template_row
SET
  storage_source = 'legacy_metadata',
  legacy_metadata_backfilled_at = COALESCE(
    template_row.legacy_metadata_backfilled_at,
    template_row.created_at
  )
FROM public.people
WHERE template_row.person_id = people.id
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(people.metadata->'plan_day_templates') = 'array'
          THEN people.metadata->'plan_day_templates'
        ELSE '[]'::jsonb
      END
    ) AS legacy_template
    WHERE legacy_template->>'id' = template_row.id::text
  );

UPDATE public.reusable_plan_week_patterns AS pattern_row
SET
  storage_source = 'legacy_metadata',
  legacy_metadata_backfilled_at = COALESCE(
    pattern_row.legacy_metadata_backfilled_at,
    pattern_row.created_at
  )
FROM public.people
WHERE pattern_row.person_id = people.id
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(people.metadata->'plan_week_patterns') = 'array'
          THEN people.metadata->'plan_week_patterns'
        ELSE '[]'::jsonb
      END
    ) AS legacy_pattern
    WHERE legacy_pattern->>'id' = pattern_row.id::text
  );

UPDATE public.grocery_ingredient_resolutions AS resolution_row
SET
  storage_source = 'legacy_metadata',
  legacy_metadata_backfilled_at = COALESCE(
    resolution_row.legacy_metadata_backfilled_at,
    resolution_row.created_at
  )
FROM public.people
WHERE resolution_row.person_id = people.id
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(people.metadata->'grocery_ingredient_resolutions') = 'array'
          THEN people.metadata->'grocery_ingredient_resolutions'
        ELSE '[]'::jsonb
      END
    ) AS legacy_resolution
    WHERE legacy_resolution->>'key' = resolution_row.key
  );

UPDATE public.pantry_on_hand_items AS pantry_row
SET
  storage_source = 'legacy_metadata',
  legacy_metadata_backfilled_at = COALESCE(
    pantry_row.legacy_metadata_backfilled_at,
    pantry_row.created_at
  )
FROM public.people
WHERE pantry_row.person_id = people.id
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(people.metadata->'pantry_on_hand_items') = 'array'
          THEN people.metadata->'pantry_on_hand_items'
        ELSE '[]'::jsonb
      END
    ) AS legacy_pantry
    WHERE legacy_pantry->>'key' = pantry_row.key
  );

COMMENT ON COLUMN public.reusable_plan_day_templates.storage_source IS
  'Authoritative table row origin: table_direct for new writes, legacy_metadata for compatibility/backfilled records.';
COMMENT ON COLUMN public.reusable_plan_week_patterns.storage_source IS
  'Authoritative table row origin: table_direct for new writes, legacy_metadata for compatibility/backfilled records.';
COMMENT ON COLUMN public.grocery_ingredient_resolutions.storage_source IS
  'Authoritative table row origin: table_direct for new writes, legacy_metadata for compatibility/backfilled records.';
COMMENT ON COLUMN public.pantry_on_hand_items.storage_source IS
  'Authoritative table row origin: table_direct for new writes, legacy_metadata for compatibility/backfilled records.';

COMMENT ON COLUMN public.reusable_plan_day_templates.legacy_metadata_backfilled_at IS
  'Set when this table row was copied from legacy people.metadata compatibility state. Legacy metadata is retained non-destructively.';
COMMENT ON COLUMN public.reusable_plan_week_patterns.legacy_metadata_backfilled_at IS
  'Set when this table row was copied from legacy people.metadata compatibility state. Legacy metadata is retained non-destructively.';
COMMENT ON COLUMN public.grocery_ingredient_resolutions.legacy_metadata_backfilled_at IS
  'Set when this table row was copied from legacy people.metadata compatibility state. Legacy metadata is retained non-destructively.';
COMMENT ON COLUMN public.pantry_on_hand_items.legacy_metadata_backfilled_at IS
  'Set when this table row was copied from legacy people.metadata compatibility state. Legacy metadata is retained non-destructively.';
