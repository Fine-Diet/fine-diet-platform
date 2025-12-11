-- Create profiles table for role-based access control
-- Run this in Supabase Dashboard → SQL Editor

-- Create the profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'editor', 'admin')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Create policy to allow service role to read all profiles (for middleware/API)
-- This is needed for the admin access checks
CREATE POLICY "Service role can read all profiles"
  ON public.profiles
  FOR SELECT
  USING (true);

-- Create policy to allow service role to insert/update profiles
-- This is needed for the setup script
CREATE POLICY "Service role can manage profiles"
  ON public.profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO service_role;

-- Add comment
COMMENT ON TABLE public.profiles IS 'User profiles with role-based access control. Roles: user (default), editor, admin.';

