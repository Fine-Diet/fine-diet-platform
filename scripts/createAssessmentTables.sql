-- Create assessment tables for Fine Diet Mini-Assessments Funnel System
-- Run this in Supabase Dashboard → SQL Editor
-- Updated with Atlas reliability additions: assessment_events, webhook_outbox, deny-by-default RLS

-- ============================================================================
-- assessment_submissions
-- Stores completed assessments only
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.assessment_submissions (
  id UUID PRIMARY KEY,
  assessment_type TEXT NOT NULL,
  assessment_version INTEGER NOT NULL DEFAULT 1,
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  
  answers JSONB NOT NULL,
  score_map JSONB NOT NULL,
  normalized_score_map JSONB NOT NULL,
  primary_avatar TEXT NOT NULL,
  secondary_avatar TEXT,
  confidence_score NUMERIC NOT NULL,
  
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for assessment_submissions
CREATE INDEX IF NOT EXISTS idx_assessment_submissions_type ON public.assessment_submissions(assessment_type);
CREATE INDEX IF NOT EXISTS idx_assessment_submissions_session ON public.assessment_submissions(session_id);
CREATE INDEX IF NOT EXISTS idx_assessment_submissions_user ON public.assessment_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_submissions_created ON public.assessment_submissions(created_at DESC);

-- ============================================================================
-- assessment_sessions
-- Tracks in-progress + abandonment
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.assessment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_type TEXT NOT NULL,
  assessment_version INTEGER NOT NULL DEFAULT 1,
  session_id TEXT NOT NULL UNIQUE,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_question_index INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'started',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_assessment_sessions_status CHECK (status IN ('started', 'abandoned', 'completed'))
);

-- Indexes for assessment_sessions
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_session ON public.assessment_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_status ON public.assessment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_type ON public.assessment_sessions(assessment_type);

-- ============================================================================
-- assessment_events
-- Stores analytics events for assessments
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.assessment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_type TEXT NOT NULL,
  assessment_version INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  primary_avatar TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for assessment_events
CREATE INDEX IF NOT EXISTS idx_assessment_events_session ON public.assessment_events(session_id);
CREATE INDEX IF NOT EXISTS idx_assessment_events_type ON public.assessment_events(assessment_type);
CREATE INDEX IF NOT EXISTS idx_assessment_events_event_type ON public.assessment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_assessment_events_created ON public.assessment_events(created_at DESC);

-- ============================================================================
-- webhook_outbox
-- Outbox pattern for reliable webhook delivery
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.webhook_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.assessment_submissions(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT check_webhook_outbox_status CHECK (status IN ('pending', 'sent', 'failed')),
  last_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- Indexes for webhook_outbox
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_status ON public.webhook_outbox(status);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_submission ON public.webhook_outbox(submission_id);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_created ON public.webhook_outbox(created_at);

-- ============================================================================
-- avatar_insights
-- Holds avatar content (placeholder copy allowed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.avatar_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_type TEXT NOT NULL,
  avatar_id TEXT NOT NULL,
  label TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_patterns JSONB,
  first_focus_areas JSONB,
  method_positioning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_avatar_insight UNIQUE(assessment_type, avatar_id)
);

-- Indexes for avatar_insights
CREATE INDEX IF NOT EXISTS idx_avatar_insights_type_avatar ON public.avatar_insights(assessment_type, avatar_id);

-- ============================================================================
-- Row Level Security (RLS) - Deny-by-default
-- ============================================================================

-- Enable RLS on all tables (deny-by-default)
ALTER TABLE public.assessment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_insights ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "anon_insert_assessment_submissions" ON public.assessment_submissions;
DROP POLICY IF EXISTS "service_role_manage_assessment_submissions" ON public.assessment_submissions;
DROP POLICY IF EXISTS "anon_access_assessment_sessions" ON public.assessment_sessions;
DROP POLICY IF EXISTS "service_role_manage_assessment_sessions" ON public.assessment_sessions;
DROP POLICY IF EXISTS "anon_read_avatar_insights" ON public.avatar_insights;
DROP POLICY IF EXISTS "service_role_manage_avatar_insights" ON public.avatar_insights;

-- Policies for assessment_submissions
-- Allow anonymous inserts (for public assessments)
CREATE POLICY "anon_insert_assessment_submissions"
  ON public.assessment_submissions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "service_role_manage_assessment_submissions"
  ON public.assessment_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policies for assessment_sessions
-- Allow anonymous inserts and updates
CREATE POLICY "anon_insert_assessment_sessions"
  ON public.assessment_sessions
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_assessment_sessions"
  ON public.assessment_sessions
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "service_role_manage_assessment_sessions"
  ON public.assessment_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policies for assessment_events
-- Allow anonymous inserts (best-effort event tracking)
CREATE POLICY "anon_insert_assessment_events"
  ON public.assessment_events
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "service_role_manage_assessment_events"
  ON public.assessment_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policies for webhook_outbox
-- Deny all access except service role (internal table)
CREATE POLICY "service_role_manage_webhook_outbox"
  ON public.webhook_outbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policies for avatar_insights
-- Allow public read access
CREATE POLICY "anon_read_avatar_insights"
  ON public.avatar_insights
  FOR SELECT
  TO anon
  USING (true);

-- Allow service role full access
CREATE POLICY "service_role_manage_avatar_insights"
  ON public.avatar_insights
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Grants
-- ============================================================================
GRANT INSERT ON public.assessment_submissions TO anon;
GRANT INSERT, UPDATE ON public.assessment_sessions TO anon;
GRANT INSERT ON public.assessment_events TO anon;
GRANT SELECT ON public.avatar_insights TO anon;

GRANT ALL ON public.assessment_submissions TO service_role;
GRANT ALL ON public.assessment_sessions TO service_role;
GRANT ALL ON public.assessment_events TO service_role;
GRANT ALL ON public.webhook_outbox TO service_role;
GRANT ALL ON public.avatar_insights TO service_role;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE public.assessment_submissions IS 'Stores completed assessments only. Includes scoring results and avatar assignments. Uses client-generated UUID for idempotency.';
COMMENT ON TABLE public.assessment_sessions IS 'Tracks in-progress assessments and abandonment for analytics.';
COMMENT ON TABLE public.assessment_events IS 'Stores analytics events for assessments. Best-effort insertion.';
COMMENT ON TABLE public.webhook_outbox IS 'Outbox pattern for reliable webhook delivery. Processed by background worker.';
COMMENT ON TABLE public.avatar_insights IS 'Holds avatar content and insights for each assessment type.';
