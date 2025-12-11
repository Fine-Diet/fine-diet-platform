# Create Profiles Table

The `profiles` table is required for role-based access control. Follow these steps:

## Option 1: Using Supabase Dashboard (Recommended)

1. **Go to your Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New query"

3. **Run the SQL script**
   - Copy the contents of `scripts/createProfilesTable.sql`
   - Paste into the SQL Editor
   - Click "Run" (or press Cmd/Ctrl + Enter)

4. **Verify the table was created**
   - Go to "Table Editor" in the left sidebar
   - You should see `profiles` table listed
   - It should have columns: `id`, `role`, `updated_at`

5. **Run the setup script again**
   ```bash
   npm run setup-admin rashadtyler@me.com admin
   ```

## Option 2: Using Supabase CLI (if you have it installed)

```bash
supabase db push
```

## What This Creates

- **profiles table** with:
  - `id` (UUID, primary key, references auth.users)
  - `role` (TEXT, default 'user', must be 'user', 'editor', or 'admin')
  - `updated_at` (timestamp)

- **Indexes** for faster queries
- **RLS policies** for security:
  - Users can read their own profile
  - Service role can read/manage all profiles (needed for admin checks)

## After Creating the Table

Once the table exists, you can:
1. Run the setup script: `npm run setup-admin rashadtyler@me.com admin`
2. Or manually insert via SQL:
   ```sql
   INSERT INTO profiles (id, role)
   VALUES ('ad4805d2-b9ec-4bb8-a9a1-f50e5bed9d9b', 'admin')
   ON CONFLICT (id) DO UPDATE SET role = 'admin';
   ```

