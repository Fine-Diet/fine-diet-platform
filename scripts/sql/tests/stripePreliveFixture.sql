-- Run only against an isolated, disposable PostgreSQL database.
-- No production connection string or secrets are used.
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.people (id uuid PRIMARY KEY);
CREATE TABLE public.stripe_customers (
  person_id uuid PRIMARY KEY REFERENCES public.people(id),
  stripe_customer_id text UNIQUE NOT NULL,
  email text
);
CREATE TABLE public.stripe_events (
  stripe_event_id text PRIMARY KEY,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  payload jsonb
);
INSERT INTO public.people (id) VALUES
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002');
INSERT INTO public.stripe_customers(person_id,stripe_customer_id,email)
 VALUES ('00000000-0000-0000-0000-000000000001','cus_Sandbox001','local-fixture@example.invalid');
