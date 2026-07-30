-- ============================================================================
-- PR3.2a — Active list quote pointer (quote pool selection)
--
-- Explicit active quote per durable-list item. History remains on
-- grocery_list_price_observations (append-only). Selecting a quote or
-- applying a retailer scenario updates this pointer only.
--
-- Review-first: apply only with founder approval for the target environment.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grocery_list_item_active_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  grocery_list_id UUID NOT NULL
    REFERENCES public.generated_grocery_lists(id) ON DELETE CASCADE,
  grocery_item_id UUID NOT NULL
    REFERENCES public.grocery_items(id) ON DELETE CASCADE,
  observation_id UUID NOT NULL
    REFERENCES public.grocery_list_price_observations(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT grocery_list_item_active_quotes_list_item_unique
    UNIQUE (grocery_list_id, grocery_item_id)
);

CREATE INDEX IF NOT EXISTS idx_grocery_list_item_active_quotes_list
  ON public.grocery_list_item_active_quotes (grocery_list_id);

CREATE INDEX IF NOT EXISTS idx_grocery_list_item_active_quotes_observation
  ON public.grocery_list_item_active_quotes (observation_id);

COMMENT ON TABLE public.grocery_list_item_active_quotes IS
  'Explicit active list-scoped price quote per durable grocery item. Full Haul uses this pointer when compatible; otherwise falls back to newest compatible quote.';

ALTER TABLE public.grocery_list_item_active_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own grocery_list_item_active_quotes"
  ON public.grocery_list_item_active_quotes;
DROP POLICY IF EXISTS "Users can insert own grocery_list_item_active_quotes"
  ON public.grocery_list_item_active_quotes;
DROP POLICY IF EXISTS "Users can update own grocery_list_item_active_quotes"
  ON public.grocery_list_item_active_quotes;
DROP POLICY IF EXISTS "Users can delete own grocery_list_item_active_quotes"
  ON public.grocery_list_item_active_quotes;

CREATE POLICY "Users can read own grocery_list_item_active_quotes"
  ON public.grocery_list_item_active_quotes
  FOR SELECT USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can insert own grocery_list_item_active_quotes"
  ON public.grocery_list_item_active_quotes
  FOR INSERT WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can update own grocery_list_item_active_quotes"
  ON public.grocery_list_item_active_quotes
  FOR UPDATE
  USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "Users can delete own grocery_list_item_active_quotes"
  ON public.grocery_list_item_active_quotes
  FOR DELETE USING (
    person_id IN (SELECT id FROM public.people WHERE auth_user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS grocery_list_item_active_quotes_updated_at
  ON public.grocery_list_item_active_quotes;
CREATE TRIGGER grocery_list_item_active_quotes_updated_at
  BEFORE UPDATE ON public.grocery_list_item_active_quotes
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();
