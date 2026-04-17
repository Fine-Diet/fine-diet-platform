-- ============================================================================
-- Email Campaigns Table Migration
-- ============================================================================
-- Run via Supabase SQL Editor or via MCP apply_migration.
-- This migration was applied via MCP on 2026-04-14.
--
-- The email_campaigns table stores Fine Diet marketing campaign drafts,
-- supporting the /admin/campaigns UI for authoring, preview, and proof sends.
--
-- Send infrastructure (n8n + /api/editorial/send) remains unchanged;
-- this table feeds that system with structured campaign data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  campaign_type         TEXT NOT NULL DEFAULT 'editorial'
                          CHECK (campaign_type IN ('editorial', 'nurture', 'announcement', 'promotional')),
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'in_review', 'approved', 'scheduled', 'sent', 'archived')),
  template_key          TEXT NOT NULL DEFAULT 'fine_print_weekly',
  template_id           TEXT,
  subject               TEXT NOT NULL DEFAULT '',
  preview_text          TEXT NOT NULL DEFAULT '',
  content_json          JSONB NOT NULL DEFAULT '{}',
  hero_image_url        TEXT,
  hero_image_asset_id   UUID,
  audience_key          TEXT NOT NULL DEFAULT 'fine_print_post_nurture',
  scheduled_for         TIMESTAMPTZ,
  created_by_person_id  UUID,
  approved_by_person_id UUID,
  sent_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status
  ON public.email_campaigns(status);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_updated_at
  ON public.email_campaigns(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_campaign_type
  ON public.email_campaigns(campaign_type);

-- RLS: service role only (admin API uses supabaseAdmin which bypasses RLS)
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service role full access to email_campaigns"
  ON public.email_campaigns FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

-- content_json shape:
-- {
--   "headline": string,
--   "body": string,
--   "ctaText": string,
--   "ctaUrl": string
-- }
