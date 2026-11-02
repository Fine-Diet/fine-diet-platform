-- Disposable HTTP test fixture only; not a hosted migration.
-- Reuses the existing disposable database roles without adding login accounts.
CREATE TABLE public.offer_entitlements (
  offer_key text NOT NULL REFERENCES public.offers(offer_key),
  entitlement_key text NOT NULL,
  duration_days integer,
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (offer_key, entitlement_key)
);
ALTER TABLE public.offer_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offer_entitlements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_entitlements TO service_role;
