import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  upsertPerson,
  logEvent,
} from '@/lib/peopleService';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

// Validation schema
const linkPersonSchema = z.object({
  authUserId: z.string().uuid('Invalid auth user ID'),
  email: z.string().email('Invalid email address'),
});

type LinkPersonData = z.infer<typeof linkPersonSchema>;

/**
 * POST /api/account/link-person
 * 
 * Links an authenticated user (auth.users) to a people record.
 * 
 * Behavior:
 * - Finds existing person by email (normalized)
 * - If found: updates auth_user_id if not already set
 * - If not found: creates new person record with auth_user_id
 * - Logs a 'profile_update' event with source 'auth_linkage'
 * 
 * This should be called after successful login/signup to ensure
 * the auth user is linked to their profile data.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = linkPersonSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data: LinkPersonData = validationResult.data;

    // Verify the auth user exists
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(
      data.authUserId
    );

    if (authError || !authUser?.user) {
      return NextResponse.json(
        { error: 'Invalid auth user' },
        { status: 404 }
      );
    }

    // Verify the email matches (security check)
    const normalizedEmail = data.email.trim().toLowerCase();
    if (authUser.user.email?.toLowerCase() !== normalizedEmail) {
      return NextResponse.json(
        { error: 'Email mismatch' },
        { status: 400 }
      );
    }

    // Check if person already exists with this auth_user_id
    const { data: existingByAuthId } = await supabaseAdmin
      .from('people')
      .select('*')
      .eq('auth_user_id', data.authUserId)
      .maybeSingle();

    if (existingByAuthId) {
      // Person already linked to this auth user
      return NextResponse.json({
        ok: true,
        person: existingByAuthId,
        linked: true,
      });
    }

    // Check if person exists by email (but not yet linked)
    const { data: existingByEmail } = await supabaseAdmin
      .from('people')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    let person;
    let wasExisting = false;
    
    if (existingByEmail) {
      // Person exists but not linked - update to link them
      if (existingByEmail.auth_user_id) {
        // This shouldn't happen, but handle gracefully
        return NextResponse.json({
          ok: true,
          person: existingByEmail,
          linked: true,
        });
      }

      wasExisting = true;

      // Update existing person with auth_user_id
      const { data: updatedPerson, error: updateError } = await supabaseAdmin
        .from('people')
        .update({
          auth_user_id: data.authUserId,
          status: 'active_user', // Upgrade to active_user when they create account
          last_source: 'account_creation',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingByEmail.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to link existing person: ${updateError.message}`);
      }

      person = updatedPerson;
    } else {
      // Create new person with auth_user_id
      person = await upsertPerson({
        email: normalizedEmail,
        authUserId: data.authUserId,
        status: 'active_user', // Upgrade to active_user when they create account
        source: 'account_creation',
      });
    }

    // Log the linkage event
    await logEvent({
      personId: person.id,
      eventType: 'profile_update',
      source: 'auth_linkage',
      channel: 'web',
      metadata: {
        authUserId: data.authUserId,
        action: wasExisting ? 'linked_existing' : 'created_new',
      },
    });

    // Ensure a profiles row exists for this user (for role management)
    // This runs after person linking so login doesn't break if it fails
    try {
      // Check if profile already exists
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', data.authUserId)
        .maybeSingle();

      if (!existingProfile) {
        // Profile doesn't exist - insert with default role 'user'
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: data.authUserId,
            role: 'user', // Default role for new users
          });

        if (profileError) {
          // Log warning but don't fail the request
          console.warn(
            `Failed to create profile for user ${data.authUserId}:`,
            profileError.message
          );
        }
      }
      // If profile exists, do nothing - preserve existing role (admin/editor/user)
    } catch (profileErr) {
      // Log warning but don't fail the request
      console.warn(
        `Error ensuring profile exists for user ${data.authUserId}:`,
        profileErr
      );
    }

    return NextResponse.json({
      ok: true,
      person,
      linked: true,
    });
  } catch (error) {
    console.error('Link person API error:', error);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}

