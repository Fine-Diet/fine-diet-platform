# Admin Access Setup Guide

This guide explains how to set up admin/editor role access for users in the Fine Diet platform.

## How Role Access Works

1. **Authentication**: Users log in using Supabase Auth (same system for both client and admin)
2. **Role Storage**: Roles are stored in the `profiles` table in Supabase
3. **Role Check**: Middleware and API routes check the `profiles.role` field
4. **Access Levels**:
   - `'user'` - Regular customers (default, no admin access)
   - `'editor'` - Can access admin dashboard and edit content
   - `'admin'` - Same as editor (currently no distinction)

## Setting Up Admin Access

### Option 1: Using the Setup Script (Recommended)

1. **Make sure the user has an account**:
   - They need to sign up first using the account drawer or `/login` page
   - After signup, their account will exist in `auth.users`

2. **Run the setup script**:
   ```bash
   tsx scripts/setupAdminAccess.ts <email> <role>
   ```

   Examples:
   ```bash
   # Make user an admin
   tsx scripts/setupAdminAccess.ts admin@myfinediet.com admin
   
   # Make user an editor
   tsx scripts/setupAdminAccess.ts editor@myfinediet.com editor
   ```

3. **Verify access**:
   - User should now be able to log in at `/login`
   - After login, they'll be redirected to `/admin` dashboard

### Option 2: Using Supabase Dashboard (SQL Editor)

1. **Open Supabase Dashboard** → SQL Editor

2. **Find the user's ID**:
   ```sql
   SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
   ```

3. **Create or update the profile**:
   ```sql
   -- Insert new profile (if doesn't exist)
   INSERT INTO profiles (id, role)
   VALUES ('<user-id-from-step-2>', 'admin')
   ON CONFLICT (id) 
   DO UPDATE SET role = 'admin', updated_at = NOW();
   ```

   Or for editor:
   ```sql
   INSERT INTO profiles (id, role)
   VALUES ('<user-id-from-step-2>', 'editor')
   ON CONFLICT (id) 
   DO UPDATE SET role = 'editor', updated_at = NOW();
   ```

### Option 3: Using Supabase Dashboard (Table Editor)

1. **Go to Supabase Dashboard** → Table Editor → `profiles` table

2. **Check if profile exists**:
   - Look for a row with `id` matching the user's auth ID
   - If no row exists, click "Insert row"

3. **Set the role**:
   - `id`: User's auth ID (from `auth.users` table)
   - `role`: `'admin'` or `'editor'`
   - Save the row

## Profiles Table Schema

The `profiles` table should have this structure:

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'editor', 'admin')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_profiles_role ON profiles(role);
```

## Troubleshooting

### "User not found"
- The user needs to sign up first
- Check that they've confirmed their email (if email confirmation is enabled)
- Verify the email address is correct

### "Profile doesn't exist"
- This is normal for new users
- The script will create the profile automatically
- Or use the SQL/Table Editor methods above

### "Can't access /admin after setting role"
1. **Check the role was saved**:
   ```sql
   SELECT * FROM profiles WHERE id = '<user-id>';
   ```

2. **Verify middleware is working**:
   - Check browser console for errors
   - Try logging out and back in
   - Clear browser cookies and try again

3. **Check Supabase connection**:
   - Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
   - Check that RLS policies allow reading from `profiles` table

### "Permission denied" errors
- Make sure RLS (Row Level Security) policies allow reading `profiles` table
- The middleware uses the anon key, so it needs read access to `profiles`

## Security Notes

⚠️ **Important**: 
- Only grant `'admin'` or `'editor'` roles to trusted users
- The service role key has full database access - keep it secret
- Consider adding audit logging for role changes in production

## Quick Reference

**Check a user's current role**:
```sql
SELECT p.id, u.email, p.role 
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'your-email@example.com';
```

**List all admins/editors**:
```sql
SELECT u.email, p.role 
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role IN ('admin', 'editor')
ORDER BY p.role, u.email;
```

**Remove admin access** (set back to user):
```sql
UPDATE profiles 
SET role = 'user', updated_at = NOW()
WHERE id = '<user-id>';
```

