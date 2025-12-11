/**
 * Setup Admin Access Script
 * 
 * This script helps you set up admin/editor role access for a user in Supabase.
 * 
 * Usage:
 *   1. Make sure you have SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env.local
 *   2. Run: tsx scripts/setupAdminAccess.ts <email> <role>
 * 
 * Examples:
 *   tsx scripts/setupAdminAccess.ts admin@myfinediet.com admin
 *   tsx scripts/setupAdminAccess.ts editor@myfinediet.com editor
 * 
 * Roles: 'user' | 'editor' | 'admin'
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });
config(); // Also load .env if it exists

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nPlease add these to your .env.local file.');
  process.exit(1);
}

// Get command line arguments
const email = process.argv[2];
const role = process.argv[3] as 'user' | 'editor' | 'admin';

if (!email || !role) {
  console.error('❌ Usage: tsx scripts/setupAdminAccess.ts <email> <role>');
  console.error('   Example: tsx scripts/setupAdminAccess.ts admin@myfinediet.com admin');
  console.error('\nValid roles: user, editor, admin');
  process.exit(1);
}

if (!['user', 'editor', 'admin'].includes(role)) {
  console.error(`❌ Invalid role: ${role}`);
  console.error('Valid roles: user, editor, admin');
  process.exit(1);
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function setupAdminAccess() {
  console.log(`\n🔍 Looking up user: ${email}...\n`);

  try {
    // Step 1: Find the user in auth.users
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError.message);
      process.exit(1);
    }

    const user = authUsers.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      console.error(`❌ User with email ${email} not found in auth.users`);
      console.error('\n💡 The user needs to sign up first using the account drawer or login page.');
      console.error('   After they create an account, run this script again.');
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);

    // Step 2: Check if profile exists
    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      // PGRST116 = not found, which is okay
      console.error('❌ Error checking profile:', profileError.message);
      process.exit(1);
    }

    // Step 3: Upsert profile with role
    const profileData = {
      id: user.id,
      role: role,
      updated_at: new Date().toISOString(),
    };

    const { data: profile, error: upsertError } = await supabase
      .from('profiles')
      .upsert(profileData, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (upsertError) {
      console.error('❌ Error updating profile:', upsertError.message);
      console.error('\n💡 Make sure the profiles table exists and has the correct schema:');
      console.error('   - id (uuid, primary key, references auth.users(id))');
      console.error('   - role (text, check constraint: role in (\'user\', \'editor\', \'admin\'))');
      process.exit(1);
    }

    console.log(`\n✅ Success! User ${email} now has role: ${role}`);
    console.log(`\n📋 Profile details:`);
    console.log(`   - ID: ${profile.id}`);
    console.log(`   - Role: ${profile.role}`);
    console.log(`   - Updated: ${profile.updated_at || 'now'}`);

    if (role === 'admin' || role === 'editor') {
      console.log(`\n🎉 This user can now access:`);
      console.log(`   - /admin (Admin Dashboard)`);
      console.log(`   - /admin/navigation`);
      console.log(`   - /admin/home`);
      console.log(`   - /admin/waitlist`);
      console.log(`   - /admin/global`);
      console.log(`   - /admin/footer`);
      console.log(`   - /admin/products`);
      console.log(`   - All /api/admin/* routes`);
    }

    console.log('\n');
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

setupAdminAccess();

