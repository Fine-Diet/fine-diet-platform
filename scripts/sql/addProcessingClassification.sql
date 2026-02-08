-- ============================================================================
-- Add Processing Classification Fields to food_objects
-- ============================================================================
-- 
-- Adds support for Fine Diet's processing_class classification system.
-- NOVA levels are DERIVED from processing_class - never stored as source of truth.
--
-- Processing Classes:
-- - whole: Unprocessed whole foods (maps to NOVA 1)
-- - minimally_processed: Minimally processed (maps to NOVA 2)
-- - processed: Processed foods (maps to NOVA 3)
-- - ultra_processed: Ultra-processed foods (maps to NOVA 4)
--
-- Admin overrides are stored separately to preserve heuristic values.
-- ============================================================================

-- Create enum type for processing_class
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processing_class_enum') THEN
    CREATE TYPE processing_class_enum AS ENUM (
      'whole',
      'minimally_processed',
      'processed',
      'ultra_processed'
    );
  END IF;
END $$;

-- Create enum type for processing_source
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processing_source_enum') THEN
    CREATE TYPE processing_source_enum AS ENUM (
      'heuristic',
      'admin_override'
    );
  END IF;
END $$;

-- Add processing classification columns to food_objects
-- Heuristic values (from automated classifier)
ALTER TABLE public.food_objects 
ADD COLUMN IF NOT EXISTS processing_class processing_class_enum;

COMMENT ON COLUMN public.food_objects.processing_class IS 
  'Fine Diet processing classification (heuristic). NOVA is derived from this.';

ALTER TABLE public.food_objects 
ADD COLUMN IF NOT EXISTS classifier_version TEXT;

COMMENT ON COLUMN public.food_objects.classifier_version IS 
  'Version string of the classifier that set processing_class';

ALTER TABLE public.food_objects 
ADD COLUMN IF NOT EXISTS classifier_confidence NUMERIC(3,2) CHECK (classifier_confidence >= 0 AND classifier_confidence <= 1);

COMMENT ON COLUMN public.food_objects.classifier_confidence IS 
  'Confidence score (0-1) from the classifier';

ALTER TABLE public.food_objects 
ADD COLUMN IF NOT EXISTS processing_source processing_source_enum;

COMMENT ON COLUMN public.food_objects.processing_source IS 
  'Source of the processing classification (heuristic or admin_override)';

-- Admin override fields (preserve heuristic, store override separately)
ALTER TABLE public.food_objects 
ADD COLUMN IF NOT EXISTS processing_class_override processing_class_enum;

COMMENT ON COLUMN public.food_objects.processing_class_override IS 
  'Admin override for processing_class (takes precedence over heuristic)';

ALTER TABLE public.food_objects 
ADD COLUMN IF NOT EXISTS override_reason TEXT;

COMMENT ON COLUMN public.food_objects.override_reason IS 
  'Reason for the admin processing classification override';

ALTER TABLE public.food_objects 
ADD COLUMN IF NOT EXISTS override_at TIMESTAMPTZ;

COMMENT ON COLUMN public.food_objects.override_at IS 
  'Timestamp when the override was applied';

ALTER TABLE public.food_objects 
ADD COLUMN IF NOT EXISTS override_by UUID;

COMMENT ON COLUMN public.food_objects.override_by IS 
  'Admin user ID who applied the override';

-- Add index for filtering by processing class
CREATE INDEX IF NOT EXISTS idx_food_objects_processing_class 
ON public.food_objects (processing_class) 
WHERE processing_class IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_food_objects_processing_override 
ON public.food_objects (processing_class_override) 
WHERE processing_class_override IS NOT NULL;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this after migration to verify:

-- Check columns exist
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'food_objects'
  AND column_name IN (
    'processing_class',
    'classifier_version',
    'classifier_confidence',
    'processing_source',
    'processing_class_override',
    'override_reason',
    'override_at',
    'override_by'
  )
ORDER BY column_name;

-- Check enum types exist
SELECT typname, enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE typname IN ('processing_class_enum', 'processing_source_enum')
ORDER BY typname, enumsortorder;
