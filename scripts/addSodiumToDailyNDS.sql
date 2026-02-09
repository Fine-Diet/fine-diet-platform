-- Migration: Add sodium_10 column to daily_nds table
-- Required for NDS scoring formula update: sodium subscore (5% weight)
-- Run this in Supabase SQL Editor

-- Add sodium_10 column with neutral default (5) for existing rows
ALTER TABLE daily_nds
  ADD COLUMN IF NOT EXISTS sodium_10 NUMERIC DEFAULT 5;

-- Update comment
COMMENT ON COLUMN daily_nds.sodium_10 IS 'Sodium subscore (0-10). Ideal range 1500-2300mg = 10. Weight: 5%';
