-- DO NOT APPLY TO PRODUCTION.
--
-- Tags every current public.stripe_customers row as a test-mode customer of the
-- legacy sandbox acct_1T1s86ARcbgSDadA. On 2026-11-02 production had four such
-- rows. Applying this would record that ownership without a fresh per-row
-- audit. Checkout creates account-scoped mappings itself; this statement is
-- retained only as the reviewed, separate backfill that used to sit inside
-- stripeCustomerAccountsPrelive.sql.
--
-- Requires stripeCustomerAccountsPrelive.sql to have been applied first.

INSERT INTO public.stripe_customer_accounts
  (person_id,stripe_account_id,livemode,stripe_customer_id,email)
SELECT person_id,'acct_1T1s86ARcbgSDadA',false,stripe_customer_id,email
FROM public.stripe_customers
ON CONFLICT (person_id,stripe_account_id,livemode) DO NOTHING;
