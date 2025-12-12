/**
 * Backfill Profiles Script
 * 
 * Creates profiles rows for existing auth.users who don't have a profile yet.
 * This is a one-time migration script to ensure all existing users appear in /admin/people.
 * 
 * Usage: npm run backfill-profiles
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing required environment variables: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
}

if (!supabaseServiceRoleKey) {
  throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function backfillProfiles() {
  console.log('Starting profiles backfill...\n');

  try {
    // Fetch all auth users
    console.log('Fetching all auth users...');
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      throw new Error(`Failed to fetch auth users: ${authError.message}`);
    }

    if (!authUsers || authUsers.users.length === 0) {
      console.log('No auth users found.');
      return;
    }

    console.log(`Found ${authUsers.users.length} auth users.\n`);

    // Fetch all existing profiles
    console.log('Fetching existing profiles...');
    const { data: existingProfiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id');

    if (profilesError) {
      throw new Error(`Failed to fetch existing profiles: ${profilesError.message}`);
    }

    const existingProfileIds = new Set((existingProfiles || []).map((p) => p.id));
    console.log(`Found ${existingProfileIds.size} existing profiles.\n`);

    // Find users without profiles
    const usersWithoutProfiles = authUsers.users.filter(
      (user) => !existingProfileIds.has(user.id)
    );

    if (usersWithoutProfiles.length === 0) {
      console.log('✅ All users already have profiles. No backfill needed.');
      return;
    }

    console.log(`Found ${usersWithoutProfiles.length} users without profiles.\n`);
    console.log('Creating profiles...\n');

    let successCount = 0;
    let errorCount = 0;

    // Insert profiles for missing users
    for (const user of usersWithoutProfiles) {
      try {
        const { error: insertError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: user.id,
            role: 'user', // Default role for existing users
          });

        if (insertError) {
          console.error(`❌ Failed to create profile for ${user.email || user.id}:`, {
            message: insertError.message,
            code: insertError.code,
            details: insertError.details,
            hint: insertError.hint,
          });
          errorCount++;
        } else {
          console.log(`✅ Created profile for ${user.email || user.id}`);
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Error creating profile for ${user.email || user.id}:`, err);
        errorCount++;
      }
    }

    console.log('\n--- Backfill Summary ---');
    console.log(`✅ Successfully created: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total processed: ${usersWithoutProfiles.length}`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

backfillProfiles()
  .then(() => {
    console.log('\n✅ Backfill completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Backfill failed:', error);
    process.exit(1);
  });

