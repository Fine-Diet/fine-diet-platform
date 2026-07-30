-- ============================================================================
-- PR3 — Grocery List Purchasing Choices (list-scoped overrides)
--
-- Active shopping identity for a durable Full Haul list item.
-- Does NOT mutate grocery_items.food_object_id, name, quantity, or unit by
-- default. Source-plan shopping overrides and person ingredient resolutions
-- remain explicit opt-ins only.
--
-- Review-first: apply only with founder approval for the target environment.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_list_purchasing_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  grocery_list_id UUID NOT NULL
    REFERENCES public.generated_grocery_lists(id) ON DELETE CASCADE,
  grocery_item_id UUID NOT NULL
    REFERENCES public.grocery_items(id) ON DELETE CASCADE,
  person_id UUID NOT NULL
    REFERENCES public.people(id) ON DELETE CASCADE,

  -- Stable key at write time (grounded food_object_id::unit or unresolved name::unit)
  match_key TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'list_owner_resolved'
    CHECK (status IN (
      'unresolved',
      'list_owner_resolved',
      'suggestion_pending',
      'contributor_accepted',
      'contributor_replaced',
      'contributor_declined',
      'purchased_substitution'
    )),

  food_object_id UUID REFERENCES public.food_objects(id) ON DELETE SET NULL,
  shopping_display_name TEXT,
  purchase_quantity NUMERIC,
  purchase_unit TEXT,
  preferred_product TEXT,
  aisle_category TEXT,
  note TEXT,

  -- Snapshot of required row identity (never treated as writable truth)
  required_name_snapshot TEXT NOT NULL,
  required_unit_snapshot TEXT,

  -- Provenance hooks from the grocery item at write time
  source_plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  source_date_range_start DATE,
  source_date_range_end DATE,

  -- Opt-in write receipts (null until explicit action)
  applied_to_person_resolution_at TIMESTAMPTZ,
  applied_to_plan_override_id UUID
    REFERENCES public.grocery_shopping_overrides(id) ON DELETE SET NULL,

  -- Collaboration hooks (unused in PR3 UI)
  suggested_by_person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_list_purchasing_choices_purchase_quantity_nonnegative
    CHECK (purchase_quantity IS NULL OR purchase_quantity >= 0),
  CONSTRAINT grocery_list_purchasing_choices_list_item_unique
    UNIQUE (grocery_list_id, grocery_item_id)
);

CREATE INDEX IF NOT EXISTS idx_grocery_list_purchasing_choices_list
  ON public.grocery_list_purchasing_choices (grocery_list_id);

CREATE INDEX IF NOT EXISTS idx_grocery_list_purchasing_choices_person_status
  ON public.grocery_list_purchasing_choices (person_id, status);

COMMENT ON TABLE public.grocery_list_purchasing_choices IS
  'List-scoped purchasing identity for durable grocery rows. Does not replace required ingredient truth on grocery_items.';

COMMENT ON COLUMN public.grocery_list_purchasing_choices.food_object_id IS
  'Active list-level product grounding for shopping/Full Haul. grocery_items.food_object_id remains derivation truth.';

-- ============================================================================
-- RLS — owner-only via list person_id (person_id column must match list owner)
-- ============================================================================

ALTER TABLE public.grocery_list_purchasing_choices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own grocery_list_purchasing_choices"
  ON public.grocery_list_purchasing_choices;
DROP POLICY IF EXISTS "Users can insert own grocery_list_purchasing_choices"
  ON public.grocery_list_purchasing_choices;
DROP POLICY IF EXISTS "Users can update own grocery_list_purchasing_choices"
  ON public.grocery_list_purchasing_choices;
DROP POLICY IF EXISTS "Users can delete own grocery_list_purchasing_choices"
  ON public.grocery_list_purchasing_choices;

CREATE POLICY "Users can read own grocery_list_purchasing_choices"
  ON public.grocery_list_purchasing_choices
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own grocery_list_purchasing_choices"
  ON public.grocery_list_purchasing_choices
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own grocery_list_purchasing_choices"
  ON public.grocery_list_purchasing_choices
  FOR UPDATE
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own grocery_list_purchasing_choices"
  ON public.grocery_list_purchasing_choices
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS grocery_list_purchasing_choices_updated_at
  ON public.grocery_list_purchasing_choices;
CREATE TRIGGER grocery_list_purchasing_choices_updated_at
  BEFORE UPDATE ON public.grocery_list_purchasing_choices
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();
