-- Campaign Moments + Communications v1
-- People-native messaging infrastructure for email/SMS campaign moments.
-- Applied to Supabase project tssvlflebugqhtogqdfs as migration:
-- create_campaign_moments_communications_v1

-- Extend people with SMS consent proof / preference metadata.
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS sms_opt_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_consent_source TEXT,
  ADD COLUMN IF NOT EXISTS sms_consent_text TEXT,
  ADD COLUMN IF NOT EXISTS sms_consent_version TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT;

CREATE TABLE IF NOT EXISTS public.campaign_moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('form_submit', 'manual', 'scheduled', 'event')),
  audience_key TEXT,
  channel_policy TEXT NOT NULL DEFAULT 'email_only'
    CHECK (channel_policy IN ('email_only', 'sms_only', 'email_and_sms', 'sms_if_opted_in')),
  template_key TEXT,
  email_subject TEXT,
  email_body TEXT,
  sms_body TEXT,
  schedule_strategy TEXT NOT NULL DEFAULT 'immediate'
    CHECK (schedule_strategy IN ('immediate', 'scheduled', 'delay')),
  scheduled_for TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by_person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  approved_by_person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_moments_status
  ON public.campaign_moments (status, trigger_type);
CREATE INDEX IF NOT EXISTS idx_campaign_moments_scheduled
  ON public.campaign_moments (scheduled_for)
  WHERE scheduled_for IS NOT NULL;

ALTER TABLE public.campaign_moments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage campaign_moments" ON public.campaign_moments;
CREATE POLICY "Service role can manage campaign_moments"
  ON public.campaign_moments FOR ALL
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.communication_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  campaign_key TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  provider TEXT NOT NULL DEFAULT 'mock',
  to_address TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scheduled', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  provider_message_id TEXT,
  provider_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communication_outbox_due
  ON public.communication_outbox (status, scheduled_for, created_at)
  WHERE status IN ('pending', 'scheduled');
CREATE INDEX IF NOT EXISTS idx_communication_outbox_person
  ON public.communication_outbox (person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_outbox_campaign
  ON public.communication_outbox (campaign_key, channel, status);

ALTER TABLE public.communication_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage communication_outbox" ON public.communication_outbox;
CREATE POLICY "Service role can manage communication_outbox"
  ON public.communication_outbox FOR ALL
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.communication_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID REFERENCES public.communication_outbox(id) ON DELETE SET NULL,
  person_id UUID REFERENCES public.people(id) ON DELETE CASCADE,
  campaign_key TEXT,
  channel TEXT CHECK (channel IN ('email', 'sms')),
  provider TEXT,
  event_type TEXT NOT NULL,
  provider_event_id TEXT,
  provider_message_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communication_events_person
  ON public.communication_events (person_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_events_outbox
  ON public.communication_events (outbox_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_events_provider_message
  ON public.communication_events (provider, provider_message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_events_provider_event_unique
  ON public.communication_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

ALTER TABLE public.communication_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage communication_events" ON public.communication_events;
CREATE POLICY "Service role can manage communication_events"
  ON public.communication_events FOR ALL
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.sms_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  consent_status TEXT NOT NULL CHECK (consent_status IN ('opted_in', 'opted_out')),
  source TEXT,
  consent_text TEXT,
  consent_version TEXT,
  provider TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_consent_events_person
  ON public.sms_consent_events (person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_consent_events_phone
  ON public.sms_consent_events (phone, created_at DESC);

ALTER TABLE public.sms_consent_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage sms_consent_events" ON public.sms_consent_events;
CREATE POLICY "Service role can manage sms_consent_events"
  ON public.sms_consent_events FOR ALL
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_moments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_outbox TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_consent_events TO service_role;

COMMENT ON TABLE public.campaign_moments IS 'People-native registry for campaign moments across email and SMS.';
COMMENT ON TABLE public.communication_outbox IS 'Queue of outbound email/SMS messages before provider delivery.';
COMMENT ON TABLE public.communication_events IS 'Provider and internal feedback events for outbound communications.';
COMMENT ON TABLE public.sms_consent_events IS 'Audit trail for SMS opt-in and opt-out consent changes.';
