-- ============================================================================
-- Journal V1 Phase 2: Create journal_entries and journal_meal_templates tables
-- 
-- Run this migration in Supabase SQL Editor:
-- 1. Copy entire script
-- 2. Run in Supabase Dashboard → SQL Editor
-- ============================================================================

-- ============================================================================
-- Table: journal_entries
-- Stores per-user journal entries (food intake, water, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL DEFAULT 'intake',
  -- occurred_at is the user's local timestamp for when this entry "happened"
  -- Stored as timestamptz, client sends ISO string with their local time
  occurred_at TIMESTAMPTZ NOT NULL,
  -- payload contains entry details: name, quantity, unit, macros, etc.
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient day-based queries per user
CREATE INDEX IF NOT EXISTS idx_journal_entries_person_occurred 
  ON journal_entries(person_id, occurred_at);

-- Index for efficient queries by entry type
CREATE INDEX IF NOT EXISTS idx_journal_entries_person_type 
  ON journal_entries(person_id, entry_type);

-- ============================================================================
-- Table: journal_meal_templates
-- Stores per-user saved meal templates (collections of items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS journal_meal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- items is an array of { id, name, quantity, unit } objects
  items JSONB NOT NULL DEFAULT '[]',
  -- Optional: nutrition_density score computed from items
  nutrition_density INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing templates per user, sorted by most recent
CREATE INDEX IF NOT EXISTS idx_journal_meal_templates_person_updated 
  ON journal_meal_templates(person_id, updated_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- Users can only access their own data
-- ============================================================================

-- Enable RLS on both tables
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_meal_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own entries
-- Note: We use service_role for API routes, so RLS is bypassed there.
-- These policies are for direct client access if needed later.
CREATE POLICY "Users can read own journal entries"
  ON journal_entries
  FOR SELECT
  USING (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own journal entries"
  ON journal_entries
  FOR INSERT
  WITH CHECK (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own journal entries"
  ON journal_entries
  FOR UPDATE
  USING (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own journal entries"
  ON journal_entries
  FOR DELETE
  USING (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

-- Policy: Users can manage their own meal templates
CREATE POLICY "Users can read own meal templates"
  ON journal_meal_templates
  FOR SELECT
  USING (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own meal templates"
  ON journal_meal_templates
  FOR INSERT
  WITH CHECK (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own meal templates"
  ON journal_meal_templates
  FOR UPDATE
  USING (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own meal templates"
  ON journal_meal_templates
  FOR DELETE
  USING (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- Trigger: Auto-update updated_at on row changes
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_journal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for journal_entries
DROP TRIGGER IF EXISTS journal_entries_updated_at ON journal_entries;
CREATE TRIGGER journal_entries_updated_at
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_journal_updated_at();

-- Trigger for journal_meal_templates
DROP TRIGGER IF EXISTS journal_meal_templates_updated_at ON journal_meal_templates;
CREATE TRIGGER journal_meal_templates_updated_at
  BEFORE UPDATE ON journal_meal_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_journal_updated_at();

-- ============================================================================
-- Verification: Check tables were created
-- ============================================================================

-- Run these queries to verify:
-- SELECT * FROM journal_entries LIMIT 1;
-- SELECT * FROM journal_meal_templates LIMIT 1;
-- \d journal_entries
-- \d journal_meal_templates
