-- Pre-live Stripe identity isolation; apply only after reviewing the sandbox
-- ownership audit. Existing stripe_customers records are preserved unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS public.stripe_customer_accounts (
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean NOT NULL,
  stripe_customer_id text NOT NULL CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id,stripe_account_id,livemode),
  UNIQUE (stripe_account_id,livemode,stripe_customer_id)
);
ALTER TABLE public.stripe_customer_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_customer_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.stripe_customer_accounts TO service_role;
-- Do not backfill existing stripe_customers here. That statement lives in
-- stripeCustomerAccountsLegacySandboxBackfill.sql and must stay out of the
-- production apply. The application creates account-scoped rows at checkout.
COMMIT;
