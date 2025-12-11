# Atlas Prompt: Create Profiles Table in Supabase

Copy and paste this prompt into Atlas:

---

**Task:** Help me create the `profiles` table in my Supabase database to enable role-based access control for admin routes.

**Context:**
- I'm working on a Next.js application with Supabase authentication
- I need to create a `profiles` table that stores user roles ('user', 'editor', 'admin')
- The table should link to `auth.users` via a foreign key
- I need proper Row Level Security (RLS) policies so the service role can read/manage profiles for admin access checks

**Requirements:**
1. Create a `profiles` table in the `public` schema with:
   - `id` (UUID, primary key) - references `auth.users(id)` with CASCADE delete
   - `role` (TEXT) - must be one of: 'user', 'editor', 'admin' (default: 'user')
   - `updated_at` (TIMESTAMPTZ) - defaults to NOW()

2. Create an index on the `role` column for faster lookups

3. Enable Row Level Security (RLS) on the table

4. Create RLS policies:
   - Allow service role to read all profiles (needed for middleware/API role checks)
   - Allow service role to insert/update profiles (needed for admin setup scripts)
   - Optionally: Allow users to read their own profile

5. Grant necessary permissions to `authenticated` and `service_role` roles

**Instructions:**
- Provide the complete SQL script I can run in Supabase Dashboard → SQL Editor
- Include comments explaining each section
- Use `IF NOT EXISTS` clauses where appropriate to make it idempotent
- Ensure the script can be run multiple times safely (won't error if table already exists)

**Expected Output:**
A complete SQL script that I can copy/paste into Supabase SQL Editor and run to create the table, indexes, policies, and permissions.

---

