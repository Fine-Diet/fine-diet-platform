-- ============================================================================
-- Packet 3 — Durable Grocery Shopping Overrides
--
-- Person-scoped shopping preferences layered on required grocery truth.
-- Required amounts remain on grocery_items; overrides never mutate planned
-- meals, NDS, or canonical ingredient identity.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_shopping_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,

  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,

  -- Stable deterministic match key aligned with grocery derivation:
  -- grounded:   `${food_object_id}::${normalized_unit}`
  -- unresolved: `${name_lower}::${normalized_unit}`
  match_key TEXT NOT NULL,

  food_object_id UUID REFERENCES public.food_objects(id) ON DELETE SET NULL,
  unresolved_name TEXT,
  unresolved_unit TEXT,

  shopping_display_name TEXT,
  purchase_quantity NUMERIC,
  purchase_unit TEXT,
  preferred_product TEXT,
  aisle_category TEXT,
  note TEXT,

  match_status TEXT NOT NULL DEFAULT 'active'
    CHECK (match_status IN ('active', 'unmatched', 'retired')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_shopping_overrides_purchase_quantity_nonnegative
    CHECK (purchase_quantity IS NULL OR purchase_quantity >= 0),
  CONSTRAINT grocery_shopping_overrides_scope_match_key_unique
    UNIQUE (person_id, plan_id, date_range_start, date_range_end, match_key)
);

CREATE INDEX IF NOT EXISTS idx_grocery_shopping_overrides_person_scope
  ON public.grocery_shopping_overrides (
    person_id,
    plan_id,
    date_range_start,
    date_range_end
  );

CREATE INDEX IF NOT EXISTS idx_grocery_shopping_overrides_person_status
  ON public.grocery_shopping_overrides (person_id, match_status);

COMMENT ON TABLE public.grocery_shopping_overrides IS
  'User shopping preferences for grocery list scopes. Does not replace required ingredient truth.';

COMMENT ON COLUMN public.grocery_shopping_overrides.match_key IS
  'Conservative deterministic key for reapplying overrides after regeneration.';

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.grocery_shopping_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own grocery_shopping_overrides"
  ON public.grocery_shopping_overrides;
DROP POLICY IF EXISTS "Users can insert own grocery_shopping_overrides"
  ON public.grocery_shopping_overrides;
DROP POLICY IF EXISTS "Users can update own grocery_shopping_overrides"
  ON public.grocery_shopping_overrides;
DROP POLICY IF EXISTS "Users can delete own grocery_shopping_overrides"
  ON public.grocery_shopping_overrides;

CREATE POLICY "Users can read own grocery_shopping_overrides"
  ON public.grocery_shopping_overrides
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own grocery_shopping_overrides"
  ON public.grocery_shopping_overrides
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own grocery_shopping_overrides"
  ON public.grocery_shopping_overrides
  FOR UPDATE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own grocery_shopping_overrides"
  ON public.grocery_shopping_overrides
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS grocery_shopping_overrides_updated_at
  ON public.grocery_shopping_overrides;
CREATE TRIGGER grocery_shopping_overrides_updated_at
  BEFORE UPDATE ON public.grocery_shopping_overrides
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();
